<template>
  <!--
    Η Τροφοδοσία: τι αγοράζουμε κάθε ημέρα. Πάνω τα υλικά των γευμάτων της
    ημέρας (από το ποσολόγιο του καθενός — το τικ είναι το ίδιο με εκείνο), από
    κάτω όσα ζήτησαν επιπλέον λειτουργία, πρόγραμμα, αρχηγός, μαγείρισσα και
    τροφοδοσία. «Αγοράστηκε» σημειώνουν η τροφοδοσία και ο αρχηγός.
  -->
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <SegmentedToggle v-if="dayOptions.length > 1" v-model="dayKey" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="dayOptions" />
      <q-space />
      <div v-if="current && progress.total" class="text-caption text-grey-7">
        <span class="text-weight-medium" :class="progress.bought === progress.total ? 'text-positive' : 'text-orange-9'">{{ progress.bought }}</span>
        από {{ progress.total }} αγοράστηκαν
      </div>
    </div>

    <q-inner-loading :showing="loading && !view" />

    <template v-if="current">
      <!-- ── Από τα γεύματα ── -->
      <div class="text-subtitle2 q-mb-xs">Από τα γεύματα</div>
      <div v-if="!mealsWithIngredients.length" class="text-caption text-grey-6 q-mb-md">
        Κανένα γεύμα με ποσολόγιο αυτή την ημέρα — τα υλικά γράφονται στο Διατροφολόγιο.
      </div>
      <q-card v-for="meal in mealsWithIngredients" :key="meal.itemId" flat bordered class="q-mb-sm">
        <q-item dense clickable :to="{ name: 'drasi-gevma', params: { id: drasiId, itemId: meal.itemId } }">
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ meal.title }}</q-item-label>
            <q-item-label caption>{{ hm(meal.startsAt) }} · {{ countBought(meal.ingredients) }}/{{ meal.ingredients.length }}</q-item-label>
          </q-item-section>
          <q-item-section side><q-icon name="chevron_right" /></q-item-section>
        </q-item>
        <q-separator />
        <q-list dense>
          <q-item v-for="y in meal.ingredients" :key="y.id" :class="{ 'trof-done': y.bought }">
            <q-item-section avatar>
              <q-checkbox
                :model-value="y.bought"
                :disable="!canBuy || busy.has(y.id)"
                color="positive"
                dense
                :aria-label="`Αγοράστηκε: ${y.label}`"
                @update:model-value="(v: boolean) => tickIngredient(meal.itemId, y, v)"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ y.label }}<span v-if="y.qty" class="text-grey-7"> — {{ y.qty }}</span></q-item-label>
              <q-item-label v-if="y.bought && y.boughtBy" caption>αγόρασε {{ fullName(y.boughtBy) }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>

      <!-- ── Επιπλέον ── -->
      <div class="text-subtitle2 q-mt-md q-mb-xs">Επιπλέον</div>
      <q-card flat bordered>
        <q-list v-if="current.extras.length" dense separator>
          <q-item v-for="x in current.extras" :key="x.id" :class="{ 'trof-done': x.bought }">
            <q-item-section avatar>
              <q-checkbox
                :model-value="x.bought"
                :disable="!canBuy || busy.has(x.id)"
                color="positive"
                dense
                :aria-label="`Αγοράστηκε: ${x.label}`"
                @update:model-value="(v: boolean) => tickExtra(x, v)"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ x.label }}<span v-if="x.qty" class="text-grey-7"> — {{ x.qty }}</span></q-item-label>
              <q-item-label v-if="x.note" caption class="pre-line">{{ x.note }}</q-item-label>
              <q-item-label caption>
                <template v-if="x.requestedBy">ζήτησε {{ fullName(x.requestedBy) }}</template>
                <template v-if="x.bought && x.boughtBy"> · αγόρασε {{ fullName(x.boughtBy) }}</template>
              </q-item-label>
            </q-item-section>
            <q-item-section v-if="(canAdd && !x.bought) || canBuy" side>
              <q-btn flat round dense size="sm" icon="delete" color="negative" :aria-label="`Διαγραφή: ${x.label}`" @click="removeExtra(x)" />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-caption text-grey-6 q-pa-md">Τίποτα επιπλέον γι' αυτή την ημέρα.</div>

        <!-- Προσθέτουν λειτουργία, πρόγραμμα, αρχηγός, μαγείρισσα και τροφοδοσία. -->
        <template v-if="canAdd">
          <q-separator />
          <q-card-section class="row items-start q-col-gutter-sm">
            <div class="col-12 col-sm-5">
              <q-input v-model="draft.label" dense outlined color="klados" label="Τι" :maxlength="120" @keyup.enter="addExtra" />
            </div>
            <div class="col-6 col-sm-2">
              <q-input v-model="draft.qty" dense outlined color="klados" label="Πόσο" placeholder="π.χ. 6 λίτρα" :maxlength="40" @keyup.enter="addExtra" />
            </div>
            <div class="col-6 col-sm-3">
              <q-input v-model="draft.note" dense outlined color="klados" label="Σημείωση" :maxlength="300" @keyup.enter="addExtra" />
            </div>
            <div class="col-12 col-sm-2">
              <q-btn
                unelevated
                color="klados"
                text-color="klados-on"
                icon="add"
                label="Προσθήκη"
                class="full-width"
                :disable="!draft.label.trim()"
                :loading="adding"
                @click="addExtra"
              />
            </div>
          </q-card-section>
        </template>
      </q-card>

      <div v-if="!canBuy" class="text-caption text-grey-6 q-mt-sm">«Αγοράστηκε» σημειώνουν η τροφοδοσία και ο αρχηγός της δράσης.</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { DrasiFoodPurchaseView, DrasiPersonRef, DrasiTrofodosiaIngredient, DrasiTrofodosiaView } from '@trifylli/shared';
import SegmentedToggle from '../SegmentedToggle.vue';
import { ApiError, del, get, post, put } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { dayProgress, defaultDay } from '../../lib/trofodosia';
import { useLiveReload } from '../../composables/useLiveChanges';

const props = defineProps<{
  drasiId: string;
  /** Προσθέτει στη λίστα: λειτουργία, πρόγραμμα, αρχηγός, μαγείρισσα, τροφοδοσία. */
  canAdd: boolean;
  /** «Αγοράστηκε»: τροφοδοσία και αρχηγός. */
  canBuy: boolean;
}>();
const $q = useQuasar();

const loading = ref(false);
const view = ref<DrasiTrofodosiaView | null>(null);
async function reload(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiTrofodosiaView>(`/draseis/${props.drasiId}/trofodosia`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης.');
  } finally {
    loading.value = false;
  }
}
onMounted(reload);
// Ζωντανά: προσθήκες, τικ, και τα ποσολόγια των γευμάτων (κι όταν γράφονται στη σελίδα τους).
useLiveReload(['trofodosia', 'diatrofologio', 'doc:meal', 'schedule'], reload);

// ── Η ημέρα ──
const dayOptions = computed(() => (view.value?.days ?? []).map((d) => ({ label: formatDate(d.date), value: d.date })));
const dayKey = ref('');
watch(dayOptions, (opts) => {
  if (opts.some((o) => o.value === dayKey.value)) return;
  dayKey.value = defaultDay(opts.map((o) => o.value), localToday()) ?? '';
});
const current = computed(() => view.value?.days.find((d) => d.date === dayKey.value) ?? null);
const progress = computed(() => (current.value ? dayProgress(current.value) : { bought: 0, total: 0 }));
const mealsWithIngredients = computed(() => current.value?.meals.filter((m) => m.ingredients.length) ?? []);

// ── «Αγοράστηκε» — αμέσως στην οθόνη· αν ο server αρνηθεί, γυρίζει πίσω ──
const busy = reactive(new Set<string>());
async function tickIngredient(itemId: string, y: DrasiTrofodosiaIngredient, bought: boolean): Promise<void> {
  busy.add(y.id);
  y.bought = bought;
  try {
    await put(`/draseis/${props.drasiId}/trofodosia/meals/${itemId}/ingredients/${y.id}/bought`, { bought });
  } catch (err) {
    y.bought = !bought;
    notifyError(err, 'Αποτυχία.');
  } finally {
    busy.delete(y.id);
  }
}
async function tickExtra(x: DrasiFoodPurchaseView, bought: boolean): Promise<void> {
  busy.add(x.id);
  x.bought = bought;
  try {
    Object.assign(x, await put<DrasiFoodPurchaseView>(`/draseis/${props.drasiId}/trofodosia/${x.id}/bought`, { bought }));
  } catch (err) {
    x.bought = !bought;
    notifyError(err, 'Αποτυχία.');
  } finally {
    busy.delete(x.id);
  }
}

// ── Επιπλέον: προσθήκη και διαγραφή ──
const draft = reactive({ label: '', qty: '', note: '' });
const adding = ref(false);
async function addExtra(): Promise<void> {
  if (!draft.label.trim() || !current.value || adding.value) return;
  adding.value = true;
  try {
    const added = await post<DrasiFoodPurchaseView>(`/draseis/${props.drasiId}/trofodosia`, {
      date: current.value.date,
      label: draft.label.trim(),
      qty: draft.qty.trim() || undefined,
      note: draft.note.trim() || undefined,
    });
    current.value.extras.push(added);
    Object.assign(draft, { label: '', qty: '', note: '' });
  } catch (err) {
    notifyError(err, 'Αποτυχία προσθήκης.');
  } finally {
    adding.value = false;
  }
}
async function removeExtra(x: DrasiFoodPurchaseView): Promise<void> {
  try {
    await del(`/draseis/${props.drasiId}/trofodosia/${x.id}`);
    if (current.value) current.value.extras = current.value.extras.filter((e) => e.id !== x.id);
  } catch (err) {
    notifyError(err, 'Αποτυχία διαγραφής.');
  }
}

const countBought = (rows: readonly { bought: boolean }[]): number => rows.filter((r) => r.bought).length;
const fullName = (p: DrasiPersonRef): string => `${p.firstName} ${p.lastName}`.trim();
const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** Η σημερινή ημέρα της συσκευής (YYYY-MM-DD). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>

<style scoped>
.trof-done .q-item__label:first-child {
  text-decoration: line-through;
  opacity: 0.7;
}
</style>
