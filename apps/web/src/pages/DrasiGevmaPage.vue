<template>
  <!--
    Ένα γεύμα του διατροφολογίου: τι τρώμε, η συνταγή (Markdown με εικόνες, όπως
    στο προγραμματικό) και το ποσολόγιο. Το γεύμα το ορίζει το πρόγραμμα· εδώ
    γράφουν μαγείρισσα και τροφοδοσία — μαζί, ζωντανά: όλα είναι ένα κοινό
    έγγραφο (`drasi:<id>:meal:<id>`) που σώζεται μόνο του.
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
              <CollabPresence :peers="peers" />
              <SaveStatus v-if="editable" :status="saveState" />
              <DocumentHistory :document="docName" :writable="textEditable" />
            </div>
          </div>
        </div>

        <CollabBanner :status="status" :ready="ready" :editable="editable" target="στο γεύμα" />

        <!-- ── Η συνταγή, με το μενού και το ποσολόγιο στο πλάι (δεξιά) ── -->
        <div class="tf-split">
          <q-card flat bordered class="tf-split__head">
            <q-card-section class="text-subtitle1 text-weight-medium q-py-sm">Μενού</q-card-section>
            <q-separator />
            <q-card-section>
              <q-input
                :model-value="view.menu"
                :readonly="!fieldsEditable"
                label="Τι τρώμε"
                type="textarea"
                autogrow
                outlined
                dense
                color="klados"
                :maxlength="ROW_LIMITS.menu"
                placeholder="π.χ. Μακαρόνια με κιμά, σαλάτα, φρούτο"
                @update:model-value="(value) => setMenu(doc, String(value ?? ''))"
              />
            </q-card-section>
          </q-card>

          <q-card flat bordered class="tf-split__main">
            <q-card-section>
              <!-- Τη γράφουν μαζί μαγείρισσα και τροφοδοσία — ζωντανά, με κέρσορες. -->
              <CollabMarkdownField
                v-if="ready"
                :doc="doc"
                :field="MEAL_DOC.recipe"
                :document-name="docName"
                :awareness="awareness"
                :klados="drasi.klados?.type ?? null"
                :readonly="!textEditable"
                label="Συνταγή"
                placeholder="Markdown: βήματα, χρόνοι, πόσες μερίδες, τι προσέχουμε… Σύρε ή επικόλλησε εικόνες."
                empty-text="Δεν έχει γραφτεί συνταγή."
                :min-height="360"
              />
              <MarkdownField
                v-else
                :model-value="meal.recipe ?? ''"
                readonly
                :klados="drasi.klados?.type ?? null"
                empty-text="Δεν έχει γραφτεί συνταγή."
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
              <div v-if="!view.ingredients.length" class="text-caption text-grey-6 q-pb-sm">
                {{ fieldsEditable ? 'Κενή λίστα.' : 'Δεν έχει γραφτεί ποσολόγιο.' }}
              </div>
              <div v-for="row in view.ingredients" :key="row.id" class="row items-center q-col-gutter-xs q-mb-xs">
                <div class="col-auto">
                  <q-checkbox
                    :model-value="row.bought"
                    :disable="!fieldsEditable"
                    dense
                    color="klados"
                    @update:model-value="(value) => updateIngredient(doc, row.id, { bought: value })"
                  >
                    <q-tooltip>Αγοράστηκε</q-tooltip>
                  </q-checkbox>
                </div>
                <div class="col">
                  <q-input
                    :model-value="row.label"
                    :readonly="!fieldsEditable"
                    dense
                    outlined
                    placeholder="π.χ. μακαρόνια"
                    :data-row-id="row.id"
                    :class="row.bought ? 'text-grey-6' : ''"
                    @update:model-value="(value) => updateIngredient(doc, row.id, { label: String(value ?? '') })"
                    @keydown.enter.prevent="addRow(row.id)"
                  />
                </div>
                <div class="col-auto" style="width: 96px">
                  <q-input
                    :model-value="row.qty"
                    :readonly="!fieldsEditable"
                    dense
                    outlined
                    placeholder="π.χ. 4 kg"
                    :maxlength="ROW_LIMITS.ingredientQty"
                    @update:model-value="(value) => updateIngredient(doc, row.id, { qty: String(value ?? '') })"
                    @keydown.enter.prevent="addRow(row.id)"
                  />
                </div>
                <div v-if="fieldsEditable" class="col-auto">
                  <q-btn dense flat round size="sm" icon="close" color="negative" @click="removeIngredient(doc, row.id)" />
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
                @click="addRow(view.ingredients.at(-1)?.id ?? null)"
              />
            </q-card-section>
          </q-card>
        </div>
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  DRASI_SNACK_LABEL,
  MEAL_DOC,
  ROW_LIMITS,
  collabDocument,
  drasiCan,
  type DrasiAccess,
  type DrasiMealView,
  type DrasiStatus,
  type IngredientSnapshot,
  type KladosType,
} from '@trifylli/shared';
import CollabBanner from '../components/CollabBanner.vue';
import CollabPresence from '../components/CollabPresence.vue';
import DocumentHistory from '../components/collab/DocumentHistory.vue';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import { get } from '../lib/api';
import { addIngredientAfter, hasSchema, readMealDoc, removeIngredient, setMenu, updateIngredient } from '../lib/drasi-docs';
import { formatDateLong } from '../lib/format';
import { keepFocus } from '../lib/keep-focus';
import { useKladosThemeStore } from '../stores/klados-theme';

// CodeMirror φορτώνεται μόνο όταν ανοίξει σελίδα με κείμενα για γράψιμο.
const CollabMarkdownField = defineAsyncComponent(() => import('../components/CollabMarkdownField.vue'));

interface DrasiHead {
  id: string;
  title: string;
  status: DrasiStatus;
  klados: { type: KladosType } | null;
  access: DrasiAccess;
}

const route = useRoute();
const router = useRouter();
const kladosTheme = useKladosThemeStore();
const drasiId = String(route.params.id);
// Η σελίδα ξαναστήνεται για κάθε γεύμα (βλ. το `key` στο MainLayout).
const itemId = String(route.params.itemId);

const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ── Φόρτωση: η δράση (τίτλος, κλάδος, κατάσταση, δικαιώματα) και το γεύμα ──
const { data, loading, error, stale, reload } = useAsyncData(
  async () => {
    const [drasi, meal] = await Promise.all([
      get<DrasiHead>(`/draseis/${drasiId}`),
      get<DrasiMealView>(`/draseis/${drasiId}/diatrofologio/${itemId}`),
    ]);
    return { drasi, meal };
  },
  { forbiddenPage: true, cacheKey: `drasi-gevma:${drasiId}:${itemId}` },
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

// ── Το γεύμα: κοινό έγγραφο, σώζει μόνο του ──
const docName = collabDocument.drasiMeal(drasiId, itemId);
const { doc, awareness, ready, writable, status, peers, saveState } = useCollabDoc(docName, useCollabMe());

/** Το γεύμα όπως είναι τώρα στο έγγραφο — ξαναδιαβάζεται σε κάθε αλλαγή, δική μας ή άλλων. */
const docMeal = shallowRef<ReturnType<typeof readMealDoc> | null>(null);
const schemaOk = shallowRef(false);
let stopWatchingDoc: (() => void) | null = null;
watch(
  doc,
  (current) => {
    stopWatchingDoc?.();
    const refresh = (): void =>
      keepFocus(() => {
        docMeal.value = readMealDoc(current);
        schemaOk.value = hasSchema(current, MEAL_DOC.schema);
      });
    current.on('update', refresh);
    stopWatchingDoc = () => current.off('update', refresh);
    refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => stopWatchingDoc?.());

/** Η συνταγή γράφεται όταν γράφεται το γεύμα **και** ο server το επιτρέπει. */
const textEditable = computed(() => editable.value && ready.value && writable.value);
/**
 * Μενού και ποσολόγιο: επιπλέον, το έγγραφο να έχει έρθει από τον server με
 * αυτά μέσα — ένα παλιό αντίγραφο συσκευής (μόνο με τη συνταγή) θα έγραφε από κενό.
 */
const fieldsEditable = computed(() => textEditable.value && schemaOk.value);

/** Ό,τι δείχνει η σελίδα: το έγγραφο όταν έχει τα πεδία, αλλιώς ό,τι έφερε το `GET`. */
const view = computed<{ menu: string; ingredients: IngredientSnapshot[] }>(() => {
  if (ready.value && schemaOk.value && docMeal.value) return docMeal.value;
  return {
    menu: meal.value?.menu ?? '',
    ingredients: (meal.value?.ingredients ?? []).map((y, order) => ({ ...y, order })),
  };
});

// ── Ποσολόγιο ──
const filled = computed(() => view.value.ingredients.filter((y) => y.label.trim()));
const ingredientCount = computed(() => filled.value.length);
const boughtCount = computed(() => filled.value.filter((y) => y.bought).length);

/** Νέα γραμμή: η εστίαση πάει στο όνομά της, για να συνεχιστεί η πληκτρολόγηση. */
function addRow(afterId: string | null): void {
  const id = addIngredientAfter(doc.value, afterId);
  void nextTick(() => document.querySelector<HTMLInputElement>(`[data-row-id="${id}"]`)?.focus());
}

// ── Πλοήγηση ──
function goBack(): void {
  void router.push({ name: 'drasi', params: { id: drasiId, section: 'diatrofologio' } });
}
</script>
