<template>
  <!--
    Το πρόγραμμα της δράσης: ΩΡΟΛΟΓΙΟ χωρίς ώρες — η ημέρα ξεκινά από την ώρα
    που ορίστηκε στο Στήσιμο, κάθε προγραμματικό έχει ΔΙΑΡΚΕΙΑ, και οι ώρες
    προκύπτουν αθροιστικά. Όλα γράφονται επί τόπου και σώζονται μόνα τους·
    η σειρά αλλάζει με σύρσιμο.
  -->
  <div>
    <div class="row items-center q-mb-sm q-gutter-sm">
      <SegmentedToggle v-model="dayKey" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="dayOptions" />
      <q-space />
      <SaveStatus v-if="canWrite && saveStatus !== 'clean'" :status="saveStatus" @retry="saveNow" />
      <q-btn v-if="canWrite && current?.items.length && dayOptions.length > 1" flat color="klados" icon="content_copy" label="Αντιγραφή ημέρας σε…" @click="copyDialog = true" />
    </div>

    <!-- Έναρξη ημέρας: την πρώτη την ορίζει το Στήσιμο, τις άλλες μπορείς να τις αλλάξεις -->
    <div v-if="current" class="row items-center q-gutter-sm q-mb-md text-body2">
      <q-icon name="play_circle" :style="{ color: 'var(--klados-ink)' }" />
      <span>Έναρξη <b>{{ current.startTime }}</b></span>
      <template v-if="isFirstDay">
        <span class="text-caption text-grey-7">— από το Στήσιμο της δράσης</span>
      </template>
      <template v-else-if="canWrite">
        <div style="width: 140px"><TimeField :model-value="dayStartDraft" label="Αλλαγή" @update:model-value="setDayStart" /></div>
        <q-btn v-if="current.overridden" flat dense size="sm" label="επαναφορά" @click="setDayStart(null)" />
      </template>
      <q-space />
      <span v-if="current.items.length" class="text-caption text-grey-7">
        {{ rows.length }} στοιχεία · {{ formatDuration(totalMin) }} · λήξη {{ times[times.length - 1]?.end }}
      </span>
    </div>

    <!-- Γρήγορη προσθήκη: τίτλος + διάρκεια, Enter -->
    <q-card v-if="canWrite" flat bordered class="q-pa-sm q-mb-md">
      <div class="row q-col-gutter-sm items-start">
        <div class="col-12 col-sm-5"><q-input v-model="draft.title" label="Τι γίνεται" outlined dense color="klados" @keyup.enter="add" /></div>
        <div class="col-5 col-sm-2"><q-input v-model.number="draft.durationMin" type="number" label="Λεπτά" outlined dense :min="1" :max="1440" color="klados" @keyup.enter="add" /></div>
        <div class="col-7 col-sm-4"><q-select v-model="draft.kind" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados" /></div>
        <div class="col-12 col-sm-1 row items-center">
          <q-btn round dense color="klados" text-color="klados-on" icon="add" :disable="!draft.title.trim() || !draft.durationMin" :loading="saving" @click="add" />
        </div>
      </div>
    </q-card>

    <q-inner-loading :showing="loading" />

    <div v-if="current && !current.items.length && !loading" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="schedule" size="40px" class="block q-mx-auto q-mb-sm" />
      Το ωρολόγιο της ημέρας είναι άδειο. Γράψε τι γίνεται και πόσο κρατά — η ώρα βγαίνει μόνη της από την έναρξη.
    </div>

    <!--
      Κάθε στοιχείο μία γραμμή: λαβή (σύρε για αλλαγή σειράς), ώρες (υπολογισμένες),
      είδος (πάτα το εικονίδιο), τίτλος και λεπτά γράφονται ΕΠΙ ΤΟΠΟΥ — όπως ο
      τίτλος της συγκέντρωσης — και σώζονται μόνα τους. Το προγραμματικό έχει
      δική του σελίδα (εικονίδιο στα δεξιά) — εκεί γράφεται το markdown.
    -->
    <q-list v-else-if="current" bordered class="rounded-borders">
      <div
        v-for="(row, idx) in rows"
        :key="row.id"
        class="schedule-row"
        :class="{ 'schedule-row--over': overId === row.id && dragId !== row.id, 'schedule-row--dragging': dragId === row.id }"
        :draggable="dragArmed === row.id"
        @dragstart="onDragStart(row.id, $event)"
        @dragover.prevent="overId = row.id"
        @dragleave="overId === row.id && (overId = null)"
        @drop.prevent="onDrop(row.id)"
        @dragend="onDragEnd"
      >
        <q-separator v-if="idx > 0" />
        <q-item class="q-py-xs items-center">
          <q-item-section v-if="canWrite" side class="drag-handle" @mousedown="dragArmed = row.id" @touchstart.passive="dragArmed = row.id">
            <q-icon name="drag_indicator" color="grey-5" />
          </q-item-section>
          <q-item-section side class="clock">
            <div class="text-weight-medium">{{ times[idx]?.start }}</div>
            <div class="text-caption text-grey-6">{{ times[idx]?.end }}</div>
          </q-item-section>
          <q-item-section avatar>
            <q-btn flat round dense :icon="KIND_ICON[row.kind]" :color="KIND_COLOR[row.kind]" :disable="!canWrite">
              <q-tooltip>{{ DRASI_SCHEDULE_KIND_LABEL[row.kind] }}</q-tooltip>
              <q-menu v-if="canWrite" auto-close>
                <q-list dense>
                  <q-item v-for="k in kindOptions" :key="k.value" clickable :active="k.value === row.kind" active-class="text-klados" @click="row.kind = k.value">
                    <q-item-section avatar><q-icon :name="KIND_ICON[k.value]" :color="KIND_COLOR[k.value]" /></q-item-section>
                    <q-item-section>{{ k.label }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </q-item-section>
          <q-item-section>
            <q-input v-model="row.title" :readonly="!canWrite" borderless dense class="row-title" placeholder="Τι γίνεται" />
            <div class="text-caption text-grey-6 ellipsis">
              {{ DRASI_SCHEDULE_KIND_LABEL[row.kind] }}
              <span v-if="row.location"> · {{ row.location }}</span>
              <span v-if="row.responsible"> · διεξαγωγή: {{ row.responsible }}</span>
              <span v-if="row.executor"> · υλοποίηση: {{ row.executor }}</span>
            </div>
          </q-item-section>
          <q-item-section side>
            <q-input
              v-if="canWrite"
              v-model.number="row.durationMin"
              type="number"
              dense
              outlined
              suffix="λ"
              :min="1"
              :max="1440"
              color="klados"
              class="row-duration"
            />
            <span v-else class="text-caption text-grey-7">{{ formatDuration(row.durationMin) }}</span>
          </q-item-section>
          <q-item-section side>
            <q-btn
              flat
              dense
              round
              size="sm"
              :icon="row.hasProgramma ? 'description' : 'note_add'"
              :color="row.hasProgramma ? 'klados' : 'grey-5'"
              :to="{ name: 'drasi-programmatiko', params: { id: drasiId, itemId: row.id } }"
            >
              <q-tooltip>{{ row.hasProgramma ? 'Άνοιγμα προγραμματικού' : 'Χωρίς προγραμματικό — γράψε' }}</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>
      </div>
    </q-list>

    <!-- ── Αντιγραφή ημέρας ── -->
    <q-dialog v-model="copyDialog">
      <q-card style="min-width: min(380px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Αντιγραφή της {{ formatDate(dayKey) }} σε…</q-card-section>
        <q-card-section>
          <q-select v-model="copyTo" :options="dayOptions.filter((d) => d.value !== dayKey)" label="Ημέρα" outlined dense emit-value map-options color="klados" />
          <div class="text-caption text-grey-7 q-mt-sm">Αντιγράφονται τα στοιχεία με τις διάρκειές τους και τα προγραμματικά τους.</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Αντιγραφή" :disable="!copyTo" :loading="saving" @click="copyDay" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_SCHEDULE_KIND_LABEL,
  DrasiScheduleKind,
  type DrasiScheduleItemView,
  type DrasiScheduleView,
  type KladosType,
} from '@trifylli/shared';
import SaveStatus from '../SaveStatus.vue';
import TimeField from '../TimeField.vue';
import { ApiError, OfflineError, get, patch, post, put } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';
import type { SaveState } from '../../lib/save-state';

const props = defineProps<{
  drasiId: string;
  organiser: KladosType | null;
  canWrite: boolean;
}>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const view = ref<DrasiScheduleView | null>(null);

const KIND_ICON: Record<DrasiScheduleKind, string> = {
  DRASTIRIOTITA: 'hiking',
  GEVMA: 'restaurant',
  XEKOURASI: 'bedtime',
  METAKINISI: 'directions_bus',
  TELETI: 'flag',
  YPIRESIA: 'cleaning_services',
  ALLO: 'more_horiz',
};
const KIND_COLOR: Record<DrasiScheduleKind, string> = {
  DRASTIRIOTITA: 'klados',
  GEVMA: 'orange-7',
  XEKOURASI: 'indigo-4',
  METAKINISI: 'blue-grey-6',
  TELETI: 'red-6',
  YPIRESIA: 'teal-6',
  ALLO: 'grey-6',
};
const kindOptions = (Object.keys(DrasiScheduleKind) as DrasiScheduleKind[]).map((k) => ({ label: DRASI_SCHEDULE_KIND_LABEL[k], value: k }));

const dayOptions = computed(() => (view.value?.days ?? []).map((d) => ({ label: formatDate(d.date), value: d.date })));
const dayKey = ref('');
watch(dayOptions, (opts) => {
  if (!opts.some((o) => o.value === dayKey.value) && opts[0]) dayKey.value = opts[0].value;
});
const current = computed(() => view.value?.days.find((d) => d.date === dayKey.value) ?? null);
const isFirstDay = computed(() => view.value?.days[0]?.date === dayKey.value);
const dayStartDraft = computed(() => current.value?.startTime ?? '');

async function reload(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiScheduleView>(`/draseis/${props.drasiId}/schedule`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης προγράμματος.');
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

// ── Έναρξη ημέρας ──
async function setDayStart(time: string | null): Promise<void> {
  if (time === current.value?.startTime) return;
  try {
    await saveNow();
    await patch(`/draseis/${props.drasiId}/schedule/day-start`, { date: dayKey.value, time: time || null });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Οι γραμμές της ημέρας: τοπικό, επεξεργάσιμο αντίγραφο ──
interface Row {
  id: string;
  title: string;
  durationMin: number;
  kind: DrasiScheduleKind;
  /** Μόνο για τη λεζάντα — αλλάζουν από τη σελίδα του προγραμματικού. */
  location: string | null;
  responsible: string | null;
  executor: string | null;
  hasProgramma: boolean;
}
const rows = ref<Row[]>([]);

function toRow(it: DrasiScheduleItemView): Row {
  return {
    id: it.id,
    title: it.title,
    durationMin: it.durationMin,
    kind: it.kind,
    location: it.location,
    responsible: it.responsible ? `${it.responsible.lastName} ${it.responsible.firstName}` : null,
    executor: it.executor ? `${it.executor.lastName} ${it.executor.firstName}` : null,
    hasProgramma: it.hasProgramma,
  };
}

// Ό,τι έρχεται από τον server γίνεται η νέα βάση — και το στιγμιότυπο, ώστε
// η παρακολούθηση αλλαγών να μη θεωρήσει «αλλαγή» την ίδια τη φόρτωση.
// Τα δύο σύνολα δηλώνονται ΠΡΙΝ τον watcher: με `immediate: true` η συνάρτηση
// τρέχει εδώ, συγχρονισμένα, και ένα `const` παρακάτω δεν υπάρχει ακόμη (TDZ).
const snapshots = new Map<string, string>();
const dirty = new Set<string>();
watch(
  current,
  (day) => {
    rows.value = (day?.items ?? []).map(toRow);
    snapshots.clear();
    for (const r of rows.value) snapshots.set(r.id, JSON.stringify(r));
  },
  { immediate: true },
);

/** Οι ώρες βγαίνουν εδώ, από την έναρξη της ημέρας και τις διάρκειες — ίδια πράξη με τον server. */
const clampMin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1440, Math.max(1, Math.round(v))) : 1);
const times = computed(() => {
  const [h, m] = (current.value?.startTime ?? '00:00').split(':').map(Number);
  let cursor = (h ?? 0) * 60 + (m ?? 0);
  const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return rows.value.map((r) => {
    const start = cursor;
    cursor += clampMin(r.durationMin);
    return { start: fmt(start), end: fmt(cursor) };
  });
});
const totalMin = computed(() => rows.value.reduce((s, r) => s + clampMin(r.durationMin), 0));

// ── Αυτόματη αποθήκευση: ποια γραμμή άλλαξε, PATCH μόνο αυτή ──
const AUTOSAVE_DELAY_MS = 1000;
const saveStatus = ref<SaveState>('clean');
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  rows,
  (list) => {
    let changed = false;
    for (const r of list) {
      const json = JSON.stringify(r);
      if (snapshots.get(r.id) === json) continue;
      snapshots.set(r.id, json);
      dirty.add(r.id);
      changed = true;
    }
    if (!changed || !props.canWrite) return;
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
  if (!dirty.size) return;
  saveStatus.value = 'saving';
  const ids = [...dirty];
  dirty.clear();
  try {
    for (const id of ids) {
      const r = rows.value.find((x) => x.id === id);
      if (!r) continue;
      await patch(`/draseis/${props.drasiId}/schedule/${id}`, {
        ...(r.title.trim() ? { title: r.title.trim() } : {}),
        durationMin: clampMin(r.durationMin),
        kind: r.kind,
      });
    }
    saveStatus.value = dirty.size ? 'pending' : 'saved';
  } catch (err) {
    for (const id of ids) dirty.add(id);
    if (err instanceof OfflineError) {
      saveStatus.value = 'offline';
      return;
    }
    saveStatus.value = 'error';
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  }
}
onBeforeUnmount(() => {
  if (dirty.size) void saveNow();
});

// ── Ωρολόγιο: προσθήκη ──
const draft = reactive({ title: '', durationMin: 30, kind: 'DRASTIRIOTITA' as DrasiScheduleKind });
async function add(): Promise<void> {
  if (!draft.title.trim() || !draft.durationMin) return;
  saving.value = true;
  try {
    await saveNow();
    await post(`/draseis/${props.drasiId}/schedule`, { date: dayKey.value, title: draft.title.trim(), durationMin: draft.durationMin, kind: draft.kind });
    draft.title = '';
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία προσθήκης.');
  } finally {
    saving.value = false;
  }
}

// ── Σειρά με σύρσιμο: η γραμμή γίνεται draggable μόνο από τη λαβή, για να
//    μην «πιάνει» το σύρσιμο την επιλογή κειμένου μέσα στα πεδία. ──
const dragArmed = ref<string | null>(null);
const dragId = ref<string | null>(null);
const overId = ref<string | null>(null);
function onDragStart(id: string, ev: DragEvent): void {
  dragId.value = id;
  ev.dataTransfer?.setData('text/plain', id);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(): void {
  dragId.value = null;
  overId.value = null;
  dragArmed.value = null;
}
async function onDrop(targetId: string): Promise<void> {
  const from = dragId.value;
  onDragEnd();
  if (!from || from === targetId) return;
  const list = [...rows.value];
  const fromIdx = list.findIndex((r) => r.id === from);
  const toIdx = list.findIndex((r) => r.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, moved!);
  rows.value = list;
  try {
    await put(`/draseis/${props.drasiId}/schedule/reorder`, { date: dayKey.value, ids: list.map((r) => r.id) });
  } catch (err) {
    notifyError(err, 'Αποτυχία αλλαγής σειράς.');
    await reload();
  }
}

// ── Αντιγραφή ημέρας ──
const copyDialog = ref(false);
const copyTo = ref<string | null>(null);
async function copyDay(): Promise<void> {
  if (!copyTo.value) return;
  saving.value = true;
  try {
    await saveNow();
    const r = await post<{ copied: number }>(`/draseis/${props.drasiId}/schedule/copy-day`, { from: dayKey.value, to: copyTo.value });
    copyDialog.value = false;
    $q.notify({ type: 'positive', message: `Αντιγράφηκαν ${r.copied} στοιχεία.` });
    dayKey.value = copyTo.value;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία αντιγραφής.');
  } finally {
    saving.value = false;
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>

<style scoped>
.clock {
  min-width: 56px;
  text-align: right;
}
.drag-handle {
  cursor: grab;
  padding-right: 4px;
}
.schedule-row--dragging {
  opacity: 0.4;
}
.schedule-row--over {
  box-shadow: inset 0 3px 0 var(--klados-ink);
}
.row-title :deep(input) {
  font-weight: 500;
  padding: 0;
}
.row-duration {
  width: 92px;
}
</style>
