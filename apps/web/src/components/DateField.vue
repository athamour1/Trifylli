<template>
  <!--
    Πεδίο ημερομηνίας με το Quasar q-date (όχι το native), στα χρώματα του κλάδου.
    Το input δείχνει μορφοποιημένη ημερομηνία (ΗΗ/ΜΜ/ΕΕΕΕ) και είναι readonly·
    η επιλογή γίνεται από το popup ημερολόγιο. Το μοντέλο μένει «YYYY-MM-DD».
  -->
  <q-input
    :model-value="display"
    :label="label"
    readonly
    dense
    outlined
    color="klados"
    :hint="hint"
    :class="{ 'cursor-pointer': editable }"
  >
    <template #prepend>
      <q-icon name="event" :style="{ color: 'var(--klados-ink)' }" />
    </template>
    <!-- Πάτημα οπουδήποτε ανοίγει το ημερολόγιο· ένα εικονίδιο αρκεί (βλ. TimeField). -->
    <q-popup-proxy v-if="editable" cover transition-show="scale" transition-hide="scale">
      <q-date
        :model-value="modelValue || null"
        mask="YYYY-MM-DD"
        color="klados"
        today-btn
        @update:model-value="(v: string | null) => $emit('update:modelValue', v ?? '')"
      >
        <div class="row items-center justify-end">
          <q-btn v-close-popup label="Κλείσιμο" color="klados" flat no-caps />
        </div>
      </q-date>
    </q-popup-proxy>
  </q-input>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from '../lib/format';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    label?: string;
    editable?: boolean;
    hint?: string;
  }>(),
  { editable: true },
);
defineEmits<{ 'update:modelValue': [string] }>();

const display = computed(() => (props.modelValue ? formatDate(props.modelValue) : ''));
</script>
