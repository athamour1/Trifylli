<template>
  <!-- Στρογγυλό ✓/✗: πράσινο όταν υπάρχει, κόκκινο όταν λείπει. -->
  <q-icon
    :name="ok ? 'check_circle' : 'cancel'"
    :color="ok ? 'positive' : 'negative'"
    size="22px"
  >
    <q-tooltip>{{ tip }}</q-tooltip>
  </q-icon>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ ok: boolean; paid?: boolean }>();

const tip = computed(() =>
  props.ok
    ? props.paid
      ? 'Πληρωμένη / επιβεβαιωμένη'
      : 'Έχει δοθεί'
    : props.paid
      ? 'Δεν έχει πληρωθεί / επιβεβαιωθεί'
      : 'Δεν έχει δοθεί',
);
</script>
