<template>
  <!--
    Το προγραμματικό ενός στοιχείου του ωρολογίου: δική του σελίδα, με το markdown
    (εικόνες, προεπισκόπηση) όπως στις συγκεντρώσεις, και ό,τι άλλο το πλαισιώνει
    (λεπτά, είδος, χώρος, υπεύθυνοι, υλικό) σε κάρτες στο πλάι. Σώζει μόνη της —
    δεν έχει κουμπί.
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
              <q-input v-model="form.title" :readonly="!editAll" borderless dense class="page-title" placeholder="Τι γίνεται" />
              <div class="text-caption text-grey-7">
                {{ drasi.title }} · {{ formatDateLong(item.date) }} · {{ hm(item.startsAt) }}–{{ hm(item.endsAt) }}
                · {{ formatDuration(item.durationMin) }}
              </div>
              <div v-if="scope === 'own'" class="text-caption text-klados q-mt-xs">
                <q-icon name="assignment_ind" size="16px" class="q-mr-xs" />Είσαι υπεύθυνος: γράφεις το προγραμματικό, τον χώρο και το υλικό.
              </div>
            </div>
            <div class="col-12 col-sm-auto row items-center q-gutter-sm">
              <SaveStatus v-if="editable" :status="saveStatus" @retry="saveNow" />
            </div>
          </div>
        </div>

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
              <q-input v-model="form.location" :readonly="!editable" label="Χώρος" outlined dense color="klados" />
              <StelexosPicker v-if="editAll" v-model="form.responsible" :label="responsiblesLabel(form.responsible.length)" :options="stelexiOptions" />
              <q-input v-else :model-value="namesOf(form.responsible)" :label="responsiblesLabel(form.responsible.length)" outlined dense readonly />
            </q-card-section>
            <q-card-actions v-if="editAll" align="right">
              <q-btn flat no-caps color="negative" icon="delete" label="Διαγραφή στοιχείου" @click="remove" />
            </q-card-actions>
          </q-card>

          <q-card flat bordered class="tf-split__main">
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

          <!-- Το υλικό σε μία λίστα, όπως στη συγκέντρωση -->
          <q-card flat bordered class="tf-split__tail">
            <q-card-section class="row items-center justify-between q-py-sm">
              <div class="text-subtitle1 text-weight-medium">Υλικό</div>
              <q-chip v-if="ylikoCount" dense outline :label="`${packedCount}/${ylikoCount}`" />
            </q-card-section>
            <q-separator />
            <q-card-section class="q-py-sm">
              <div v-if="!form.yliko.length" class="text-caption text-grey-6 q-pb-sm">
                {{ editable ? 'Κενή λίστα.' : 'Δεν έχει δηλωθεί υλικό.' }}
              </div>
              <div v-for="(row, index) in form.yliko" :key="row.key" class="row items-center q-col-gutter-xs q-mb-xs">
                <div class="col-auto">
                  <q-checkbox v-model="row.packed" :disable="!editable" dense color="klados" />
                </div>
                <div class="col">
                  <q-input
                    v-model="row.label"
                    :readonly="!editable"
                    dense
                    outlined
                    placeholder="π.χ. σπάγκος"
                    :class="row.packed ? 'text-grey-6' : ''"
                    @keydown.enter.prevent="addYlikoAfter(index)"
                  />
                </div>
                <div class="col-auto" style="width: 76px">
                  <q-input v-model.number="row.qty" :readonly="!editable" type="number" min="1" dense outlined />
                </div>
                <div v-if="editable" class="col-auto">
                  <q-btn dense flat round size="sm" icon="close" color="negative" @click="form.yliko.splice(index, 1)" />
                </div>
              </div>
              <q-btn v-if="editable" flat dense no-caps color="klados" icon="add" label="Προσθήκη" @click="addYlikoAfter(form.yliko.length - 1)" />
            </q-card-section>
          </q-card>
        </div>
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
  SCHEDULE_ITEM_OWN_FIELDS,
  drasiEditScope,
  type DrasiAccess,
  type DrasiEditScope,
  type DrasiScheduleItemView,
  type DrasiScheduleView,
  type DrasiStatus,
  type KladosType,
} from '@trifylli/shared';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import StelexosPicker from '../components/StelexosPicker.vue';
import { responsiblesLabel, sameYliko, ylikoPayload, type YlikoRow } from '../components/drasi/types';
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
  access: DrasiAccess;
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
//    βρούμε το στοιχείο με τις υπολογισμένες ώρες του ──
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
  description: '',
  yliko: [] as YlikoRow[],
});
let hydrating = false;
/** Το στοιχείο που γέμισε τελευταίο τη φόρμα — σε άλλο στοιχείο η λίστα υλικού ξαναγράφεται. */
let hydratedId: string | null = null;
let ylikoKey = 0;
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
      responsible: it.responsibles.map((p) => p.id),
      description: it.description ?? '',
    });
    // Μετά την αποθήκευση η λίστα είναι ήδη αυτή του server: δεν ξαναγράφεται,
    // ώστε να μένουν το focus και η άδεια γραμμή που μόλις προστέθηκε.
    if (it.id !== hydratedId || !sameYliko(form.yliko, it.yliko)) {
      form.yliko = it.yliko.map((y) => ({ key: ++ylikoKey, label: y.label, qty: y.qty, packed: y.packed }));
    }
    hydratedId = it.id;
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
  const change: Record<string, unknown> = {
    ...(form.title.trim() ? { title: form.title.trim() } : {}),
    durationMin: clampMin(form.durationMin),
    kind: form.kind,
    location: form.location.trim() || null,
    description: form.description || null,
    responsibleIds: form.responsible,
    yliko: ylikoPayload(form.yliko),
  };
  // Ο υπεύθυνος στέλνει μόνο ό,τι του επιτρέπεται — τα υπόλοιπα τα απορρίπτει το API.
  const allowed: readonly string[] = SCHEDULE_ITEM_OWN_FIELDS;
  const body = scope.value === 'all' ? change : Object.fromEntries(Object.entries(change).filter(([key]) => allowed.includes(key)));
  try {
    await patch(`/draseis/${drasiId}/schedule/${itemId.value}`, body);
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
const ylikoCount = computed(() => ylikoPayload(form.yliko).length);
const packedCount = computed(() => ylikoPayload(form.yliko).filter((y) => y.packed).length);
function addYlikoAfter(index: number): void {
  form.yliko.splice(index + 1, 0, { key: ++ylikoKey, label: '', qty: 1, packed: false });
}

// ── Πλοήγηση ──
function goBack(): void {
  void router.push({ name: 'drasi', params: { id: drasiId, section: 'programma' } });
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
