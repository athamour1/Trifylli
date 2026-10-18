<template>
  <!--
    Το πρόγραμμα της δράσης: ΩΡΟΛΟΓΙΟ χωρίς ώρες — η ημέρα ξεκινά από την ώρα
    που ορίστηκε στο Στήσιμο, κάθε προγραμματικό έχει ΔΙΑΡΚΕΙΑ, και οι ώρες
    προκύπτουν αθροιστικά. Όλα γράφονται επί τόπου και σώζονται μόνα τους·
    η σειρά αλλάζει με σύρσιμο.
  -->
  <div>
    <div class="row items-center q-mb-sm q-gutter-sm">
      <SegmentedToggle
        v-model="mode"
        dense flat no-caps
        toggle-color="klados"
        :options="[
          { label: 'Ωρολόγιο', value: 'plan' },
          { label: 'Ζωντανά', value: 'live' },
        ]"
      />
      <SegmentedToggle v-if="mode === 'plan'" v-model="dayKey" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="dayOptions" />
      <q-space />
      <q-select
        v-if="mode === 'plan' && (approvalRows.length || approvalFilter !== 'all')"
        v-model="approvalFilter"
        :options="approvalFilterOptions"
        dense
        outlined
        emit-value
        map-options
        options-dense
        color="klados"
        label="Έγκριση"
        style="min-width: 170px"
      />
      <SaveStatus v-if="canWrite && saveStatus !== 'clean'" :status="saveStatus" @retry="saveNow" />
      <q-btn v-if="mode === 'plan' && canWrite && current?.items.length && dayOptions.length > 1" flat color="klados" icon="content_copy" label="Αντιγραφή ημέρας σε…" @click="copyDialog = true" />
    </div>

    <DrasiLive v-if="mode === 'live' && view" :drasi-id="drasiId" :view="view" :can-write="canWrite" @changed="reload" />

    <template v-if="mode === 'plan'">

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
        {{ rows.length }} {{ rows.length === 1 ? 'στοιχείο' : 'στοιχεία' }} · {{ formatDuration(totalMin) }} · λήξη {{ times[times.length - 1]?.end }}
      </span>
    </div>

    <!-- Γρήγορη προσθήκη: τίτλος + διάρκεια, Enter -->
    <q-card v-if="canWrite" flat bordered class="q-pa-sm q-mb-md">
      <div class="row q-col-gutter-sm items-center">
        <div class="col-12 col-sm-5"><q-input v-model="draft.title" label="Τι γίνεται" outlined dense color="klados" @keyup.enter="add" /></div>
        <div class="col-3 col-sm-2"><q-input v-model.number="draft.durationMin" type="number" label="Λεπτά" outlined dense :min="1" :max="1440" color="klados" @keyup.enter="add" /></div>
        <div class="col-7 col-sm-4"><q-select v-model="draft.kind" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados" /></div>
        <div class="col-2 col-sm-1 row justify-center">
          <q-btn round dense color="klados" text-color="klados-on" icon="add" aria-label="Προσθήκη" :disable="!draft.title.trim() || !draft.durationMin" :loading="saving" @click="add" />
        </div>
      </div>
    </q-card>

    <q-inner-loading :showing="loading" />

    <div v-if="current && !current.items.length && !loading" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="schedule" size="40px" class="block q-mx-auto q-mb-sm" />
      Το ωρολόγιο της ημέρας είναι άδειο. Γράψε τι γίνεται και πόσο κρατά — η ώρα βγαίνει μόνη της από την έναρξη.
    </div>

    <!--
      Κάθε στοιχείο: λαβή (σύρε για αλλαγή σειράς), ώρες (υπολογισμένες),
      είδος (πάτα το εικονίδιο), τίτλος και λεπτά γράφονται ΕΠΙ ΤΟΠΟΥ — όπως ο
      τίτλος της συγκέντρωσης — και σώζονται μόνα τους. Το κολατσιό (κρουασάν)
      μπαίνει στο διατροφολόγιο. Το προγραμματικό έχει δική του σελίδα
      (εικονίδιο στα δεξιά) — εκεί γράφεται το markdown. Στο κινητό η γραμμή
      σπάει σε δύο: τίτλος πάνω, λεζάντα με κολατσιό και λεπτά κάτω.
    -->
    <q-list v-else-if="current" bordered class="rounded-borders">
      <div
        v-for="(row, idx) in rows"
        :key="row.id"
        v-show="matchesFilter(row.id)"
        class="schedule-row"
        :class="{ 'schedule-row--over': overId === row.id && dragId !== row.id, 'schedule-row--dragging': dragId === row.id }"
        :draggable="dragArmed === row.id"
        @dragstart="onDragStart(row.id, $event)"
        @dragover.prevent="overId = row.id"
        @dragleave="overId === row.id && (overId = null)"
        @drop.prevent="onDrop(row.id)"
        @dragend="onDragEnd"
        @focusin="focusRow(row.id)"
        @focusout="onRowBlur($event)"
      >
        <q-separator v-if="idx > 0" />
        <div class="schedule-item">
          <div v-if="canWrite && approvalFilter === 'all'" class="si-drag" @mousedown="dragArmed = row.id" @touchstart.passive="dragArmed = row.id">
            <q-icon name="drag_indicator" color="grey-5" size="24px" />
          </div>
          <div class="si-start text-weight-medium">
            {{ times[idx]?.start }}
            <div v-if="times[idx]?.delay" class="si-delay text-orange-9">
              {{ times[idx]!.delay > 0 ? '+' : '−' }}{{ Math.abs(times[idx]!.delay) }}΄
              <q-tooltip>Προγραμματισμένη ώρα {{ times[idx]?.planned }} — με την καθυστέρηση {{ times[idx]?.start }}</q-tooltip>
            </div>
          </div>
          <div class="si-end text-caption text-grey-6">{{ times[idx]?.end }}</div>
          <q-btn
            class="si-kind"
            flat
            round
            dense
            :icon="KIND_ICON[row.kind]"
            :color="KIND_COLOR[row.kind]"
            :disable="!canWrite"
            :aria-label="`Είδος: ${DRASI_SCHEDULE_KIND_LABEL[row.kind]}`"
          >
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
          <q-input v-model="row.title" :readonly="!canWrite" borderless dense class="si-title" placeholder="Τι γίνεται">
            <!-- Ποιος άλλος γράφει αυτή τη στιγμή σε αυτή τη γραμμή. -->
            <template v-if="editorsOf(row.id).length" #append>
              <CollabPresence :peers="editorsOf(row.id)" compact />
            </template>
          </q-input>
          <div class="si-caption text-caption text-grey-6 ellipsis">
            {{ scheduleCaption({ kindLabel: DRASI_SCHEDULE_KIND_LABEL[row.kind], location: row.location, responsibles: row.responsibles }, $q.screen.xs) }}
          </div>
          <!--
            Κολατσιό μέσα στο στοιχείο: μπαίνει στο διατροφολόγιο. Χωρίς: γκρι
            κρουασάν. Με: το ίδιο κουμπί γίνεται πορτοκαλί ετικέτα (πάτα για αλλαγή).
          -->
          <q-btn
            v-if="canWrite"
            class="si-snack"
            :class="{ 'si-snack--set': row.snack }"
            dense
            no-caps
            :size="row.snack ? '12px' : 'sm'"
            :flat="!row.snack"
            :round="!row.snack"
            :unelevated="!!row.snack"
            :rounded="!!row.snack"
            :icon="row.snack ? undefined : 'bakery_dining'"
            :label="row.snack ? DRASI_SNACK_LABEL[row.snack] : undefined"
            :color="row.snack ? 'orange-7' : 'grey-5'"
            :aria-label="row.snack ? `Κολατσιό: ${DRASI_SNACK_LABEL[row.snack]}` : 'Κολατσιό'"
          >
            <q-tooltip v-if="!row.snack">Κολατσιό</q-tooltip>
            <q-menu auto-close>
              <q-list dense>
                <q-item-label header>Κολατσιό</q-item-label>
                <q-item v-for="sn in snackOptions" :key="sn.value" clickable :active="sn.value === row.snack" active-class="text-klados" @click="row.snack = sn.value">
                  <q-item-section>{{ sn.label }}</q-item-section>
                </q-item>
                <q-item v-if="row.snack" clickable @click="row.snack = null">
                  <q-item-section class="text-grey-7">Χωρίς κολατσιό</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
          <q-badge v-else-if="row.snack" class="si-snack" color="orange-7" :label="DRASI_SNACK_LABEL[row.snack]" />
          <div class="si-dur">
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
          </div>
          <q-btn
            class="si-doc"
            flat
            dense
            round
            size="sm"
            :icon="docIcon(row).icon"
            :color="docIcon(row).color"
            :to="{ name: 'drasi-programmatiko', params: { id: drasiId, itemId: row.id } }"
            :aria-label="docIcon(row).label"
          >
            <q-tooltip>{{ docIcon(row).label }}</q-tooltip>
          </q-btn>
        </div>
      </div>
    </q-list>

    </template>

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
  DRASI_SNACK_LABEL,
  DrasiScheduleKind,
  DrasiSnack,
  type ApprovalSummaryRow,
  type DrasiScheduleItemView,
  type DrasiScheduleView,
  type KladosType,
} from '@trifylli/shared';
import CollabPresence from '../CollabPresence.vue';
import SaveStatus from '../SaveStatus.vue';
import TimeField from '../TimeField.vue';
import { ApiError, OfflineError, get, patch, post } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';
import { scheduleCaption, SCHEDULE_KIND_COLOR as KIND_COLOR, SCHEDULE_KIND_ICON as KIND_ICON } from './types';
import type { SaveState } from '../../lib/save-state';
import { useLiveReload, useRowPresence } from '../../composables/useLiveChanges';
import { APPROVAL_META, approvalsByItem, type ItemApproval } from '../../lib/approvals';
import { delaysOf } from '../../lib/schedule-live';
import DrasiLive from './DrasiLive.vue';

const props = defineProps<{
  drasiId: string;
  organiser: KladosType | null;
  canWrite: boolean;
}>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const view = ref<DrasiScheduleView | null>(null);

const kindOptions = (Object.keys(DrasiScheduleKind) as DrasiScheduleKind[]).map((k) => ({ label: DRASI_SCHEDULE_KIND_LABEL[k], value: k }));
const snackOptions = (Object.keys(DrasiSnack) as DrasiSnack[]).map((k) => ({ label: DRASI_SNACK_LABEL[k], value: k }));

const dayOptions = computed(() => (view.value?.days ?? []).map((d) => ({ label: formatDate(d.date), value: d.date })));
const dayKey = ref('');
watch(dayOptions, (opts) => {
  if (!opts.some((o) => o.value === dayKey.value) && opts[0]) dayKey.value = opts[0].value;
});
const current = computed(() => view.value?.days.find((d) => d.date === dayKey.value) ?? null);

/** «Ωρολόγιο» για τον σχεδιασμό, «Ζωντανά» την ώρα της δράσης — αυτό ανοίγει όταν η δράση τρέχει σήμερα. */
const mode = ref<'plan' | 'live'>('plan');
let modeChosen = false;
watch(view, (value) => {
  if (modeChosen || !value) return;
  modeChosen = true;
  const today = new Date().toLocaleDateString('en-CA');
  if (value.days.some((d) => d.date === today && d.items.length)) mode.value = 'live';
});
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

// ── Εγκρίσεις των προγραμματικών: σήμα στο κουμπί του καθενός και φίλτρο ──
const approvalRows = ref<ApprovalSummaryRow[]>([]);
const itemApprovals = computed(() => approvalsByItem(approvalRows.value, props.drasiId).item);
async function loadApprovals(): Promise<void> {
  try {
    approvalRows.value = await get<ApprovalSummaryRow[]>('/approvals', { params: { drasi: props.drasiId } });
  } catch {
    // Χωρίς τις εγκρίσεις το ωρολόγιο δουλεύει όπως πριν.
  }
}
onMounted(loadApprovals);
useLiveReload(['approvals'], loadApprovals);

type ApprovalFilter = 'all' | 'PROXEIRO' | 'ELEGXOS' | 'EGKRITHIKE' | 'changed';
const approvalFilter = ref<ApprovalFilter>('all');
const approvalFilterOptions: { label: string; value: ApprovalFilter }[] = [
  { label: 'Όλα', value: 'all' },
  { label: 'Πρόχειρα', value: 'PROXEIRO' },
  { label: 'Για έλεγχο', value: 'ELEGXOS' },
  { label: 'Εγκρίθηκαν', value: 'EGKRITHIKE' },
  { label: 'Άλλαξαν μετά την έγκριση', value: 'changed' },
];
function matchesFilter(itemId: string): boolean {
  const approval: ItemApproval | undefined = itemApprovals.value.get(itemId);
  switch (approvalFilter.value) {
    case 'all':
      return true;
    case 'changed':
      return !!approval?.changedAfter;
    case 'PROXEIRO':
      return !approval || approval.status === 'PROXEIRO';
    default:
      return approval?.status === approvalFilter.value;
  }
}

/** Το κουμπί του προγραμματικού λέει και πού είναι η έγκρισή του. */
function docIcon(row: { id: string; hasProgramma: boolean }): { icon: string; color: string; label: string } {
  const approval = itemApprovals.value.get(row.id);
  if (approval && approval.status !== 'PROXEIRO') {
    const meta = APPROVAL_META[approval.status];
    return approval.changedAfter
      ? { icon: 'published_with_changes', color: 'orange-8', label: 'Εγκρίθηκε — άλλαξε μετά την έγκριση' }
      : { icon: meta.icon, color: meta.color, label: `Προγραμματικό: ${meta.label.toLocaleLowerCase('el')}` };
  }
  return row.hasProgramma
    ? { icon: 'description', color: 'klados', label: 'Άνοιγμα προγραμματικού' }
    : { icon: 'note_add', color: 'grey-5', label: 'Χωρίς προγραμματικό — γράψε' };
}

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
  /** Δεκατιανό/απογευματινό μέσα στο στοιχείο — το γεύμα του μπαίνει στο διατροφολόγιο. */
  snack: DrasiSnack | null;
  /** Μόνο για τη λεζάντα — αλλάζουν από τη σελίδα του προγραμματικού. */
  location: string | null;
  responsibles: string[];
  hasProgramma: boolean;
}
const rows = ref<Row[]>([]);

function toRow(it: DrasiScheduleItemView): Row {
  return {
    id: it.id,
    title: it.title,
    durationMin: it.durationMin,
    kind: it.kind,
    snack: it.snack,
    location: it.location,
    responsibles: it.responsibles.map((p) => `${p.lastName} ${p.firstName}`),
    hasProgramma: it.hasProgramma,
  };
}

/**
 * Η βάση κάθε γραμμής: ό,τι ξέρουμε ότι έχει ο server. Μια αλλαγή είναι ό,τι
 * διαφέρει από αυτήν — και μόνο αυτό στέλνεται (όχι όλη η γραμμή), ώστε δύο που
 * αλλάζουν διαφορετικά πεδία της ίδιας γραμμής να μη σβήνουν ο ένας τον άλλον.
 */
const EDITABLE = ['title', 'durationMin', 'kind', 'snack'] as const;
type Editable = (typeof EDITABLE)[number];
type Change = Partial<Pick<Row, Editable>>;
const bases = new Map<string, Row>();
/** Αλλαγές που περιμένουν να σταλούν, ανά γραμμή — ακόμη κι αν η γραμμή δεν φαίνεται (άλλη ημέρα). */
const pending = new Map<string, Change>();
/** Γραμμές που στέλνονται αυτή τη στιγμή. */
const sending = new Set<string>();

/**
 * Νέα εικόνα από τον server (φόρτωση, ή αλλαγή κάποιου άλλου, ζωντανά): γίνεται
 * η νέα βάση. Ό,τι έχει αλλάξει εδώ και δεν έχει φτάσει ακόμη στον server μένει
 * όπως το έγραψε ο χρήστης· όλα τα άλλα έρχονται από τον server.
 */
watch(
  current,
  (day) => {
    const mine = new Map(rows.value.map((r) => [r.id, r]));
    rows.value = (day?.items ?? []).map((item) => {
      const server = toRow(item);
      // Αντίγραφο: η γραμμή της οθόνης αλλάζει επί τόπου, η βάση όχι.
      bases.set(server.id, { ...server });
      const local = mine.get(server.id);
      const change = pending.get(server.id);
      if (!local || !(change || sending.has(server.id))) return server;
      return { ...server, ...(change ?? pick(local, EDITABLE)) };
    });
  },
  { immediate: true },
);

function pick(row: Row, fields: readonly Editable[]): Change {
  return Object.fromEntries(fields.map((field) => [field, row[field]])) as Change;
}

/** Οι ώρες βγαίνουν εδώ, από την έναρξη της ημέρας και τις διάρκειες — ίδια πράξη με τον server. */
const clampMin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1440, Math.max(1, Math.round(v))) : 1);
const times = computed(() => {
  const [h, m] = (current.value?.startTime ?? '00:00').split(':').map(Number);
  let cursor = (h ?? 0) * 60 + (m ?? 0);
  const fmt = (min: number) => `${String(Math.floor((((min / 60) % 24) + 24) % 24)).padStart(2, '0')}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;
  // Η καθυστέρηση («καθυστερούμε 15΄ από εδώ») μετακινεί τις ώρες — με τη σειρά που βλέπεις.
  const delays = delaysOf(rows.value.map((r) => r.id), current.value?.delays ?? []);
  return rows.value.map((r) => {
    const start = cursor;
    cursor += clampMin(r.durationMin);
    const delay = delays.get(r.id) ?? 0;
    return { start: fmt(start + delay), end: fmt(cursor + delay), planned: fmt(start), delay };
  });
});
const totalMin = computed(() => rows.value.reduce((s, r) => s + clampMin(r.durationMin), 0));

// ── Αυτόματη αποθήκευση: ποια πεδία ποιας γραμμής άλλαξαν, PATCH μόνο αυτά ──
const AUTOSAVE_DELAY_MS = 1000;
const saveStatus = ref<SaveState>('clean');
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  rows,
  (list) => {
    let changed = false;
    for (const r of list) {
      const base = bases.get(r.id);
      if (!base) continue;
      const change = Object.fromEntries(EDITABLE.filter((field) => r[field] !== base[field]).map((field) => [field, r[field]])) as Change;
      const before = JSON.stringify(pending.get(r.id) ?? {});
      if (Object.keys(change).length) pending.set(r.id, change);
      else pending.delete(r.id);
      if (JSON.stringify(change) !== before) changed = true;
    }
    if (!changed || !props.canWrite) return;
    saveStatus.value = pending.size ? 'pending' : 'saved';
    if (timer) clearTimeout(timer);
    if (pending.size) timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
  },
  { deep: true },
);

async function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!pending.size) return;
  saveStatus.value = 'saving';
  const batch = [...pending.entries()];
  try {
    for (const [id, change] of batch) {
      const body: Record<string, unknown> = { ...change };
      if ('title' in change) {
        if (change.title?.trim()) body.title = change.title.trim();
        else delete body.title;
      }
      if ('durationMin' in change) body.durationMin = clampMin(change.durationMin);
      if (!Object.keys(body).length) continue;
      sending.add(id);
      try {
        await patch(`/draseis/${props.drasiId}/schedule/${id}`, body);
      } finally {
        sending.delete(id);
      }
      // Ό,τι στάλθηκε είναι πια η βάση· ό,τι γράφτηκε στο μεταξύ μένει να σταλεί.
      const base = bases.get(id);
      if (base) bases.set(id, { ...base, ...body });
      if (pending.get(id) === change) pending.delete(id);
    }
    saveStatus.value = pending.size ? 'pending' : 'saved';
    if (pending.size && !timer) timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
  } catch (err) {
    if (err instanceof OfflineError) {
      saveStatus.value = 'offline';
      return;
    }
    saveStatus.value = 'error';
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  }
}
onBeforeUnmount(() => {
  if (pending.size) void saveNow();
});

// Ποιος γράφει σε ποια γραμμή: η δική μας θέση πάει στους άλλους, οι δικές τους
// φαίνονται δίπλα στον τίτλο.
const { editorsOf, focusRow } = useRowPresence('schedule');
function onRowBlur(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (next && (event.currentTarget as HTMLElement).contains(next)) return;
  focusRow(null);
}

// Ζωντανά: ό,τι αλλάζουν οι άλλοι στο ωρολόγιο εμφανίζεται εδώ — με τις δικές
// μας αλλαγές που δεν έχουν σταλεί ακόμη στη θέση τους.
useLiveReload(['schedule', 'participants', 'roles'], reload, { busy: () => sending.size > 0 });

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
  // «Βάλε το Χ μετά το Ψ» — όχι όλη η λίστα: ό,τι πρόσθεσε ή μετακίνησε κάποιος
  // άλλος στο μεταξύ μένει στη θέση του.
  const at = list.findIndex((r) => r.id === from);
  try {
    await post(`/draseis/${props.drasiId}/schedule/${from}/move`, { afterId: at > 0 ? list[at - 1]!.id : null });
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
/*
  Μία γραμμή στον υπολογιστή: ώρα έναρξης στο ύψος του τίτλου, λήξη στο ύψος
  της λεζάντας. Τα κομμάτια που λείπουν (λαβή, κολατσιό χωρίς δικαίωμα) αφήνουν
  τη στήλη τους μηδενική — γι' αυτό περιθώρια, όχι gap.
*/
.schedule-item {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto auto auto;
  grid-template-areas:
    'drag start kind title   snack dur doc'
    'drag end   kind caption snack dur doc';
  align-items: center;
  padding: 4px 16px;
}
.si-drag {
  grid-area: drag;
  display: flex;
  cursor: grab;
  padding-right: 4px;
}
/* Ισοπλατή ψηφία: η στήλη της ώρας έχει ίδιο πλάτος σε κάθε γραμμή — κάθε γραμμή είναι δικό της grid. */
.si-start,
.si-end {
  padding-right: 16px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.si-start {
  grid-area: start;
}
.si-delay {
  font-size: 11px;
  line-height: 1.1;
}
.si-end {
  grid-area: end;
}
.si-kind {
  grid-area: kind;
  justify-self: center;
  margin-right: 12px;
}
.si-title {
  grid-area: title;
}
.si-title :deep(input) {
  font-weight: 500;
  padding: 0;
}
.si-caption {
  grid-area: caption;
}
.si-snack {
  grid-area: snack;
  margin-left: 8px;
}
/* Αν δεν χωρά (πολύ στενό κινητό), η ετικέτα κόβεται με «…» — όχι η ώρα ή τα λεπτά. */
.si-snack--set {
  min-width: 0;
  padding: 0 10px;
  font-weight: 500;
}
.si-snack--set :deep(.q-btn__content) {
  flex-wrap: nowrap;
  min-width: 0;
}
.si-snack--set :deep(.block) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-dur {
  grid-area: dur;
  margin-left: 8px;
}
.si-doc {
  grid-area: doc;
  justify-self: end;
  margin-left: 4px;
}
.row-duration {
  width: 92px;
}
/*
  Κινητό: ο τίτλος παίρνει όλη την πρώτη γραμμή ως το εικονίδιο του
  προγραμματικού· κολατσιό και λεπτά πάνε κάτω, δίπλα στη λήξη. Η τελευταία
  στήλη έχει σταθερό πλάτος (εικονίδιο + περιθώριο), αλλιώς φάρδαινε όσο τα
  λεπτά από κάτω και έτρωγε τον τίτλο. Πεδία 32px αντί για 40.
*/
@media (max-width: 599.98px) {
  .schedule-item {
    grid-template-columns: auto auto auto minmax(0, 1fr) auto auto 28px;
    grid-template-areas:
      'drag start kind title   title title doc'
      'drag end   kind caption snack dur   dur';
    padding: 4px 10px 6px;
  }
  .si-drag {
    padding-right: 2px;
  }
  .si-start,
  .si-end {
    padding-right: 8px;
  }
  .si-kind {
    margin-right: 4px;
  }
  .row-duration {
    width: 72px;
  }
  .si-title :deep(.q-field__control),
  .si-title :deep(.q-field__marginal),
  .row-duration :deep(.q-field__control),
  .row-duration :deep(.q-field__marginal) {
    height: 32px;
  }
  .si-title :deep(.q-field__native),
  .row-duration :deep(.q-field__native),
  .row-duration :deep(.q-field__suffix) {
    padding-top: 2px;
    padding-bottom: 2px;
  }
}
.schedule-row--dragging {
  opacity: 0.4;
}
.schedule-row--over {
  box-shadow: inset 0 3px 0 var(--klados-ink);
}
</style>
