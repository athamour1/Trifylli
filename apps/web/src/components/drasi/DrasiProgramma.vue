<template>
  <!--
    Το πρόγραμμα της δράσης: ΩΡΟΛΟΓΙΟ χωρίς ώρες — η ημέρα ξεκινά από την ώρα
    που ορίστηκε στο Στήσιμο, κάθε προγραμματικό έχει ΔΙΑΡΚΕΙΑ, και οι ώρες
    προκύπτουν αθροιστικά. Αλλαγή σειράς ή διάρκειας ξαναϋπολογίζει τα πάντα.
  -->
  <div>
    <div class="row items-center q-mb-sm q-gutter-sm">
      <q-btn-toggle v-model="dayKey" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="dayOptions" />
      <q-space />
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
        {{ current.items.length }} στοιχεία · {{ formatDuration(totalMin) }} · λήξη {{ hm(current.items[current.items.length - 1]!.endsAt) }}
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
      <q-icon name="schedule" size="40px" class="block q-mb-sm" />
      Το ωρολόγιο της ημέρας είναι άδειο. Γράψε τι γίνεται και πόσο κρατά — η ώρα βγαίνει μόνη της από την έναρξη.
    </div>

    <q-list v-else-if="current" bordered separator class="rounded-borders">
      <q-expansion-item v-for="(it, idx) in current.items" :key="it.id" :model-value="openId === it.id" @update:model-value="(v: boolean) => (openId = v ? it.id : null)">
        <template #header>
          <q-item-section side class="clock">
            <div class="text-weight-medium">{{ hm(it.startsAt) }}</div>
            <div class="text-caption text-grey-6">{{ hm(it.endsAt) }}</div>
          </q-item-section>
          <q-item-section avatar>
            <q-icon :name="KIND_ICON[it.kind]" :color="KIND_COLOR[it.kind]" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ it.title }}<span v-if="it.location" class="text-grey-6"> · {{ it.location }}</span></q-item-label>
            <q-item-label caption>
              {{ formatDuration(it.durationMin) }} · {{ DRASI_SCHEDULE_KIND_LABEL[it.kind] }}
              <span v-if="it.responsible"> · διεξαγωγή: {{ it.responsible.lastName }} {{ it.responsible.firstName }}</span>
              <span v-if="it.executor"> · υλοποίηση: {{ it.executor.lastName }} {{ it.executor.firstName }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap">
              <template v-if="canWrite">
                <q-btn flat dense round size="sm" icon="arrow_upward" :disable="idx === 0" @click.stop="move(idx, -1)" />
                <q-btn flat dense round size="sm" icon="arrow_downward" :disable="idx === current.items.length - 1" @click.stop="move(idx, 1)" />
              </template>
              <q-icon :name="it.hasProgramma ? 'description' : 'note_add'" :color="it.hasProgramma ? 'klados' : 'grey-5'" class="q-ml-xs">
                <q-tooltip>{{ it.hasProgramma ? 'Έχει προγραμματικό' : 'Χωρίς προγραμματικό' }}</q-tooltip>
              </q-icon>
            </div>
          </q-item-section>
        </template>

        <!-- ── Το προγραμματικό ── -->
        <q-card flat class="bg-grey-1">
          <q-card-section v-if="editing && editing.id === it.id" class="q-gutter-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-5"><q-input v-model="editing.title" label="Τίτλος" outlined dense color="klados" /></div>
              <div class="col-5 col-sm-2"><q-input v-model.number="editing.durationMin" type="number" label="Λεπτά" outlined dense :min="1" :max="1440" color="klados" /></div>
              <div class="col-7 col-sm-5"><q-select v-model="editing.kind" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados" /></div>
              <div class="col-12 col-sm-4"><q-input v-model="editing.location" label="Χώρος" outlined dense color="klados" /></div>
              <div class="col-12 col-sm-4"><StelexosPicker v-model="editing.responsible" label="Υπεύθυνος διεξαγωγής" :options="stelexiOptions" /></div>
              <div class="col-12 col-sm-4"><StelexosPicker v-model="editing.executor" label="Υπεύθυνος υλοποίησης" :options="stelexiOptions" /></div>
            </div>
            <MarkdownField v-model="editing.description" label="Προγραμματικό" placeholder="Markdown: στόχος, οδηγίες, κανόνες, εναλλακτική αν βρέξει…" :min-height="120" />
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="editing.yliko"
                  :options="ylikoOptions"
                  label="Υλικό από τις αποθήκες"
                  outlined
                  dense
                  multiple
                  use-chips
                  use-input
                  emit-value
                  map-options
                  color="klados"
                  input-debounce="300"
                  @filter="filterYliko"
                />
              </div>
              <div class="col-12 col-sm-6"><q-input v-model="editing.ylikoNotes" label="Άλλο υλικό (ελεύθερο κείμενο)" outlined dense color="klados" /></div>
            </div>
            <div class="row q-gutter-sm">
              <q-btn color="klados" text-color="klados-on" unelevated label="Αποθήκευση" :loading="saving" @click="save" />
              <q-btn flat label="Άκυρο" @click="editing = null" />
              <q-space />
              <q-btn flat color="negative" icon="delete" label="Διαγραφή" @click="remove(it)" />
            </div>
          </q-card-section>

          <q-card-section v-else class="q-py-sm">
            <div v-if="it.description" class="markdown-body q-mb-sm" v-html="renderMarkdown(it.description, () => null)" />
            <div v-else class="text-caption text-grey-6 q-mb-sm">Δεν έχει γραφτεί προγραμματικό.</div>
            <div v-if="it.yliko.length || it.ylikoNotes" class="text-caption">
              <b>Υλικό:</b> {{ [...it.yliko.map((y) => `${y.name}${y.qty > 1 ? ` ×${y.qty}` : ''}`), it.ylikoNotes ?? ''].filter(Boolean).join(', ') }}
            </div>
            <q-btn v-if="canWrite" flat dense color="klados" icon="edit" label="Επεξεργασία" class="q-mt-xs" @click="startEdit(it)" />
          </q-card-section>
        </q-card>
      </q-expansion-item>
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_SCHEDULE_KIND_LABEL,
  DrasiScheduleKind,
  KLADOS_LABEL,
  type DrasiScheduleItemView,
  type DrasiScheduleView,
  type KladosType,
  type MemberSummary,
  type Paginated,
  type YlikoAvailability,
} from '@trifylli/shared';
import MarkdownField from '../MarkdownField.vue';
import StelexosPicker from '../StelexosPicker.vue';
import TimeField from '../TimeField.vue';
import { ApiError, del, get, patch, post, put } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';
import { renderMarkdown } from '../../lib/markdown';

const props = defineProps<{
  drasiId: string;
  organiser: KladosType | null;
  canWrite: boolean;
}>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const view = ref<DrasiScheduleView | null>(null);
const openId = ref<string | null>(null);

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

/** «HH:mm» 24ωρο — ένα ωρολόγιο διαβάζεται με 24ωρο, όχι με π.μ./μ.μ. */
const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const dayOptions = computed(() => (view.value?.days ?? []).map((d) => ({ label: formatDate(d.date), value: d.date })));
const dayKey = ref('');
watch(dayOptions, (opts) => {
  if (!opts.some((o) => o.value === dayKey.value) && opts[0]) dayKey.value = opts[0].value;
});
const current = computed(() => view.value?.days.find((d) => d.date === dayKey.value) ?? null);
const isFirstDay = computed(() => view.value?.days[0]?.date === dayKey.value);
const totalMin = computed(() => current.value?.items.reduce((s, i) => s + i.durationMin, 0) ?? 0);
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

const stelexi = ref<MemberSummary[]>([]);
const stelexiOptions = computed(() => stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })));
onMounted(async () => {
  await reload();
  try {
    stelexi.value = (await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } })).items;
  } catch {
    // Χωρίς στελέχη, οι pickers μένουν άδειοι.
  }
});

// ── Έναρξη ημέρας ──
async function setDayStart(time: string | null): Promise<void> {
  if (time === current.value?.startTime) return;
  try {
    await patch(`/draseis/${props.drasiId}/schedule/day-start`, { date: dayKey.value, time: time || null });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Ωρολόγιο: προσθήκη / σειρά ──
const draft = reactive({ title: '', durationMin: 30, kind: 'DRASTIRIOTITA' as DrasiScheduleKind });
async function add(): Promise<void> {
  if (!draft.title.trim() || !draft.durationMin) return;
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/schedule`, { date: dayKey.value, title: draft.title.trim(), durationMin: draft.durationMin, kind: draft.kind });
    draft.title = '';
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία προσθήκης.');
  } finally {
    saving.value = false;
  }
}
async function move(idx: number, delta: number): Promise<void> {
  if (!current.value) return;
  const ids = current.value.items.map((i) => i.id);
  const target = idx + delta;
  if (target < 0 || target >= ids.length) return;
  [ids[idx], ids[target]] = [ids[target]!, ids[idx]!];
  try {
    await put(`/draseis/${props.drasiId}/schedule/reorder`, { date: dayKey.value, ids });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Προγραμματικό ──
interface EditState {
  id: string;
  title: string;
  durationMin: number;
  kind: DrasiScheduleKind;
  location: string;
  responsible: string[];
  executor: string[];
  description: string;
  yliko: string[];
  ylikoNotes: string;
}
const editing = ref<EditState | null>(null);
const ylikoOptions = ref<{ label: string; value: string }[]>([]);

function startEdit(it: DrasiScheduleItemView): void {
  editing.value = {
    id: it.id,
    title: it.title,
    durationMin: it.durationMin,
    kind: it.kind,
    location: it.location ?? '',
    responsible: it.responsible ? [it.responsible.id] : [],
    executor: it.executor ? [it.executor.id] : [],
    description: it.description ?? '',
    yliko: it.yliko.map((y) => y.ylikoId),
    ylikoNotes: it.ylikoNotes ?? '',
  };
  ylikoOptions.value = it.yliko.map((y) => ({ label: y.name, value: y.ylikoId }));
}

async function filterYliko(needle: string, update: (fn: () => void) => void): Promise<void> {
  try {
    const page = await get<Paginated<YlikoAvailability>>('/yliko', {
      params: { pageSize: 50, ...(props.organiser ? { klados: props.organiser } : {}), ...(needle ? { q: needle } : {}) },
    });
    update(() => {
      const chosen = ylikoOptions.value.filter((o) => editing.value?.yliko.includes(o.value));
      const fresh = page.items.map((y) => ({ label: `${y.name}${y.ownerKladosType ? ` (${KLADOS_LABEL[y.ownerKladosType]})` : ''}`, value: y.ylikoId }));
      ylikoOptions.value = [...chosen, ...fresh.filter((f) => !chosen.some((c) => c.value === f.value))];
    });
  } catch {
    update(() => undefined);
  }
}

async function save(): Promise<void> {
  const e = editing.value;
  if (!e || !e.title.trim() || !e.durationMin) return;
  saving.value = true;
  try {
    await patch(`/draseis/${props.drasiId}/schedule/${e.id}`, {
      title: e.title.trim(),
      durationMin: e.durationMin,
      kind: e.kind,
      location: e.location || null,
      description: e.description || null,
      responsibleId: e.responsible[0] ?? null,
      executorId: e.executor[0] ?? null,
      ylikoNotes: e.ylikoNotes || null,
      yliko: e.yliko.map((ylikoId) => ({ ylikoId, qty: 1 })),
    });
    editing.value = null;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    saving.value = false;
  }
}

function remove(it: DrasiScheduleItemView): void {
  $q.dialog({
    title: 'Διαγραφή',
    message: `«${it.title}» (${formatDuration(it.durationMin)}) — μαζί με το προγραμματικό του. Τα επόμενα μετακινούνται νωρίτερα. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/schedule/${it.id}`);
      editing.value = null;
      await reload();
    } catch (err) {
      notifyError(err, 'Αποτυχία διαγραφής.');
    }
  });
}

// ── Αντιγραφή ημέρας ──
const copyDialog = ref(false);
const copyTo = ref<string | null>(null);
async function copyDay(): Promise<void> {
  if (!copyTo.value) return;
  saving.value = true;
  try {
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
</style>
