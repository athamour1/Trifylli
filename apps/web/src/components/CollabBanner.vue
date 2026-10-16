<template>
  <q-banner v-if="status === 'update-required'" dense class="bg-orange-1 text-orange-10 q-mb-md">
    <template #avatar><q-icon name="system_update" /></template>
    Βγήκε νέα έκδοση της εφαρμογής — ανανέωσε τη σελίδα για να γράψεις {{ target }}.
    <template #action>
      <q-btn flat no-caps color="orange-10" label="Ανανέωση" @click="reloadPage" />
    </template>
  </q-banner>
  <q-banner v-else-if="editable && status === 'forbidden'" dense class="bg-grey-3 text-grey-9 q-mb-md">
    <template #avatar><q-icon name="lock" /></template>
    Δεν έχεις πια πρόσβαση για αλλαγές {{ target }} — φαίνεται η τελευταία εκδοχή που έφτασε.
  </q-banner>
  <div v-else-if="editable && !ready && status === 'offline'" class="text-caption text-grey-7 q-mb-md">
    <q-icon name="cloud_off" size="16px" class="q-mr-xs" />
    Χωρίς σύνδεση: μόνο ανάγνωση σε αυτή τη συσκευή — η επεξεργασία ανοίγει μόλις συνδεθείς.
  </div>
</template>

<script setup lang="ts">
import type { CollabStatus } from '../composables/useCollabDoc';

/**
 * Τι λέει η σελίδα όταν ένα κοινό έγγραφο δεν γράφεται: παλιά έκδοση της
 * εφαρμογής, πρόσβαση που χάθηκε, ή χωρίς δίκτυο σε συσκευή που δεν το έχει
 * ανοίξει ποτέ. Ένα μήνυμα, το ίδιο σε κάθε σελίδα.
 */
defineProps<{
  status: CollabStatus;
  /** Το έγγραφο έχει ανοίξει (ή υπάρχει αντίγραφο στη συσκευή). */
  ready: boolean;
  /** Ο χρήστης θα έγραφε εδώ — αλλιώς δεν έχει νόημα να του πούμε γιατί δεν γράφει. */
  editable: boolean;
  /** Πού γράφει, με την πρόθεση: «στο πρόγραμμα», «στα κείμενα». */
  target: string;
}>();

function reloadPage(): void {
  window.location.reload();
}
</script>
