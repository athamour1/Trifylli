<template>
  <q-page padding>
    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="sheet">
        <div class="row items-start justify-between q-mb-sm">
          <div>
            <div class="text-subtitle1 text-weight-medium">
              {{ formatDate(sheet.syggentrwsh.date) }} · {{ KLADOS_LABEL[sheet.syggentrwsh.kladosType] }}
            </div>
          </div>
          <div class="column items-end q-gutter-xs">
            <q-chip
              :color="summary.marked === sheet.entries.length ? 'positive' : 'grey-6'"
              text-color="white"
              class="q-ma-none"
            >
              {{ summary.marked }} / {{ sheet.entries.length }}
            </q-chip>
            <SaveStatus :status="saveStatus" @retry="saveNow" />
          </div>
        </div>

        <!-- Η γραμμή συνόλων ενημερώνεται καθώς σημειώνεις: το στέλεχος βλέπει
             τι έχει μείνει χωρίς να μετράει. -->
        <div class="row q-gutter-xs q-mb-md">
          <q-chip
            v-for="status in STATUSES"
            :key="status"
            dense
            :color="STATUS_COLOR[status]"
            text-color="white"
          >
            {{ PAROUSIA_LABEL[status] }}: {{ summary.counts[status] }}
          </q-chip>
        </div>

        <div class="q-mb-md">
          <q-btn flat dense no-caps icon="done_all" label="Όλοι παρόντες" @click="markAll('PAROUSIA')" />
          <q-btn flat dense no-caps icon="clear_all" label="Καθαρισμός" @click="clearAll" />
        </div>

        <q-list bordered separator class="rounded-borders">
          <q-item v-for="entry in sheet.entries" :key="entry.memberId" class="parousia-row">
            <q-item-section>
              <q-item-label>{{ entry.lastName }} {{ entry.firstName }}</q-item-label>
              <q-item-label caption>
                {{ entry.subUnit ?? MEMBER_KIND_LABEL[entry.kind] }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn-group flat>
                <q-btn
                  v-for="status in STATUSES"
                  :key="status"
                  :icon="STATUS_ICON[status]"
                  :color="marks[entry.memberId] === status ? STATUS_COLOR[status] : 'grey-5'"
                  :flat="marks[entry.memberId] !== status"
                  :unelevated="marks[entry.memberId] === status"
                  :text-color="marks[entry.memberId] === status ? 'white' : undefined"
                  dense
                  :aria-label="PAROUSIA_LABEL[status]"
                  @click="mark(entry.memberId, status)"
                >
                  <q-tooltip>{{ PAROUSIA_LABEL[status] }}</q-tooltip>
                </q-btn>
              </q-btn-group>
            </q-item-section>
          </q-item>
        </q-list>

      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  PAROUSIA_LABEL,
  MEMBER_KIND_LABEL,
  type KladosType,
  type ParousiaStatus,
  type MemberKind,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { useKladosThemeStore } from '../stores/klados-theme';
import { ApiError, get } from '../lib/api';
import { formatDate } from '../lib/format';
import type { SaveState } from '../lib/save-state';
import { useOfflineStore } from '../stores/offline';

const kladosTheme = useKladosThemeStore();

interface Sheet {
  syggentrwsh: { id: string; date: string; title: string | null; kladosType: KladosType };
  entries: {
    memberId: string;
    firstName: string;
    lastName: string;
    kind: MemberKind;
    subUnit: string | null;
    status: ParousiaStatus | null;
    note: string | null;
  }[];
  completed: boolean;
}

const route = useRoute();
const $q = useQuasar();
const offline = useOfflineStore();
const id = String(route.params.id);

const STATUSES: ParousiaStatus[] = ['PAROUSIA', 'ARGOPORIA', 'DIKAIOLOGIMENI', 'APOUSIA'];

const STATUS_ICON: Record<ParousiaStatus, string> = {
  PAROUSIA: 'check',
  ARGOPORIA: 'schedule',
  DIKAIOLOGIMENI: 'event_busy',
  APOUSIA: 'close',
};

const STATUS_COLOR: Record<ParousiaStatus, string> = {
  PAROUSIA: 'positive',
  ARGOPORIA: 'warning',
  DIKAIOLOGIMENI: 'info',
  APOUSIA: 'negative',
};

const { data: sheet, loading, error, stale, reload } = useAsyncData(
  () => get<Sheet>(`/parousiologio/syggentrwsh/${id}`),
  { cacheKey: `parousiologio:${id}` },
);

// Η σελίδα ζει εκτός `/k/:klados`, οπότε το layout δεν ξέρει τον κλάδο της· τον
// δηλώνει μόνη της ώστε τα κουμπιά της να πάρουν το χρώμα του.
watch(
  () => (sheet.value ? (sheet.value.syggentrwsh.kladosType ?? null) : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

/** Πόσο περιμένουμε μετά το τελευταίο πάτημα πριν στείλουμε. */
const AUTOSAVE_DELAY_MS = 900;

/** Τοπική κατάσταση σημάνσεων· γεμίζει από το φύλλο και επιβιώνει offline. */
const marks = reactive<Record<string, ParousiaStatus | undefined>>({});

const saveStatus = ref<SaveState>('clean');
const dirty = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

/** Κρατά κλειστό τον watcher της αποθήκευσης όσο γεμίζει η φόρμα από τον server. */
let hydrating = false;

watch(
  sheet,
  (value) => {
    if (!value || dirty.value) return;
    hydrating = true;
    for (const entry of value.entries) {
      if (entry.status) marks[entry.memberId] = entry.status;
    }
    void Promise.resolve().then(() => {
      hydrating = false;
    });
  },
  { immediate: true },
);

const summary = computed(() => {
  const counts: Record<ParousiaStatus, number> = {
    PAROUSIA: 0,
    ARGOPORIA: 0,
    DIKAIOLOGIMENI: 0,
    APOUSIA: 0,
  };
  let marked = 0;
  for (const status of Object.values(marks)) {
    if (!status) continue;
    counts[status] += 1;
    marked += 1;
  }
  return { counts, marked };
});

function mark(memberId: string, status: ParousiaStatus): void {
  // Δεύτερο πάτημα στην ίδια επιλογή την αναιρεί — βοηθά όταν πατηθεί κατά λάθος.
  marks[memberId] = marks[memberId] === status ? undefined : status;
}

function markAll(status: ParousiaStatus): void {
  for (const entry of sheet.value?.entries ?? []) marks[entry.memberId] = status;
}

function clearAll(): void {
  for (const key of Object.keys(marks)) delete marks[key];
}

// ───────────────────────── Αυτόματη αποθήκευση ─────────────────────────

watch(
  marks,
  () => {
    if (hydrating) return;
    dirty.value = true;
    saveStatus.value = 'pending';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
  },
  { deep: true },
);

/**
 * Το `recordedAt` είναι η **στιγμή της συμπλήρωσης**, όχι της αποστολής.
 * Χωρίς αυτό, μια ουρά που αδειάζει ώρες αργότερα θα έσβηνε νεότερες διορθώσεις.
 */
async function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty.value || !sheet.value) return;

  const entries = Object.entries(marks)
    .filter((pair): pair is [string, ParousiaStatus] => pair[1] !== undefined)
    .map(([memberId, status]) => ({ memberId, status }));

  // Καμία σήμανση δεν σημαίνει τίποτα να σταλεί: το API γράφει καταχωρήσεις,
  // δεν τις σβήνει. Ο «Καθαρισμός» αδειάζει την οθόνη, όχι τον server.
  if (!entries.length) {
    dirty.value = false;
    saveStatus.value = 'clean';
    return;
  }

  saveStatus.value = 'saving';
  try {
    // `replace`: η οθόνη στέλνει κάθε φορά ολόκληρο το φύλλο, οπότε μια παλιότερη
    // εκδοχή στην ουρά δεν προσθέτει τίποτα — μόνο θόρυβο στον συγχρονισμό.
    const result = await offline.submit<{ written: number; stale: unknown[] }>(
      'PUT',
      `/parousiologio/syggentrwsh/${id}`,
      { entries, recordedAt: new Date().toISOString() },
      { replace: true },
    );

    dirty.value = false;

    if (result.queued) {
      saveStatus.value = 'offline';
      return;
    }

    saveStatus.value = 'saved';

    // Μόνο όταν ο server απέρριψε κάτι αξίζει διακοπή: σε κανονική αποθήκευση
    // μιλάει η ένδειξη, χωρίς ένα μήνυμα σε κάθε πάτημα.
    const skipped = result.data?.stale.length ?? 0;
    if (skipped > 0) {
      $q.notify({
        type: 'warning',
        message: `${skipped} καταχωρήσεις δεν εφαρμόστηκαν — υπάρχει νεότερη εκδοχή.`,
      });
    }
  } catch (err) {
    saveStatus.value = 'error';
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.',
    });
  }
}

// Επιστροφή δικτύου: ό,τι δεν πρόλαβε να φύγει, φεύγει τώρα.
watch(
  () => offline.online,
  (online) => {
    if (online && dirty.value) void saveNow();
  },
);

onBeforeRouteLeave(() => {
  if (dirty.value) void saveNow();
});

function warnOnUnload(event: BeforeUnloadEvent): void {
  if (dirty.value) event.preventDefault();
}

window.addEventListener('beforeunload', warnOnUnload);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  window.removeEventListener('beforeunload', warnOnUnload);
});
</script>
