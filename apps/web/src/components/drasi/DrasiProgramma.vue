<template>
  <!--
    Το πρόγραμμα της δράσης σε δύο επίπεδα: πρώτα το ΩΡΟΛΟΓΙΟ (ημέρα, από–έως,
    τίτλος, είδος) και μετά, σε κάθε στοιχείο, το ΠΡΟΓΡΑΜΜΑΤΙΚΟ — markdown,
    υπεύθυνος διεξαγωγής & υλοποίησης, υλικό. Ανεξάρτητο από τις συγκεντρώσεις.
  -->
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn-toggle v-model="day" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="dayOptions" />
      <q-space />
      <q-btn v-if="canWrite && itemsOfDay.length && dayOptions.length > 1" flat color="klados" icon="content_copy" label="Αντιγραφή ημέρας σε…" @click="copyDialog = true" />
    </div>

    <!-- Γρήγορη προσθήκη στο ωρολόγιο: ώρα, τίτλος, Enter -->
    <q-card v-if="canWrite" flat bordered class="q-pa-sm q-mb-md">
      <div class="row q-col-gutter-sm items-start">
        <div class="col-6 col-sm-2"><TimeField v-model="draft.start" label="Από" /></div>
        <div class="col-6 col-sm-2"><TimeField v-model="draft.end" label="Έως" /></div>
        <div class="col-12 col-sm-4"><q-input v-model="draft.title" label="Τι γίνεται" outlined dense color="klados" @keyup.enter="add" /></div>
        <div class="col-9 col-sm-3"><q-select v-model="draft.kind" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados" /></div>
        <div class="col-3 col-sm-1 row items-center">
          <q-btn round dense color="klados" text-color="klados-on" icon="add" :disable="!draft.start || !draft.title.trim()" :loading="saving" @click="add" />
        </div>
      </div>
    </q-card>

    <q-inner-loading :showing="loading" />

    <div v-if="!loading && !itemsOfDay.length" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="schedule" size="40px" class="block q-mb-sm" />
      Το ωρολόγιο της ημέρας είναι άδειο. Βάλε πρώτα τα κουτάκια — εγερτήριο, πρωινό, δραστηριότητες — και
      μετά γράψε σε καθένα το προγραμματικό του.
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-expansion-item v-for="it in itemsOfDay" :key="it.id" :model-value="openId === it.id" @update:model-value="(v: boolean) => (openId = v ? it.id : null)">
        <template #header>
          <q-item-section side class="clock">
            <div class="text-weight-medium">{{ formatTime(it.startsAt) }}</div>
            <div v-if="it.endsAt" class="text-caption text-grey-6">{{ formatTime(it.endsAt) }}</div>
          </q-item-section>
          <q-item-section avatar>
            <q-icon :name="KIND_ICON[it.kind]" :color="KIND_COLOR[it.kind]" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ it.title }}<span v-if="it.location" class="text-grey-6"> · {{ it.location }}</span></q-item-label>
            <q-item-label caption>
              {{ DRASI_SCHEDULE_KIND_LABEL[it.kind] }}
              <span v-if="it.responsible"> · διεξαγωγή: {{ it.responsible.lastName }} {{ it.responsible.firstName }}</span>
              <span v-if="it.executor"> · υλοποίηση: {{ it.executor.lastName }} {{ it.executor.firstName }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-icon :name="it.hasProgramma ? 'description' : 'note_add'" :color="it.hasProgramma ? 'klados' : 'grey-5'">
              <q-tooltip>{{ it.hasProgramma ? 'Έχει προγραμματικό' : 'Χωρίς προγραμματικό' }}</q-tooltip>
            </q-icon>
          </q-item-section>
        </template>

        <!-- ── Το προγραμματικό ── -->
        <q-card flat class="bg-grey-1">
          <q-card-section v-if="editing && editing.id === it.id" class="q-gutter-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-6 col-sm-2"><TimeField v-model="editing.start" label="Από" /></div>
              <div class="col-6 col-sm-2"><TimeField v-model="editing.end" label="Έως" /></div>
              <div class="col-12 col-sm-5"><q-input v-model="editing.title" label="Τίτλος" outlined dense color="klados" /></div>
              <div class="col-12 col-sm-3"><q-select v-model="editing.kind" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados" /></div>
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
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Αντιγραφή της {{ formatDate(day) }} σε…</q-card-section>
        <q-card-section>
          <q-select v-model="copyTo" :options="dayOptions.filter((d) => d.value !== day)" label="Ημέρα" outlined dense emit-value map-options color="klados" />
          <div class="text-caption text-grey-7 q-mt-sm">Αντιγράφονται τα στοιχεία με τις ίδιες ώρες, μαζί με τα προγραμματικά τους.</div>
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
  type KladosType,
  type MemberSummary,
  type Paginated,
  type YlikoAvailability,
} from '@trifylli/shared';
import MarkdownField from '../MarkdownField.vue';
import StelexosPicker from '../StelexosPicker.vue';
import TimeField from '../TimeField.vue';
import { ApiError, del, get, patch, post } from '../../lib/api';
import { formatDate, formatTime, toISODate } from '../../lib/format';
import { renderMarkdown } from '../../lib/markdown';

const props = defineProps<{
  drasiId: string;
  dateStart: string;
  dateEnd: string;
  organiser: KladosType | null;
  canWrite: boolean;
}>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const items = ref<DrasiScheduleItemView[]>([]);
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

// ── Ημέρες: από την έναρξη έως τη λήξη, συν όποια έχει στοιχεία εκτός εύρους ──
const dayOptions = computed(() => {
  const set = new Set<string>();
  for (let d = new Date(`${toISODate(new Date(props.dateStart))}T12:00:00`); d <= new Date(props.dateEnd); d = new Date(d.getTime() + 86_400_000)) set.add(toISODate(d));
  for (const it of items.value) set.add(toISODate(new Date(it.startsAt)));
  return [...set].sort().map((d) => ({ label: formatDate(d), value: d }));
});
const day = ref<string>(toISODate(new Date(props.dateStart)));
watch(dayOptions, (opts) => {
  if (!opts.some((o) => o.value === day.value) && opts[0]) day.value = opts[0].value;
});
const itemsOfDay = computed(() => items.value.filter((it) => toISODate(new Date(it.startsAt)) === day.value));

async function reload(): Promise<void> {
  loading.value = true;
  try {
    items.value = await get<DrasiScheduleItemView[]>(`/draseis/${props.drasiId}/schedule`);
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

/** Τοπική ημερομηνία + «HH:mm» → ISO. */
function at(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00`).toISOString();
}

// ── Ωρολόγιο: προσθήκη ──
const draft = reactive({ start: '', end: '', title: '', kind: 'DRASTIRIOTITA' as DrasiScheduleKind });
async function add(): Promise<void> {
  if (!draft.start || !draft.title.trim()) return;
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/schedule`, {
      startsAt: at(day.value, draft.start),
      ...(draft.end ? { endsAt: at(day.value, draft.end) } : {}),
      title: draft.title.trim(),
      kind: draft.kind,
    });
    // Η επόμενη καταχώριση ξεκινά από εκεί που τελείωσε η προηγούμενη.
    Object.assign(draft, { start: draft.end || draft.start, end: '', title: '' });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία προσθήκης.');
  } finally {
    saving.value = false;
  }
}

// ── Προγραμματικό: επεξεργασία ──
interface EditState {
  id: string;
  start: string;
  end: string;
  title: string;
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
    start: formatTime(it.startsAt),
    end: it.endsAt ? formatTime(it.endsAt) : '',
    title: it.title,
    kind: it.kind,
    location: it.location ?? '',
    responsible: it.responsible ? [it.responsible.id] : [],
    executor: it.executor ? [it.executor.id] : [],
    description: it.description ?? '',
    yliko: it.yliko.map((y) => y.ylikoId),
    ylikoNotes: it.ylikoNotes ?? '',
  };
  // Οι ήδη επιλεγμένες επιλογές πρέπει να υπάρχουν στο options για να δείξουν όνομα.
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
  if (!e || !e.title.trim() || !e.start) return;
  saving.value = true;
  try {
    await patch(`/draseis/${props.drasiId}/schedule/${e.id}`, {
      startsAt: at(day.value, e.start),
      endsAt: e.end ? at(day.value, e.end) : null,
      title: e.title.trim(),
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
    message: `«${it.title}» στις ${formatTime(it.startsAt)} — μαζί με το προγραμματικό του. Συνέχεια;`,
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
    const r = await post<{ copied: number }>(`/draseis/${props.drasiId}/schedule/copy-day`, { from: day.value, to: copyTo.value });
    copyDialog.value = false;
    $q.notify({ type: 'positive', message: `Αντιγράφηκαν ${r.copied} στοιχεία.` });
    day.value = copyTo.value;
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
