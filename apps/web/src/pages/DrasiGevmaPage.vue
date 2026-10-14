<template>
  <!--
    Ένα γεύμα του διατροφολογίου: τι τρώμε, η συνταγή (Markdown με εικόνες, όπως
    στο προγραμματικό) και το ποσολόγιο. Το γεύμα το ορίζει το πρόγραμμα· εδώ
    γράφουν μαγείρισσα και τροφοδοσία. Σώζει μόνη της — δεν έχει κουμπί.
  -->
  <q-page padding>
    <PageState :loading="loading && !meal" :error="error" :stale="stale" @retry="reload">
      <template v-if="meal && drasi">
        <!-- ── Κεφαλίδα ── -->
        <div class="row items-start no-wrap q-mb-md">
          <q-btn flat round dense icon="arrow_back" color="klados" class="q-mr-sm q-mt-xs" @click="goBack">
            <q-tooltip>Πίσω στο διατροφολόγιο</q-tooltip>
          </q-btn>
          <div class="col row items-start justify-between q-col-gutter-sm">
            <div class="col-12 col-sm">
              <div class="page-title row items-center q-gutter-x-sm">
                <span>{{ meal.title }}</span>
                <q-badge v-if="meal.snack" color="orange-7" :label="DRASI_SNACK_LABEL[meal.snack]" />
              </div>
              <div class="text-caption text-grey-7">
                {{ drasi.title }} · {{ formatDateLong(meal.date) }} · {{ hm(meal.startsAt) }}–{{ hm(meal.endsAt) }}
              </div>
            </div>
            <div class="col-12 col-sm-auto row items-center q-gutter-sm">
              <SaveStatus v-if="editable" :status="saveStatus" @retry="saveNow" />
            </div>
          </div>
        </div>

        <!-- ── Η συνταγή, με το μενού και το ποσολόγιο στο πλάι (δεξιά) ── -->
        <div class="tf-split">
          <q-card flat bordered class="tf-split__head">
            <q-card-section class="text-subtitle1 text-weight-medium q-py-sm">Μενού</q-card-section>
            <q-separator />
            <q-card-section>
              <q-input
                v-model="form.menu"
                :readonly="!editable"
                label="Τι τρώμε"
                type="textarea"
                autogrow
                outlined
                dense
                color="klados"
                maxlength="500"
                placeholder="π.χ. Μακαρόνια με κιμά, σαλάτα, φρούτο"
              />
            </q-card-section>
          </q-card>

          <q-card flat bordered class="tf-split__main">
            <q-card-section>
              <MarkdownField
                v-model="form.recipe"
                :klados="drasi.klados?.type ?? null"
                :readonly="!editable"
                label="Συνταγή"
                placeholder="Markdown: βήματα, χρόνοι, πόσες μερίδες, τι προσέχουμε… Σύρε ή επικόλλησε εικόνες."
                empty-text="Δεν έχει γραφτεί συνταγή."
                :min-height="360"
              />
            </q-card-section>
          </q-card>

          <!-- Το ποσολόγιο σε μία λίστα, όπως το υλικό -->
          <q-card flat bordered class="tf-split__tail">
            <q-card-section class="row items-center justify-between q-py-sm">
              <div class="text-subtitle1 text-weight-medium">Ποσολόγιο</div>
              <q-chip v-if="ingredientCount" dense outline :label="`${boughtCount}/${ingredientCount}`" />
            </q-card-section>
            <q-separator />
            <q-card-section class="q-py-sm">
              <div v-if="!form.ingredients.length" class="text-caption text-grey-6 q-pb-sm">
                {{ editable ? 'Κενή λίστα.' : 'Δεν έχει γραφτεί ποσολόγιο.' }}
              </div>
              <div v-for="(row, index) in form.ingredients" :key="row.key" class="row items-center q-col-gutter-xs q-mb-xs">
                <div class="col-auto">
                  <q-checkbox v-model="row.bought" :disable="!editable" dense color="klados">
                    <q-tooltip>Αγοράστηκε</q-tooltip>
                  </q-checkbox>
                </div>
                <div class="col">
                  <q-input
                    v-model="row.label"
                    :readonly="!editable"
                    dense
                    outlined
                    placeholder="π.χ. μακαρόνια"
                    :class="row.bought ? 'text-grey-6' : ''"
                    @keydown.enter.prevent="addIngredientAfter(index)"
                  />
                </div>
                <div class="col-auto" style="width: 96px">
                  <q-input v-model="row.qty" :readonly="!editable" dense outlined placeholder="π.χ. 4 kg" @keydown.enter.prevent="addIngredientAfter(index)" />
                </div>
                <div v-if="editable" class="col-auto">
                  <q-btn dense flat round size="sm" icon="close" color="negative" @click="form.ingredients.splice(index, 1)" />
                </div>
              </div>
              <q-btn v-if="editable" flat dense no-caps color="klados" icon="add" label="Προσθήκη" @click="addIngredientAfter(form.ingredients.length - 1)" />
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
import { DRASI_SNACK_LABEL, drasiCan, type DrasiAccess, type DrasiMealView, type DrasiStatus, type KladosType } from '@trifylli/shared';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import { ingredientPayload, sameIngredients, type IngredientRow } from '../components/drasi/types';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, OfflineError, get, patch } from '../lib/api';
import { formatDateLong } from '../lib/format';
import type { SaveState } from '../lib/save-state';
import { useKladosThemeStore } from '../stores/klados-theme';
import { useOfflineStore } from '../stores/offline';

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
const offline = useOfflineStore();
const kladosTheme = useKladosThemeStore();
const drasiId = String(route.params.id);
const itemId = computed(() => String(route.params.itemId));

const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── Φόρτωση: η δράση (τίτλος, κλάδος, κατάσταση, δικαιώματα) και το γεύμα ──
const { data, loading, error, stale, reload } = useAsyncData(
  async () => {
    const [drasi, meal] = await Promise.all([
      get<DrasiHead>(`/draseis/${drasiId}`),
      get<DrasiMealView>(`/draseis/${drasiId}/diatrofologio/${itemId.value}`),
    ]);
    return { drasi, meal };
  },
  { forbiddenPage: true, cacheKey: `drasi-gevma:${drasiId}:${itemId.value}` },
);
const drasi = computed(() => data.value?.drasi ?? null);
const meal = computed(() => data.value?.meal ?? null);

watch(
  () => (drasi.value ? (drasi.value.klados?.type ?? null) : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

/** Γράφουν μαγείρισσα, τροφοδοσία και η εφεδρεία (ο ίδιος κανόνας με το API)· κλειστή δράση δεν αλλάζει. */
const editable = computed(() => !!drasi.value && drasi.value.status !== 'KLEISTI' && drasiCan(drasi.value.access, 'diatrofologio', 'edit'));

// ── Τοπική κατάσταση ──
const AUTOSAVE_DELAY_MS = 1200;
const saveStatus = ref<SaveState>('clean');
const dirty = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
const form = reactive({
  menu: '',
  recipe: '',
  ingredients: [] as IngredientRow[],
});
let hydrating = false;
/** Το γεύμα που γέμισε τελευταίο τη φόρμα — σε άλλο γεύμα η λίστα ξαναγράφεται. */
let hydratedId: string | null = null;
let ingredientKey = 0;
watch(
  meal,
  (m) => {
    // Ό,τι γράφει ο χρήστης αυτή τη στιγμή δεν το πατάει η επαναφόρτωση.
    if (!m || dirty.value) return;
    hydrating = true;
    form.menu = m.menu ?? '';
    form.recipe = m.recipe ?? '';
    // Μετά την αποθήκευση η λίστα είναι ήδη αυτή του server: δεν ξαναγράφεται,
    // ώστε να μένουν το focus και η άδεια γραμμή που μόλις προστέθηκε.
    if (m.itemId !== hydratedId || !sameIngredients(form.ingredients, m.ingredients)) {
      form.ingredients = m.ingredients.map((y) => ({ key: ++ingredientKey, label: y.label, qty: y.qty, bought: y.bought }));
    }
    hydratedId = m.itemId;
    dirty.value = false;
    if (saveStatus.value !== 'saved') saveStatus.value = 'clean';
    // Ο watcher της φόρμας τρέχει μετά από αυτό το sync block (pre-flush), οπότε
    // κατεβάζουμε τη σημαία στον επόμενο κύκλο.
    void Promise.resolve().then(() => (hydrating = false));
  },
  { immediate: true },
);

// ── Αυτόματη αποθήκευση ──
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
    await patch(`/draseis/${drasiId}/diatrofologio/${itemId.value}`, {
      menu: form.menu.trim() || null,
      recipe: form.recipe || null,
      ingredients: ingredientPayload(form.ingredients),
    });
    dirty.value = false;
    saveStatus.value = 'saved';
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

// ── Ποσολόγιο ──
const ingredientCount = computed(() => ingredientPayload(form.ingredients).length);
const boughtCount = computed(() => ingredientPayload(form.ingredients).filter((y) => y.bought).length);
function addIngredientAfter(index: number): void {
  form.ingredients.splice(index + 1, 0, { key: ++ingredientKey, label: '', qty: '', bought: false });
}

// ── Πλοήγηση ──
function goBack(): void {
  void router.push({ name: 'drasi', params: { id: drasiId, section: 'diatrofologio' } });
}
</script>
