<template>
  <!--
    Πεδίο ώρας με το Quasar q-time (όχι το native), στα χρώματα του κλάδου.
    Μοντέλο «HH:mm» (24ωρο). Το input είναι readonly· η επιλογή από το popup.
  -->
  <!-- Ένα εικονίδιο, και το πάτημα οπουδήποτε ανοίγει την επιλογή: με δύο
       εικονίδια (αριστερά + δεξιά) η ώρα δεν χωρούσε στο κινητό («09:0…»). -->
  <q-input
    :model-value="modelValue"
    :label="label"
    readonly
    dense
    outlined
    color="klados"
    :hint="hint"
    :class="{ 'cursor-pointer': editable }"
  >
    <template #prepend>
      <q-icon name="schedule" :style="{ color: 'var(--klados-ink)' }" />
    </template>
    <q-popup-proxy v-if="editable" cover transition-show="scale" transition-hide="scale">
      <q-time
        :model-value="modelValue || null"
        mask="HH:mm"
        format24h
        color="klados"
        @update:model-value="(v: string | null) => $emit('update:modelValue', v ?? '')"
      >
        <div class="row items-center justify-end">
          <q-btn v-close-popup label="Κλείσιμο" color="klados" flat no-caps />
        </div>
      </q-time>
    </q-popup-proxy>
  </q-input>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string | null;
    label?: string;
    editable?: boolean;
    hint?: string;
  }>(),
  { editable: true },
);
defineEmits<{ 'update:modelValue': [string] }>();
</script>
