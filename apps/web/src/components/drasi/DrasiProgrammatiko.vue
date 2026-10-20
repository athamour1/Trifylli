<template>
  <!--
    Το προγραμματικό ενός στοιχείου του ωρολογίου: ανοίγει μέσα στη δράση (με το
    συρτάρι της, βλ. DrasiPage), με το markdown
    (εικόνες, προεπισκόπηση) όπως στις συγκεντρώσεις, και ό,τι άλλο το πλαισιώνει
    (λεπτά, είδος, χώρος, υπεύθυνοι, υλικό) σε κάρτες στο πλάι. Σώζει μόνη της —
    δεν έχει κουμπί.
  -->
  <div>
    <PageState :loading="loading && !item" :error="error" :stale="stale" @retry="reload">
      <template v-if="item && drasi">
        <!-- ── Κεφαλίδα ── -->
        <div class="row items-start no-wrap q-mb-md">
          <q-btn flat round dense icon="arrow_back" color="klados" class="q-mr-sm q-mt-xs" @click="goBack">
            <q-tooltip>{{ backLabel }}</q-tooltip>
          </q-btn>
          <div class="col row items-start justify-between q-col-gutter-sm">
            <div class="col-12 col-sm">
              <q-input v-model="form.title" :readonly="!editAll" borderless dense class="page-title" placeholder="Τι γίνεται" />
              <div class="text-caption text-grey-7">
                {{ formatDateLong(item.date) }} · {{ hm(item.startsAt) }}–{{ hm(item.endsAt) }}
                · {{ formatDuration(item.durationMin) }}
              </div>
              <div v-if="scope === 'own'" class="text-caption text-klados q-mt-xs">
                <q-icon name="assignment_ind" size="16px" class="q-mr-xs" />Είσαι υπεύθυνος: γράφεις το προγραμματικό, τον χώρο και το υλικό.
              </div>
            </div>
            <div class="col-12 col-sm-auto row items-center q-gutter-sm">
              <CollabPresence :peers="peers" faces-only />
              <SaveStatus v-if="editable" :status="worstSaveState(saveStatus, collabSaveState)" @retry="saveNow" />
              <DocumentHistory :document="docName" :writable="textEditable" />
            </div>
          </div>
        </div>

        <CollabBanner :status="collabStatus" :ready="ready" :editable="editable" target="στο προγραμματικό" />
        <ApprovalBar :document="docName" />

        <!-- ── Το προγραμματικό, με τα στοιχεία και το υλικό στο πλάι (δεξιά) ── -->
        <div class="tf-split">
          <q-card flat bordered class="tf-split__head">
            <q-card-section class="text-subtitle1 text-weight-medium q-py-sm">Στοιχεία</q-card-section>
            <q-separator />
            <q-card-section class="q-gutter-sm">
              <q-input v-model.number="form.durationMin" :readonly="!editAll" type="number" label="Λεπτά" outlined dense :min="1" :max="1440" color="klados" />
              <q-select v-model="form.kind" :readonly="!editAll" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados">
                <template #prepend><q-icon :name="KIND_ICON[form.kind]" :color="KIND_COLOR[form.kind]" /></template>
              </q-select>
              <q-input
                :model-value="view.location"
                :readonly="!fieldsEditable"
                label="Χώρος"
                outlined
                dense
                color="klados"
                :maxlength="ROW_LIMITS.location"
                @update:model-value="(value) => setLocation(doc, String(value ?? ''))"
              />
              <StelexosPicker v-if="editAll" v-model="form.responsible" :label="responsiblesLabel(form.responsible.length)" :options="stelexiOptions" />
              <q-input v-else :model-value="namesOf(form.responsible)" :label="responsiblesLabel(form.responsible.length)" outlined dense readonly />
            </q-card-section>
            <q-card-actions v-if="editAll" align="right">
              <q-btn flat no-caps color="negative" icon="delete" label="Διαγραφή στοιχείου" @click="remove" />
            </q-card-actions>
          </q-card>

          <q-card flat bordered class="tf-split__main">
            <q-card-section>
              <!-- Το γράφουν μαζί το Πρόγραμμα και οι υπεύθυνοι — ζωντανά, με κέρσορες. -->
              <CollabMarkdownField
                v-if="ready"
                :doc="doc"
                :field="ITEM_DOC.description"
                :document-name="docName"
                :awareness="awareness"
                :klados="drasi.klados?.type ?? null"
                :readonly="!textEditable"
                label="Προγραμματικό"
                placeholder="Markdown: στόχος, πορεία, οδηγίες, κανόνες, εναλλακτική αν βρέξει… Σύρε ή επικόλλησε εικόνες."
                empty-text="Δεν έχει γραφτεί προγραμματικό."
                :min-height="360"
              />
              <MarkdownField
                v-else
                :model-value="item.description ?? ''"
                readonly
                :klados="drasi.klados?.type ?? null"
                empty-text="Δεν έχει γραφτεί προγραμματικό."
              />
            </q-card-section>
          </q-card>

          <!-- Το υλικό σε μία λίστα, όπως στη συγκέντρωση -->
          <q-card flat bordered class="tf-split__tail">
            <q-card-section class="row items-center justify-between q-py-sm">
              <div class="text-subtitle1 text-weight-medium">Υλικό</div>
              <q-chip v-if="ylikoCount" dense outline :label="`${packedCount}/${ylikoCount}`" />
            </q-card-section>
            <q-separator />
            <q-card-section class="q-py-sm">
              <div v-if="!view.yliko.length" class="text-caption text-grey-6 q-pb-sm">
                {{ fieldsEditable ? 'Κενή λίστα.' : 'Δεν έχει δηλωθεί υλικό.' }}
              </div>
              <div v-for="row in view.yliko" :key="row.id" class="row items-center q-col-gutter-xs q-mb-xs">
                <div class="col-auto">
                  <q-checkbox
                    :model-value="row.packed"
                    :disable="!fieldsEditable"
                    dense
                    color="klados"
                    @update:model-value="(value) => updateItemYliko(doc, row.id, { packed: value }, auth.user?.id ?? null)"
                  >
                    <q-tooltip v-if="row.packed && row.packedAt">{{ tickWho(row.packedBy, row.packedAt) }}</q-tooltip>
                  </q-checkbox>
                </div>
                <div class="col">
                  <q-input
                    :model-value="row.label"
                    :readonly="!fieldsEditable"
                    dense
                    outlined
                    placeholder="π.χ. σπάγκος"
                    :data-row-id="row.id"
                    :class="row.packed ? 'text-grey-6' : ''"
                    @update:model-value="(value) => updateItemYliko(doc, row.id, { label: String(value ?? '') })"
                    @keydown.enter.prevent="addRow(row.id)"
                  />
                </div>
                <div class="col-auto" style="width: 76px">
                  <q-input
                    :model-value="row.qty"
                    :readonly="!fieldsEditable"
                    type="number"
                    min="1"
                    dense
                    outlined
                    @update:model-value="(value) => setQty(row.id, value)"
                  />
                </div>
                <div v-if="fieldsEditable" class="col-auto">
                  <q-btn dense flat round size="sm" icon="close" color="negative" @click="removeItemYliko(doc, row.id)" />
                </div>
              </div>
              <q-btn
                v-if="fieldsEditable"
                flat
                dense
                no-caps
                color="klados"
                icon="add"
                label="Προσθήκη"
                @click="addRow(view.yliko.at(-1)?.id ?? null)"
              />
            </q-card-section>
          </q-card>
        </div>
      </template>
    </PageState>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  DRASI_SCHEDULE_KIND_LABEL,
  DrasiScheduleKind,
  ITEM_DOC,
  ROW_LIMITS,
  collabDocument,
  drasiEditScope,
  type DrasiAccess,
  type DrasiEditScope,
  type DrasiScheduleItemView,
  type DrasiScheduleView,
  type DrasiStatus,
  type KladosType,
  type ItemYlikoSnapshot,
} from '@trifylli/shared';
import CollabBanner from '../CollabBanner.vue';
import CollabPresence from '../CollabPresence.vue';
import DocumentHistory from '../collab/DocumentHistory.vue';
import ApprovalBar from '../collab/ApprovalBar.vue';
import MarkdownField from '../MarkdownField.vue';
import PageState from '../PageState.vue';
import SaveStatus from '../SaveStatus.vue';
import StelexosPicker from '../StelexosPicker.vue';
import { responsiblesLabel, SCHEDULE_KIND_COLOR as KIND_COLOR, SCHEDULE_KIND_ICON as KIND_ICON } from './types';
import { useAsyncData } from '../../composables/useAsyncData';
import { useCollabDoc, useCollabMe } from '../../composables/useCollabDoc';
import { useLiveReload } from '../../composables/useLiveChanges';
import { ApiError, OfflineError, del, get, patch } from '../../lib/api';
import { addItemYlikoAfter, hasSchema, readItemDoc, removeItemYliko, setLocation, updateItemYliko } from '../../lib/drasi-docs';
import { formatDateLong, formatDuration } from '../../lib/format';
import { useKladosThemeStore } from '../../stores/klados-theme';
import { keepFocus } from '../../lib/keep-focus';
import { worstSaveState, type SaveState } from '../../lib/save-state';
import { typedNumber } from '../../lib/syggentrwsh-plan';
import { useAuthStore } from '../../stores/auth';
import { useOfflineStore } from '../../stores/offline';

const kladosTheme = useKladosThemeStore();

// CodeMirror φορτώνεται μόνο όταν ανοίξει σελίδα με κείμενα για γράψιμο.
const CollabMarkdownField = defineAsyncComponent(() => import('../CollabMarkdownField.vue'));

interface DrasiHead {
  id: string;
  title: string;
  status: DrasiStatus;
  klados: { type: KladosType } | null;
  access: DrasiAccess;
}

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const offline = useOfflineStore();
const drasiId = String(route.params.id);
// Η σελίδα ξαναστήνεται για κάθε στοιχείο (βλ. το `key` στο MainLayout).
const itemId = String(route.params.itemId);

const kindOptions = (Object.keys(DrasiScheduleKind) as DrasiScheduleKind[]).map((k) => ({ label: DRASI_SCHEDULE_KIND_LABEL[k], value: k }));
const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── Φόρτωση: η δράση (τίτλος, κλάδος, κατάσταση) και όλο το ωρολόγιο, για να
//    βρούμε το στοιχείο με τις υπολογισμένες ώρες του ──
const { data, loading, error, stale, reload } = useAsyncData(
  async () => {
    const [drasi, schedule] = await Promise.all([get<DrasiHead>(`/draseis/${drasiId}`), get<DrasiScheduleView>(`/draseis/${drasiId}/schedule`)]);
    return { drasi, schedule };
  },
  { forbiddenPage: true, cacheKey: `drasi-schedule:${drasiId}` },
);
const drasi = computed(() => data.value?.drasi ?? null);
const dayOf = computed(() => data.value?.schedule.days.find((d) => d.items.some((i) => i.id === itemId)) ?? null);
const item = computed<DrasiScheduleItemView | null>(() => dayOf.value?.items.find((i) => i.id === itemId) ?? null);

watch(
  () => (drasi.value ? (drasi.value.klados?.type ?? null) : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

// ── Ποιος αλλάζει τι (ο ίδιος κανόνας με το API) ──
/** Υπεύθυνος αυτού του στοιχείου. */
const mine = computed(() => {
  const me = auth.user?.id;
  return !!me && !!item.value && item.value.responsibles.some((p) => p.id === me);
});
/** Όλα (ρόλος Προγράμματος/Αρχηγός), μόνο το προγραμματικό (υπεύθυνος) ή τίποτα· κλειστή δράση δεν αλλάζει. */
const scope = computed<DrasiEditScope>(() =>
  !drasi.value || drasi.value.status === 'KLEISTI' ? 'none' : drasiEditScope(drasi.value.access, 'programma', mine.value),
);
/** Κείμενο, χώρος, υλικό. */
const editable = computed(() => scope.value !== 'none');
/** Τίτλος, λεπτά, είδος, υπεύθυνοι, διαγραφή — η γραμμή του ωρολογίου. */
const editAll = computed(() => scope.value === 'all');

// ── Στελέχη για τον picker ──
/** Μόνο τα στελέχη της δράσης (δικά μας, φιλοξενούμενα, εξωτερικά). */
/** «Μαρία Π. · 18:30» — ποιος και πότε τσέκαρε. */
function tickWho(by: string | null, at: string | null): string {
  const name = by ? (by === auth.user?.id ? 'Εσύ' : (stelexiOptions.value.find((o) => o.value === by)?.label ?? '')) : '';
  const when = at ? new Date(at).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  return [name, when].filter(Boolean).join(' · ');
}

const stelexiOptions = computed(() => {
  const options = (data.value?.schedule.stelexi ?? []).map((s) => ({
    label: `${s.lastName} ${s.firstName}`.trim(),
    value: s.id,
    caption: s.guestTopikoName ?? '',
  }));
  // Όσοι ορίστηκαν πριν μετρήσουν μόνο τα στελέχη της δράσης: φαίνονται, για να βγουν.
  for (const p of item.value?.responsibles ?? []) {
    if (!options.some((o) => o.value === p.id)) {
      options.push({ label: `${p.lastName} ${p.firstName}`.trim(), value: p.id, caption: 'Δεν είναι στους συμμετέχοντες' });
    }
  }
  return options;
});
const namesOf = (ids: string[]): string =>
  ids.map((id) => stelexiOptions.value.find((o) => o.value === id)?.label ?? '').filter(Boolean).join(', ') || '—';

// ── Προγραμματικό, χώρος, υλικό: κοινό έγγραφο, σώζει μόνο του ──
const docName = collabDocument.drasiItem(drasiId, itemId);
const {
  doc,
  awareness,
  ready,
  writable,
  status: collabStatus,
  peers,
  saveState: collabSaveState,
} = useCollabDoc(docName, useCollabMe());

/** Το στοιχείο όπως είναι τώρα στο έγγραφο — ξαναδιαβάζεται σε κάθε αλλαγή, δική μας ή άλλων. */
const docItem = shallowRef<ReturnType<typeof readItemDoc> | null>(null);
const schemaOk = shallowRef(false);
let stopWatchingDoc: (() => void) | null = null;
watch(
  doc,
  (current) => {
    stopWatchingDoc?.();
    const refresh = (): void =>
      keepFocus(() => {
        docItem.value = readItemDoc(current);
        schemaOk.value = hasSchema(current, ITEM_DOC.schema);
      });
    current.on('update', refresh);
    stopWatchingDoc = () => current.off('update', refresh);
    refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => stopWatchingDoc?.());

// Η γραμμή του στοιχείου στο ωρολόγιο (τίτλος, λεπτά, είδος, υπεύθυνοι) αλλάζει
// και από αλλού — ζωντανά, μέσα από το δωμάτιο της δράσης.
const room = useCollabDoc(collabDocument.drasiRoom(drasiId), useCollabMe(), { persist: false });
useLiveReload(['schedule', 'participants', 'roles'], reload, { subscribe: room.onChange, busy: () => dirty.value });

/** Το προγραμματικό γράφεται όταν γράφεται το στοιχείο **και** ο server το επιτρέπει. */
const textEditable = computed(() => editable.value && ready.value && writable.value);
/**
 * Χώρος και υλικό: επιπλέον, το έγγραφο να έχει έρθει από τον server με αυτά
 * μέσα — ένα παλιό αντίγραφο συσκευής (μόνο με το κείμενο) θα έγραφε από κενό.
 */
const fieldsEditable = computed(() => textEditable.value && schemaOk.value);

/** Ό,τι δείχνει η σελίδα: το έγγραφο όταν έχει τα πεδία, αλλιώς ό,τι έφερε το `GET`. */
const view = computed<{ location: string; yliko: ItemYlikoSnapshot[] }>(() => {
  if (ready.value && schemaOk.value && docItem.value) return docItem.value;
  return {
    location: item.value?.location ?? '',
    yliko: (item.value?.yliko ?? []).map((y, order) => ({ ...y, order, packedBy: null, packedAt: null })),
  };
});

// ── Τοπική κατάσταση ──
const AUTOSAVE_DELAY_MS = 1200;
const saveStatus = ref<SaveState>('clean');
const dirty = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
/** Η γραμμή του ωρολογίου — σώζεται όπως πριν (`PATCH`)· τα υπόλοιπα είναι στο έγγραφο. */
const form = reactive({
  title: '',
  durationMin: 30,
  kind: 'DRASTIRIOTITA' as DrasiScheduleKind,
  responsible: [] as string[],
});
let hydrating = false;
watch(
  item,
  (it) => {
    // Ό,τι γράφει ο χρήστης αυτή τη στιγμή δεν το πατάει η επαναφόρτωση.
    if (!it || dirty.value) return;
    hydrating = true;
    Object.assign(form, {
      title: it.title,
      durationMin: it.durationMin,
      kind: it.kind,
      responsible: it.responsibles.map((p) => p.id),
    });
    dirty.value = false;
    if (saveStatus.value !== 'saved') saveStatus.value = 'clean';
    // Ο watcher της φόρμας τρέχει μετά από αυτό το sync block (pre-flush), οπότε
    // κατεβάζουμε τη σημαία στον επόμενο κύκλο.
    void Promise.resolve().then(() => (hydrating = false));
  },
  { immediate: true },
);

// ── Αυτόματη αποθήκευση ──
const clampMin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1440, Math.max(1, Math.round(v))) : 1);

watch(
  form,
  () => {
    if (hydrating || !editAll.value) return;
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
  if (!dirty.value || !editAll.value) return;
  saveStatus.value = 'saving';
  // Μόνο ό,τι άλλαξε, και οι υπεύθυνοι ως «πρόσθεσε / αφαίρεσε»: δύο που αλλάζουν
  // μαζί το ίδιο στοιχείο (π.χ. από το ωρολόγιο) δεν σβήνουν ο ένας τον άλλον.
  const server = item.value;
  const before = new Set(server?.responsibles.map((p) => p.id) ?? []);
  const after = new Set(form.responsible);
  const body = {
    ...(form.title.trim() && form.title.trim() !== server?.title ? { title: form.title.trim() } : {}),
    ...(clampMin(form.durationMin) !== server?.durationMin ? { durationMin: clampMin(form.durationMin) } : {}),
    ...(form.kind !== server?.kind ? { kind: form.kind } : {}),
    ...([...after].some((id) => !before.has(id)) ? { addResponsibleIds: [...after].filter((id) => !before.has(id)) } : {}),
    ...([...before].some((id) => !after.has(id)) ? { removeResponsibleIds: [...before].filter((id) => !after.has(id)) } : {}),
  };
  try {
    if (Object.keys(body).length) await patch(`/draseis/${drasiId}/schedule/${itemId}`, body);
    dirty.value = false;
    saveStatus.value = 'saved';
    // Οι ώρες στην κεφαλίδα ξαναβγαίνουν από τον server (άλλαξαν αν άλλαξαν τα λεπτά).
    if (!dirty.value) await reload();
  } catch (err) {
    if (err instanceof OfflineError) {
      saveStatus.value = 'offline';
      return;
    }
    saveStatus.value = 'error';
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.' });
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

// ── Υλικό ──
const filled = computed(() => view.value.yliko.filter((y) => y.label.trim()));
const ylikoCount = computed(() => filled.value.length);
const packedCount = computed(() => filled.value.filter((y) => y.packed).length);

/** Νέα γραμμή: η εστίαση πάει στο όνομά της, για να συνεχιστεί η πληκτρολόγηση. */
function addRow(afterId: string | null): void {
  const id = addItemYlikoAfter(doc.value, afterId);
  void nextTick(() => document.querySelector<HTMLInputElement>(`[data-row-id="${id}"]`)?.focus());
}

/** Όσο το πεδίο είναι κενό δεν γράφεται τίποτα (βλ. `typedNumber`). */
function setQty(rowId: string, value: string | number | null): void {
  const qty = typedNumber(value);
  if (qty !== null) updateItemYliko(doc.value, rowId, { qty });
}

// ── Πλοήγηση ──
/** Πίσω στην ενότητα απ' όπου ανοίγει — το ωρολόγιο ή τα προγραμματικά (βλ. `meta.drasiSection`). */
const backSection = computed(() => String(route.meta.drasiSection ?? 'programma'));
const backLabel = computed(() => (backSection.value === 'programmatika' ? 'Πίσω στα προγραμματικά' : 'Πίσω στο ωρολόγιο'));
function goBack(): void {
  void router.push({ name: 'drasi', params: { id: drasiId, section: backSection.value } });
}

function remove(): void {
  const it = item.value;
  if (!it) return;
  $q.dialog({
    title: 'Διαγραφή',
    message: `«${form.title || it.title}» (${formatDuration(clampMin(form.durationMin))}) — μαζί με το προγραμματικό του. Τα επόμενα της ημέρας μετακινούνται νωρίτερα. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      dirty.value = false;
      if (timer) clearTimeout(timer);
      await del(`/draseis/${drasiId}/schedule/${it.id}`);
      goBack();
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία διαγραφής.' });
    }
  });
}
</script>
