<template>
  <div class="row items-center no-wrap text-caption" :class="TONE[status]">
    <q-spinner v-if="status === 'saving'" size="16px" class="q-mr-xs" />
    <q-icon v-else :name="ICON[status]" size="16px" class="q-mr-xs" />
    <span>{{ LABEL[status] }}</span>
    <q-btn
      v-if="status === 'error'"
      flat
      dense
      no-caps
      size="sm"
      label="Ξανά"
      class="q-ml-xs"
      @click="emit('retry')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Δείκτης αυτόματης αποθήκευσης.
 *
 * Όταν δεν υπάρχει κουμπί «Αποθήκευση», ο χρήστης χρειάζεται κάτι να του λέει
 * ότι η δουλειά του έφυγε — και, πιο σημαντικό, ότι *δεν* έφυγε ακόμη.
 */
import type { SaveState } from '../lib/save-state';

defineProps<{ status: SaveState }>();
const emit = defineEmits<{ retry: [] }>();

const LABEL: Record<SaveState, string> = {
  clean: 'Αποθηκευμένο',
  pending: 'Μη αποθηκευμένες αλλαγές',
  saving: 'Αποθήκευση…',
  saved: 'Αποθηκεύτηκε',
  offline: 'Χωρίς σύνδεση — θα αποθηκευτεί',
  error: 'Δεν αποθηκεύτηκε',
};

const ICON: Record<SaveState, string> = {
  clean: 'cloud_done',
  pending: 'edit',
  saving: 'cloud_upload',
  saved: 'cloud_done',
  offline: 'cloud_off',
  error: 'error_outline',
};

const TONE: Record<SaveState, string> = {
  clean: 'text-grey-7',
  pending: 'text-grey-7',
  saving: 'text-grey-7',
  saved: 'text-positive',
  offline: 'text-orange-9',
  error: 'text-negative',
};
</script>
