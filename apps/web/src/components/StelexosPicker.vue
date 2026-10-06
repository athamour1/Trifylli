<template>
  <!--
    Επιλογή στελεχών (πολλαπλή) στα χρώματα του κλάδου. Φιλτράρει τοπικά — η
    λίστα των στελεχών ενός Τοπικού είναι μερικές δεκάδες ονόματα, όχι χιλιάδες.
  -->
  <q-select
    :model-value="modelValue"
    :options="filtered"
    :label="label"
    multiple
    use-chips
    use-input
    emit-value
    map-options
    outlined
    dense
    options-dense
    color="klados"
    input-debounce="0"
    :placeholder="modelValue.length ? '' : 'Αναζήτηση…'"
    @filter="onFilter"
    @update:model-value="(v: string[]) => $emit('update:modelValue', v ?? [])"
  >
    <template #option="{ itemProps, opt }">
      <q-item v-bind="itemProps">
        <q-item-section>
          <q-item-label>{{ opt.label }}</q-item-label>
          <q-item-label v-if="opt.caption" caption>{{ opt.caption }}</q-item-label>
        </q-item-section>
      </q-item>
    </template>
    <template #no-option>
      <q-item><q-item-section class="text-grey-6">Κανένα στέλεχος.</q-item-section></q-item>
    </template>
  </q-select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export interface StelexosOption {
  label: string;
  value: string;
  caption?: string;
}

const props = defineProps<{
  modelValue: string[];
  options: StelexosOption[];
  label: string;
}>();
defineEmits<{ 'update:modelValue': [string[]] }>();

const filtered = ref<StelexosOption[]>(props.options);
watch(
  () => props.options,
  (options) => {
    filtered.value = options;
  },
);

function onFilter(needle: string, update: (fn: () => void) => void): void {
  update(() => {
    const q = needle.trim().toLowerCase();
    filtered.value = q
      ? props.options.filter((o) => o.label.toLowerCase().includes(q) || o.caption?.toLowerCase().includes(q))
      : props.options;
  });
}
</script>
