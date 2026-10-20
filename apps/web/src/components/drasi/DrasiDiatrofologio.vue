<template>
  <!--
    Το διατροφολόγιο: τα γεύματα κάθε ημέρας όπως τα δίνει το πρόγραμμα (στοιχεία
    «Γεύμα» και όσα έχουν ετικέτα κολατσιού), με το μενού τους. Η συνταγή και το
    ποσολόγιο γράφονται στη σελίδα κάθε γεύματος.
  -->
  <div>
    <q-inner-loading :showing="loading && !view" />
    <template v-if="view">
      <div class="row items-center q-mb-sm q-gutter-sm">
        <SegmentedToggle v-model="dayKey" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="dayOptions" />
      </div>
      <div class="text-caption text-grey-7 q-mb-md">
        Τα γεύματα έρχονται από το πρόγραμμα: κάθε στοιχείο «Γεύμα», και όσα έχουν ετικέτα γεύματος (πρωινό, δεκατιανό, μεσημεριανό, απογευματινό, βραδινό).
      </div>

      <q-card v-if="meals.length" flat bordered>
        <q-list separator>
          <q-item
            v-for="m in meals"
            :key="m.itemId"
            clickable
            :to="{ name: 'drasi-gevma', params: { id: drasiId, itemId: m.itemId } }"
          >
            <q-item-section side class="clock">
              <div class="text-weight-medium">{{ hm(m.startsAt) }}</div>
              <div class="text-caption text-grey-6">{{ hm(m.endsAt) }}</div>
            </q-item-section>
            <q-item-section avatar>
              <q-icon :name="m.snack === 'DEKATIANO' || m.snack === 'APOGEVMATINO' ? 'bakery_dining' : 'restaurant'" color="orange-7" />
            </q-item-section>
            <q-item-section>
              <q-item-label>
                {{ m.title }}
                <q-badge v-if="m.snack" color="orange-7" class="q-ml-xs" :label="DRASI_SNACK_LABEL[m.snack]" />
              </q-item-label>
              <q-item-label caption :class="{ 'text-grey-6': !m.menu }">{{ m.menu || 'Χωρίς μενού ακόμα' }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center no-wrap q-gutter-sm">
                <q-icon
                  v-if="mealApprovals.get(m.itemId) && mealApprovals.get(m.itemId)!.status !== 'PROXEIRO'"
                  :name="mealApprovals.get(m.itemId)!.changedAfter ? 'published_with_changes' : APPROVAL_META[mealApprovals.get(m.itemId)!.status].icon"
                  :color="mealApprovals.get(m.itemId)!.changedAfter ? 'orange-8' : APPROVAL_META[mealApprovals.get(m.itemId)!.status].color"
                  size="20px"
                >
                  <q-tooltip>
                    {{ mealApprovals.get(m.itemId)!.changedAfter ? 'Εγκρίθηκε — άλλαξε μετά την έγκριση' : APPROVAL_META[mealApprovals.get(m.itemId)!.status].label }}
                  </q-tooltip>
                </q-icon>
                <span v-if="m.ingredients" class="text-caption">{{ m.bought }}/{{ m.ingredients }} υλικά</span>
                <q-icon :name="m.hasRecipe ? 'menu_book' : 'note_add'" :color="m.hasRecipe ? 'klados' : 'grey-5'" size="20px">
                  <q-tooltip>{{ m.hasRecipe ? 'Έχει συνταγή' : 'Χωρίς συνταγή ακόμα' }}</q-tooltip>
                </q-icon>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
      <div v-else class="text-center text-grey-6 q-pa-lg">
        <q-icon name="restaurant_menu" size="40px" class="block q-mx-auto q-mb-sm" />
        Κανένα γεύμα αυτή την ημέρα. Στο πρόγραμμα βάλε στοιχείο με είδος «Γεύμα», ή ετικέτα κολατσιού σε μια δραστηριότητα.
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { DRASI_SNACK_LABEL, type ApprovalSummaryRow, type DrasiDiatrofologioView } from '@trifylli/shared';
import { ApiError, get } from '../../lib/api';
import { APPROVAL_META, approvalsByItem } from '../../lib/approvals';
import { formatDate } from '../../lib/format';
import { useLiveReload } from '../../composables/useLiveChanges';

const props = defineProps<{ drasiId: string }>();
const $q = useQuasar();

const view = ref<DrasiDiatrofologioView | null>(null);
const loading = ref(false);

// Η έγκριση κάθε γεύματος — σήμα δίπλα στη συνταγή.
const approvalRows = ref<ApprovalSummaryRow[]>([]);
const mealApprovals = computed(() => approvalsByItem(approvalRows.value, props.drasiId).meal);
async function loadApprovals(): Promise<void> {
  try {
    approvalRows.value = await get<ApprovalSummaryRow[]>('/approvals', { params: { drasi: props.drasiId } });
  } catch {
    // Χωρίς τις εγκρίσεις η λίστα δουλεύει όπως πριν.
  }
}
onMounted(loadApprovals);
useLiveReload(['approvals'], loadApprovals);

async function load(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiDiatrofologioView>(`/draseis/${props.drasiId}/diatrofologio`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Το διατροφολόγιο δεν φόρτωσε.' });
  } finally {
    loading.value = false;
  }
}
onMounted(load);
// Ζωντανά: ό,τι αλλάζουν οι άλλοι εμφανίζεται χωρίς ανανέωση της σελίδας.
useLiveReload(['schedule', 'diatrofologio'], load);

const dayOptions = computed(() => (view.value?.days ?? []).map((d) => ({ label: formatDate(d.date), value: d.date })));
const dayKey = ref('');
watch(dayOptions, (opts) => {
  if (!opts.some((o) => o.value === dayKey.value) && opts[0]) dayKey.value = opts[0].value;
});
const meals = computed(() => view.value?.days.find((d) => d.date === dayKey.value)?.meals ?? []);

const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
</script>

<style scoped>
.clock {
  min-width: 52px;
}
</style>
