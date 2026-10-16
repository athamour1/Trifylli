<template>
  <q-card v-if="lines.length" flat bordered class="q-mb-md">
    <q-card-section class="text-subtitle2 q-pb-xs">Εγκρίσεις</q-card-section>
    <q-list dense class="q-pb-sm">
      <q-item v-for="line in lines" :key="line.section" clickable :to="{ name: 'drasi', params: { id: drasiId, section: line.section } }">
        <q-item-section avatar><q-icon :name="line.icon" size="20px" :color="line.counts.ELEGXOS ? 'orange-8' : 'grey-7'" /></q-item-section>
        <q-item-section>
          <q-item-label>{{ line.label }}</q-item-label>
          <q-item-label caption>{{ summary(line.counts) }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ApprovalSummaryRow, DrasiScheduleView } from '@trifylli/shared';
import { useLiveReload } from '../../composables/useLiveChanges';
import { get } from '../../lib/api';
import { approvalCounts, approvalsByItem } from '../../lib/approvals';

/**
 * Στην Επισκόπηση: «Προγραμματικά: 8 εγκρίθηκαν · 3 για έλεγχο · 5 πρόχειρα» —
 * και το ίδιο για τα γεύματα. Πάτημα → η ενότητα.
 */
const props = defineProps<{ drasiId: string }>();

const schedule = ref<DrasiScheduleView | null>(null);
const approvals = ref<ApprovalSummaryRow[]>([]);

async function load(): Promise<void> {
  try {
    [schedule.value, approvals.value] = await Promise.all([
      get<DrasiScheduleView>(`/draseis/${props.drasiId}/schedule`),
      get<ApprovalSummaryRow[]>('/approvals', { params: { drasi: props.drasiId } }),
    ]);
  } catch {
    // Χωρίς πρόσβαση στο πρόγραμμα (ή χωρίς δίκτυο) η κάρτα δεν φαίνεται.
  }
}
onMounted(load);
useLiveReload(['approvals', 'schedule'], load);

const lines = computed(() => {
  const items = schedule.value?.days.flatMap((day) => day.items) ?? [];
  const byItem = approvalsByItem(approvals.value, props.drasiId);
  const programmatika = items.filter((item) => item.hasProgramma || byItem.item.has(item.id)).map((item) => item.id);
  const meals = items.filter((item) => item.kind === 'GEVMA' || item.snack !== null).map((item) => item.id);
  return [
    { section: 'programma', label: 'Προγραμματικά', icon: 'description', counts: approvalCounts(programmatika, byItem.item), total: programmatika.length },
    { section: 'diatrofologio', label: 'Γεύματα', icon: 'restaurant', counts: approvalCounts(meals, byItem.meal), total: meals.length },
  ].filter((line) => line.total > 0);
});

function summary(counts: ReturnType<typeof approvalCounts>): string {
  const parts = [
    counts.EGKRITHIKE ? `${counts.EGKRITHIKE} ${counts.EGKRITHIKE === 1 ? 'εγκρίθηκε' : 'εγκρίθηκαν'}` : '',
    counts.ELEGXOS ? `${counts.ELEGXOS} για έλεγχο` : '',
    counts.PROXEIRO ? `${counts.PROXEIRO} ${counts.PROXEIRO === 1 ? 'πρόχειρο' : 'πρόχειρα'}` : '',
    counts.changedAfter ? `${counts.changedAfter} άλλαξαν μετά την έγκριση` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
</script>
