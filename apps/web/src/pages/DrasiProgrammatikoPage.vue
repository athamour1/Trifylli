<template>
  <!--
    Το προγραμματικό ενός στοιχείου του ωρολογίου: δική του σελίδα, με το markdown
    (εικόνες, προεπισκόπηση) όπως στις συγκεντρώσεις, και ό,τι άλλο το πλαισιώνει
    (λεπτά, είδος, χώρος, υπεύθυνοι, υλικό). Σώζει μόνη της — δεν έχει κουμπί.
  -->
  <q-page padding>
    <PageState :loading="loading && !item" :error="error" :stale="stale" @retry="reload">
      <template v-if="item && drasi">
        <!-- ── Κεφαλίδα ── -->
        <div class="row items-start no-wrap q-mb-md">
          <q-btn flat round dense icon="arrow_back" color="klados" class="q-mr-sm q-mt-xs" @click="goBack">
            <q-tooltip>Πίσω στο πρόγραμμα</q-tooltip>
          </q-btn>
          <div class="col row items-start justify-between q-col-gutter-sm">
            <div class="col-12 col-sm">
              <q-input v-model="form.title" :readonly="!editable" borderless dense class="page-title" placeholder="Τι γίνεται" />
              <div class="text-caption text-grey-7">
                {{ drasi.title }} · {{ formatDateLong(item.date) }} · {{ hm(item.startsAt) }}–{{ hm(item.endsAt) }}
                · {{ formatDuration(item.durationMin) }}
              </div>
            </div>
            <div class="col-12 col-sm-auto row items-center q-gutter-sm">
              <SaveStatus v-if="editable" :status="saveStatus" @retry="saveNow" />
              <q-btn flat round dense icon="chevron_left" color="klados" :disable="!neighbours.prev" @click="goTo(neighbours.prev)">
                <q-tooltip>Προηγούμενο στοιχείο</q-tooltip>
              </q-btn>
              <q-btn flat round dense icon="chevron_right" color="klados" :disable="!neighbours.next" @click="goTo(neighbours.next)">
                <q-tooltip>Επόμενο στοιχείο</q-tooltip>
              </q-btn>
            </div>
          </div>
        </div>

        <!-- ── Πλαίσιο ── -->
        <q-card flat bordered class="q-mb-md">
          <q-card-section class="row q-col-gutter-sm">
            <div class="col-6 col-sm-2">
              <q-input v-model.number="form.durationMin" :readonly="!editable" type="number" label="Λεπτά" outlined dense :min="1" :max="1440" color="klados" />
            </div>
            <div class="col-6 col-sm-3">
              <q-select v-model="form.kind" :readonly="!editable" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados">
                <template #prepend><q-icon :name="KIND_ICON[form.kind]" :color="KIND_COLOR[form.kind]" /></template>
              </q-select>
            </div>
            <div class="col-12 col-sm-7"><q-input v-model="form.location" :readonly="!editable" label="Χώρος" outlined dense color="klados" /></div>
            <div class="col-12 col-sm-6">
              <StelexosPicker v-if="editable" v-model="form.responsible" label="Υπεύθυνος διεξαγωγής" :options="stelexiOptions" />
              <q-input v-else :model-value="nameOf(form.responsible[0])" label="Υπεύθυνος διεξαγωγής" outlined dense readonly />
            </div>
            <div class="col-12 col-sm-6">
              <StelexosPicker v-if="editable" v-model="form.executor" label="Υπεύθυνος υλοποίησης" :options="stelexiOptions" />
              <q-input v-else :model-value="nameOf(form.executor[0])" label="Υπεύθυνος υλοποίησης" outlined dense readonly />
            </div>
          </q-card-section>
        </q-card>

        <!-- ── Το κείμενο ── -->
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <MarkdownField
              v-model="form.description"
              :klados="drasi.klados?.type ?? null"
              :readonly="!editable"
              label="Προγραμματικό"
              placeholder="Markdown: στόχος, πορεία, οδηγίες, κανόνες, εναλλακτική αν βρέξει… Σύρε ή επικόλλησε εικόνες."
              empty-text="Δεν έχει γραφτεί προγραμματικό."
              :min-height="360"
            />
          </q-card-section>
        </q-card>

        <!-- ── Υλικό ── -->
        <q-card flat bordered>
          <q-card-section class="text-subtitle2 q-pb-xs">Υλικό</q-card-section>
          <q-card-section class="q-pt-none row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-select
                v-if="editable"
                v-model="form.yliko"
                :options="ylikoOptions"
                label="Από τις αποθήκες"
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
              <q-input v-else :model-value="form.yliko.map(ylikoName).join(', ') || '—'" label="Από τις αποθήκες" outlined dense readonly />
            </div>
            <div class="col-12 col-sm-6"><q-input v-model="form.ylikoNotes" :readonly="!editable" label="Άλλο υλικό (ελεύθερο κείμενο)" outlined dense color="klados" /></div>
          </q-card-section>
          <q-card-actions v-if="editable" align="right">
            <q-btn flat color="negative" icon="delete" label="Διαγραφή στοιχείου" @click="remove" />
          </q-card-actions>
        </q-card>
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  DRASI_SCHEDULE_KIND_LABEL,
  DrasiScheduleKind,
  KLADOS_LABEL,
  type DrasiScheduleItemView,
  type DrasiScheduleView,
  type DrasiStatus,
  type KladosType,
  type MemberSummary,
  type Paginated,
  type YlikoAvailability,
} from '@trifylli/shared';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import StelexosPicker from '../components/StelexosPicker.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, OfflineError, del, get, patch } from '../lib/api';
import { formatDateLong, formatDuration } from '../lib/format';
import { useKladosThemeStore } from '../stores/klados-theme';
import type { SaveState } from '../lib/save-state';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';

const kladosTheme = useKladosThemeStore();

interface DrasiHead {
  id: string;
  title: string;
  status: DrasiStatus;
  klados: { type: KladosType } | null;
}

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const offline = useOfflineStore();
const drasiId = String(route.params.id);
const itemId = computed(() => String(route.params.itemId));

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
const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── Φόρτωση: η δράση (τίτλος, κλάδος, κατάσταση) και όλο το ωρολόγιο, για να
//    βρούμε το στοιχείο με τις υπολογισμένες ώρες του και τους γείτονές του ──
const { data, loading, error, stale, reload } = useAsyncData(
  async () => {
    const [drasi, schedule] = await Promise.all([get<DrasiHead>(`/draseis/${drasiId}`), get<DrasiScheduleView>(`/draseis/${drasiId}/schedule`)]);
    return { drasi, schedule };
  },
  { forbiddenPage: true, cacheKey: `drasi-schedule:${drasiId}` },
);
const drasi = computed(() => data.value?.drasi ?? null);
const dayOf = computed(() => data.value?.schedule.days.find((d) => d.items.some((i) => i.id === itemId.value)) ?? null);
const item = computed<DrasiScheduleItemView | null>(() => dayOf.value?.items.find((i) => i.id === itemId.value) ?? null);
const neighbours = computed(() => {
  const items = dayOf.value?.items ?? [];
  const idx = items.findIndex((i) => i.id === itemId.value);
  return { prev: items[idx - 1]?.id ?? null, next: items[idx + 1]?.id ?? null };
});

watch(
  () => (drasi.value ? (drasi.value.klados?.type ?? null) : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

const editable = computed(() => !!drasi.value && drasi.value.status !== 'KLEISTI' && auth.can('drasi:write', drasi.value.klados?.type ?? undefined));

// ── Στελέχη & υλικό για τους pickers ──
const stelexi = ref<MemberSummary[]>([]);
const stelexiOptions = computed(() => stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })));
const knownNames = new Map<string, string>();
const nameOf = (id: string | undefined): string => (id ? (stelexiOptions.value.find((o) => o.value === id)?.label ?? knownNames.get(id) ?? '') : '—');
const ylikoOptions = ref<{ label: string; value: string }[]>([]);
const ylikoName = (id: string): string => ylikoOptions.value.find((o) => o.value === id)?.label ?? knownNames.get(id) ?? '';
void (async () => {
  try {
    stelexi.value = (await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } })).items;
  } catch {
    // Χωρίς στελέχη οι pickers μένουν άδειοι.
  }
})();

async function filterYliko(needle: string, update: (fn: () => void) => void): Promise<void> {
  try {
    const page = await get<Paginated<YlikoAvailability>>('/yliko', {
      params: { pageSize: 50, ...(drasi.value?.klados ? { klados: drasi.value.klados.type } : {}), ...(needle ? { q: needle } : {}) },
    });
    update(() => {
      const chosen = ylikoOptions.value.filter((o) => form.yliko.includes(o.value));
      const fresh = page.items.map((y) => ({ label: `${y.name}${y.ownerKladosType ? ` (${KLADOS_LABEL[y.ownerKladosType]})` : ''}`, value: y.ylikoId }));
      ylikoOptions.value = [...chosen, ...fresh.filter((f) => !chosen.some((c) => c.value === f.value))];
    });
  } catch {
    update(() => undefined);
  }
}

// ── Τοπική κατάσταση ──
const AUTOSAVE_DELAY_MS = 1200;
const saveStatus = ref<SaveState>('clean');
const dirty = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
const form = reactive({
  title: '',
  durationMin: 30,
  kind: 'DRASTIRIOTITA' as DrasiScheduleKind,
  location: '',
  responsible: [] as string[],
  executor: [] as string[],
  description: '',
  yliko: [] as string[],
  ylikoNotes: '',
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
      location: it.location ?? '',
      responsible: it.responsible ? [it.responsible.id] : [],
      executor: it.executor ? [it.executor.id] : [],
      description: it.description ?? '',
      yliko: it.yliko.map((y) => y.ylikoId),
      ylikoNotes: it.ylikoNotes ?? '',
    });
    if (it.responsible) knownNames.set(it.responsible.id, `${it.responsible.lastName} ${it.responsible.firstName}`);
    if (it.executor) knownNames.set(it.executor.id, `${it.executor.lastName} ${it.executor.firstName}`);
    for (const y of it.yliko) {
      knownNames.set(y.ylikoId, y.name);
      if (!ylikoOptions.value.some((o) => o.value === y.ylikoId)) ylikoOptions.value.push({ label: y.name, value: y.ylikoId });
    }
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
    await patch(`/draseis/${drasiId}/schedule/${itemId.value}`, {
      ...(form.title.trim() ? { title: form.title.trim() } : {}),
      durationMin: clampMin(form.durationMin),
      kind: form.kind,
      location: form.location.trim() || null,
      description: form.description || null,
      responsibleId: form.responsible[0] ?? null,
      executorId: form.executor[0] ?? null,
      ylikoNotes: form.ylikoNotes.trim() || null,
      yliko: form.yliko.map((ylikoId) => ({ ylikoId, qty: 1 })),
    });
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

// ── Πλοήγηση ──
function goBack(): void {
  void router.push({ name: 'drasi', params: { id: drasiId, section: 'programma' } });
}
async function goTo(id: string | null): Promise<void> {
  if (!id) return;
  await saveNow();
  await router.push({ name: 'drasi-programmatiko', params: { id: drasiId, itemId: id } });
  // Οι ώρες/διάρκεια του γείτονα μπορεί να άλλαξαν από ό,τι μόλις σώσαμε.
  await reload();
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
