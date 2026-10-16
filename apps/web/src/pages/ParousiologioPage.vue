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
            <div class="row items-center q-gutter-xs no-wrap">
              <!-- Ποιος άλλος είναι τώρα σε αυτή τη συγκέντρωση. -->
              <CollabPresence :peers="room.peers.value" />
              <SaveStatus :status="saveStatus" @retry="saveNow" />
            </div>
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
  collabDocument,
  type KladosType,
  type ParousiaStatus,
  type MemberKind,
} from '@trifylli/shared';
import CollabPresence from '../components/CollabPresence.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import { useLiveReload } from '../composables/useLiveChanges';
import { markEntries, mergeMarks, settle, type PendingMark } from '../lib/attendance';
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
  { forbiddenPage: true, cacheKey: `parousiologio:${id}` },
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
/**
 * Οι σημάνσεις που δεν έχουν σταλεί ακόμη, με τη στιγμή που πατήθηκαν. Μόνο
 * αυτές φεύγουν (βλ. `markEntries`) — ποτέ όλο το φύλλο της οθόνης.
 */
const pending = reactive(new Map<string, PendingMark>());
const dirty = computed(() => pending.size > 0);

const saveStatus = ref<SaveState>('clean');
let timer: ReturnType<typeof setTimeout> | null = null;

/** Από τον server — και ξανά όταν σημειώνει κάποιος άλλος (ζωντανά): οι δικές μας που δεν στάλθηκαν μένουν. */
watch(
  sheet,
  (value) => {
    if (!value) return;
    const next = mergeMarks(value.entries, pending);
    for (const key of Object.keys(marks)) if (!(key in next)) delete marks[key];
    Object.assign(marks, next);
  },
  { immediate: true },
);

// ── Ζωντανά: ποιος άλλος σημειώνει, και οι σημάνσεις του ──
const room = useCollabDoc(collabDocument.syggentrwsh(id), useCollabMe(), { persist: false });
useLiveReload(['parousiologio'], reload, { subscribe: room.onChange });

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

function setMark(memberId: string, status: ParousiaStatus | undefined, at: string): void {
  marks[memberId] = status;
  // Αναίρεση σήμανσης που δεν στάλθηκε: δεν φεύγει τίποτα. Ο server δεν σβήνει
  // καταχωρήσεις — μια σταλμένη σήμανση αλλάζει μόνο με άλλη σήμανση.
  if (status) pending.set(memberId, { status, recordedAt: at });
  else pending.delete(memberId);
  scheduleSave();
}

function mark(memberId: string, status: ParousiaStatus): void {
  // Δεύτερο πάτημα στην ίδια επιλογή την αναιρεί — βοηθά όταν πατηθεί κατά λάθος.
  setMark(memberId, marks[memberId] === status ? undefined : status, new Date().toISOString());
}

function markAll(status: ParousiaStatus): void {
  const at = new Date().toISOString();
  for (const entry of sheet.value?.entries ?? []) setMark(entry.memberId, status, at);
}

/** Αδειάζει την οθόνη (και ό,τι δεν στάλθηκε) — όχι τον server. */
function clearAll(): void {
  for (const key of Object.keys(marks)) delete marks[key];
  pending.clear();
  scheduleSave();
}

// ───────────────────────── Αυτόματη αποθήκευση ─────────────────────────

function scheduleSave(): void {
  saveStatus.value = pending.size ? 'pending' : 'clean';
  if (timer) clearTimeout(timer);
  if (pending.size) timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
}

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

  const entries = markEntries(pending);
  saveStatus.value = 'saving';
  try {
    // `replace`: κάθε αποστολή έχει **όλες** τις σημάνσεις που δεν έχουν φτάσει
    // ακόμη, οπότε μια παλιότερη στην ουρά δεν προσθέτει τίποτα.
    const result = await offline.submit<{ written: number; stale: unknown[] }>(
      'PUT',
      `/parousiologio/syggentrwsh/${id}`,
      { entries, recordedAt: new Date().toISOString() },
      { replace: true },
    );

    if (result.queued) {
      // Στην ουρά της συσκευής: φεύγει μόνη της με την επιστροφή του δικτύου. Οι
      // σημάνσεις μένουν «σε αναμονή»: η επόμενη αποστολή (που αντικαθιστά αυτή
      // στην ουρά) πρέπει να τις έχει όλες.
      saveStatus.value = 'offline';
      return;
    }

    settle(pending, entries);
    saveStatus.value = pending.size ? 'pending' : 'saved';

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
