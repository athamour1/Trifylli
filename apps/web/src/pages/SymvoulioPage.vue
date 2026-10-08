<template>
  <q-page padding>
    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <div class="row items-start no-wrap q-mb-md">
          <q-btn flat round dense icon="arrow_back" color="klados" class="q-mr-sm q-mt-xs" @click="goBack">
            <q-tooltip>Πίσω στη λίστα</q-tooltip>
          </q-btn>
          <div class="col row items-start justify-between q-col-gutter-sm">
          <div class="col-12 col-sm">
            <q-input
              v-model="header.title"
              :readonly="!editable"
              borderless
              dense
              class="page-title"
              :placeholder="data.typeLabel"
            />
            <div class="text-caption text-grey-7">
              {{ data.typeLabel }}
              <span v-if="data.klados"> · {{ KLADOS_LABEL[data.klados.type] }}</span>
              <span v-if="data.finalized"> · οριστικοποιήθηκε</span>
            </div>
          </div>

          <div class="col-12 col-sm-auto row items-center q-gutter-sm">
            <SaveStatus v-if="editable" :status="saveStatus" @retry="saveNow" />
            <q-btn
              v-if="viewOnly && !data.finalized && auth.can('symvoulio:klados:write')"
              outline
              color="klados"
              icon="edit"
              label="Επεξεργασία"
              @click="startEditing"
            />
            <q-btn
              v-if="editable"
              outline
              color="klados"
              icon="lock"
              label="Οριστικοποίηση"
              @click="confirmFinalize"
            >
              <q-tooltip>Κλειδώνει τα πρακτικά — δεν αλλάζουν μετά.</q-tooltip>
            </q-btn>
          </div>
          </div>
        </div>

        <q-banner v-if="data.finalized" dense class="bg-grey-3 text-grey-9 q-mb-md">
          <template #avatar><q-icon name="lock" /></template>
          Τα πρακτικά έχουν οριστικοποιηθεί και δεν τροποποιούνται.
        </q-banner>

        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-8">
            <!-- Ατζέντα: γράφεται πριν -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="row items-center justify-between q-py-sm">
                <div class="text-subtitle1 text-weight-medium">Ατζέντα</div>
                <div class="text-caption text-grey-7">πριν το συμβούλιο</div>
              </q-card-section>
              <q-separator />
              <q-card-section class="q-py-sm">
                <MarkdownField
                  v-model="header.agenda"
                  :klados="data.klados?.type ?? null"
                  :readonly="!editable"
                  label="Τι θα συζητηθεί"
                  placeholder="- Απολογισμός περιόδου&#10;- Πρόγραμμα δράσεων"
                  empty-text="Δεν έχει γραφτεί ατζέντα."
                  :min-height="120"
                />
              </q-card-section>
            </q-card>

            <!-- Πρακτικά: γράφονται κατά τη διάρκεια -->
            <q-card flat bordered>
              <q-card-section class="row items-center justify-between q-py-sm">
                <div class="text-subtitle1 text-weight-medium">Πρακτικά</div>
                <div class="text-caption text-grey-7">κατά τη διάρκεια</div>
              </q-card-section>
              <q-separator />
              <q-card-section class="q-py-sm">
                <MarkdownField
                  v-model="header.minutes"
                  :klados="data.klados?.type ?? null"
                  :readonly="!editable"
                  label="Τι ειπώθηκε και τι αποφασίστηκε"
                  placeholder="## Θέμα&#10;&#10;Συζήτηση…&#10;&#10;**Απόφαση:** …"
                  empty-text="Δεν έχουν γραφτεί πρακτικά."
                  :min-height="220"
                />
              </q-card-section>
            </q-card>
          </div>

          <div class="col-12 col-md-4">
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="text-subtitle1 text-weight-medium q-py-sm">
                Στοιχεία
              </q-card-section>
              <q-separator />
              <q-card-section class="q-gutter-sm">
                <DateField v-model="header.date" label="Ημερομηνία" :editable="editable" />
                <q-input
                  v-model="header.location"
                  :readonly="!editable"
                  label="Τοποθεσία"
                  dense
                  outlined
                />
                <q-select
                  v-model="header.chairId"
                  :options="stelexiOptions"
                  :readonly="!editable"
                  label="Προεδρεύει"
                  dense
                  outlined
                  emit-value
                  map-options
                  clearable
                />
              </q-card-section>
            </q-card>

            <!-- Συμμετέχοντες -->
            <q-card flat bordered>
              <q-card-section class="row items-center justify-between q-py-sm">
                <div class="text-subtitle1 text-weight-medium">Συμμετέχοντες</div>
                <q-chip
                  v-if="candidates.length"
                  dense
                  outline
                  :label="`${participantIds.length}/${candidates.length}`"
                />
              </q-card-section>
              <q-separator />

              <q-card-section class="q-py-sm">
                <div class="text-caption text-grey-7 q-mb-xs">
                  {{
                    data.klados
                      ? 'Τα στελέχη του κλάδου'
                      : 'Όλα τα στελέχη του Τοπικού'
                  }}
                </div>

                <div v-if="!candidates.length" class="text-caption text-grey-6">
                  Δεν βρέθηκαν ενεργά στελέχη.
                </div>

                <q-list v-else dense>
                  <q-item
                    v-for="stelexos in candidates"
                    :key="stelexos.id"
                    v-ripple
                    tag="label"
                    :clickable="editable"
                  >
                    <q-item-section avatar>
                      <q-checkbox
                        v-model="participantIds"
                        :val="stelexos.id"
                        :disable="!editable"
                        color="klados"
                        dense
                      />
                    </q-item-section>
                    <q-item-section>
                      {{ stelexos.lastName }} {{ stelexos.firstName }}
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { KLADOS_LABEL, type KladosType, type SymvoulioType } from '@trifylli/shared';
import DateField from '../components/DateField.vue';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, OfflineError, get, patch, post } from '../lib/api';
import { useKladosThemeStore } from '../stores/klados-theme';
import type { SaveState } from '../lib/save-state';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';

const kladosTheme = useKladosThemeStore();

/**
 * Ένα συμβούλιο: τι θα πούμε, τι είπαμε, ποιοι ήταν εκεί.
 *
 * Δύο κείμενα και μια λίστα — όχι σύστημα διαχείρισης θεμάτων με υπεύθυνους και
 * προθεσμίες. Ένα συμβούλιο κλάδου γράφεται σε δέκα λεπτά και πρέπει να
 * διαβάζεται σε ένα.
 */

/** Πόσο περιμένουμε να σταματήσει η πληκτρολόγηση πριν στείλουμε. */
const AUTOSAVE_DELAY_MS = 1200;

interface Stelexos {
  id: string;
  firstName: string;
  lastName: string;
}

interface SymvoulioDetail {
  id: string;
  type: SymvoulioType;
  typeLabel: string;
  title: string | null;
  date: string;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  finalized: boolean;
  klados: { type: KladosType; name: string | null } | null;
  chair: { id: string; firstName: string; lastName: string } | null;
  participants: { userId: string; user: Stelexos }[];
}

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const offline = useOfflineStore();
const id = String(route.params.id);

/** Πίσω στη λίστα συμβουλίων — του κλάδου αν υπάρχει, αλλιώς του Τοπικού. */
function goBack(): void {
  const k = data.value?.klados?.type;
  void router.push(k ? { name: 'klados-symvoulia', params: { klados: k } } : { name: 'symvoulia' });
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<SymvoulioDetail>(`/symvoulia/${id}`),
  { forbiddenPage: true, cacheKey: `symvoulio:${id}` },
);

// Η σελίδα ζει εκτός `/k/:klados`: δηλώνει μόνη της τον κλάδο της ώστε τα
// κουμπιά της να πάρουν το χρώμα του.
watch(
  () => (data.value ? (data.value.klados?.type ?? null) : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

/**
 * Η σελίδα ανοίγει και μόνο για διάβασμα (`?view=1`).
 *
 * Έχει νόημα επειδή αποθηκεύει μόνη της: χωρίς αυτό, το να ρίξεις μια ματιά στα
 * πρακτικά σημαίνει ότι ένα κατά λάθος πάτημα γράφεται αμέσως.
 */
const viewOnly = computed(() => route.query.view === '1');

/** Οριστικοποιημένα πρακτικά δεν αλλάζουν — ούτε κατά λάθος. */
const editable = computed(
  () => auth.can('symvoulio:klados:write') && !data.value?.finalized && !viewOnly.value,
);

function startEditing(): void {
  const query = { ...route.query };
  delete query.view;
  void router.replace({ query });
}

// ───────────────────────── Τοπική κατάσταση ─────────────────────────

const header = reactive({
  title: '',
  date: '',
  location: '',
  chairId: null as string | null,
  agenda: '',
  minutes: '',
});

const participantIds = ref<string[]>([]);
const fetchedStelexi = ref<Stelexos[]>([]);

const saveStatus = ref<SaveState>('clean');
const dirty = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

/** Κρατά κλειστό τον watcher της αποθήκευσης όσο γεμίζει η φόρμα. */
let hydrating = false;

watch(
  data,
  (value) => {
    if (!value || dirty.value) return;
    hydrating = true;

    header.title = value.title ?? '';
    header.date = isoDay(new Date(value.date));
    header.location = value.location ?? '';
    header.chairId = value.chair?.id ?? null;
    header.agenda = value.agenda ?? '';
    header.minutes = value.minutes ?? '';
    participantIds.value = value.participants.map((entry) => entry.userId);

    void Promise.resolve().then(() => {
      hydrating = false;
    });
  },
  { immediate: true },
);

/**
 * Όσοι μπορούν να δηλωθούν συμμετέχοντες.
 *
 * Ενώνει τον κατάλογο με όσους έχουν ήδη δηλωθεί: ο κατάλογος έρχεται από
 * ξεχωριστό request που χωρίς δίκτυο δεν φτάνει, και χωρίς την ένωση η λίστα
 * θα έδειχνε άδεια ενώ το συμβούλιο έχει συμμετέχοντες.
 */
const candidates = computed<Stelexos[]>(() => {
  const byId = new Map<string, Stelexos>();
  for (const entry of data.value?.participants ?? []) byId.set(entry.user.id, entry.user);
  for (const stelexos of fetchedStelexi.value) byId.set(stelexos.id, stelexos);
  return [...byId.values()].sort((a, b) => a.lastName.localeCompare(b.lastName, 'el'));
});

const stelexiOptions = computed(() =>
  candidates.value.map((stelexos) => ({
    label: `${stelexos.lastName} ${stelexos.firstName}`,
    value: stelexos.id,
  })),
);

async function loadStelexi(): Promise<void> {
  try {
    const result = await get<{ candidates: Stelexos[] }>(`/symvoulia/${id}/stelexi`);
    fetchedStelexi.value = result.candidates;
  } catch {
    // Δευτερεύον: χωρίς δίκτυο μένουν ορατοί όσοι είναι ήδη δηλωμένοι.
    fetchedStelexi.value = [];
  }
}

watch(
  data,
  (value) => {
    if (value && !fetchedStelexi.value.length) void loadStelexi();
  },
  { immediate: true },
);

// ───────────────────────── Αυτόματη αποθήκευση ─────────────────────────

watch(
  [header, participantIds],
  () => {
    if (hydrating || !editable.value) return;
    dirty.value = true;
    saveStatus.value = 'pending';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
  },
  { deep: true },
);

async function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty.value || !editable.value) return;

  saveStatus.value = 'saving';
  try {
    await patch(`/symvoulia/${id}`, {
      title: header.title.trim() || null,
      date: dayToIso(header.date),
      location: header.location.trim() || null,
      chairId: header.chairId ?? null,
      agenda: header.agenda,
      minutes: header.minutes,
      participantIds: participantIds.value,
    });
    dirty.value = false;
    saveStatus.value = 'saved';
  } catch (err) {
    // Χωρίς δίκτυο δεν είναι σφάλμα: η σελίδα κρατά τις αλλαγές και ξαναστέλνει
    // μόλις επιστρέψει η σύνδεση.
    if (err instanceof OfflineError) {
      saveStatus.value = 'offline';
      return;
    }
    saveStatus.value = 'error';
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.',
    });
  }
}

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

// ───────────────────────── Οριστικοποίηση ─────────────────────────

function confirmFinalize(): void {
  $q.dialog({
    title: 'Οριστικοποίηση πρακτικών',
    message: 'Μετά την οριστικοποίηση τα πρακτικά κλειδώνουν και δεν τροποποιούνται. Συνέχεια;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Οριστικοποίηση', color: 'negative' },
    persistent: true,
  }).onOk(() => void finalize());
}

async function finalize(): Promise<void> {
  // Ό,τι δεν έχει προλάβει να φύγει, φεύγει πρώτα: το κλείδωμα απορρίπτει
  // κάθε επόμενη αποθήκευση, οπότε μια εκκρεμής αλλαγή θα χανόταν.
  await saveNow();
  try {
    await post(`/symvoulia/${id}/finalize`);
    await reload();
    $q.notify({ type: 'positive', message: 'Τα πρακτικά οριστικοποιήθηκαν.' });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία οριστικοποίησης.',
    });
  }
}

// ───────────────────────── Βοηθητικά ─────────────────────────

/**
 * «YYYY-MM-DD» από **τοπική** ημερομηνία — όχι μέσω UTC, που σε θετική ζώνη θα
 * εμφάνιζε ένα βραδινό συμβούλιο την επόμενη μέρα.
 */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Η ημερομηνία κρατά την **ημέρα**· στέλνεται στο μεσημέρι ώστε καμία ζώνη να μη τη μετακινήσει. */
function dayToIso(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}
</script>
