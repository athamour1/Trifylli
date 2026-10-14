<template>
  <!--
    Φιλοξενούμενα Τοπικά: μία κάρτα ανά Τοπικό, που αλλάζει επί τόπου. Μόνο όνομα
    με το χέρι — για άλλα Τοπικά το e-SEO δεν δίνει τίποτα παραπάνω. Αποθηκεύονται
    με το κουμπί του γονέα. Κοινό για το wizard και τις ρυθμίσεις της δράσης.
  -->
  <div>
    <q-card v-for="(g, i) in modelValue" :key="g.key" flat bordered class="q-pa-md q-mb-sm">
      <div class="row q-col-gutter-sm items-start">
        <div class="col-12 col-sm">
          <q-input
            :model-value="g.topikoName"
            label="Όνομα Τοπικού"
            outlined
            dense
            maxlength="120"
            :autofocus="g.key === focusKey"
            :error="!!errors[i]"
            :error-message="errors[i] ?? undefined"
            hide-bottom-space
            @update:model-value="(v: string | number | null) => update(i, { topikoName: String(v ?? '') })"
          />
        </div>
        <div class="col col-sm-3">
          <q-input
            :model-value="g.contactName"
            label="Επαφή"
            outlined
            dense
            maxlength="120"
            @update:model-value="(v: string | number | null) => update(i, { contactName: String(v ?? '') })"
          />
        </div>
        <div class="col col-sm-3">
          <q-input
            :model-value="g.contactPhone"
            label="Τηλέφωνο"
            outlined
            dense
            maxlength="40"
            @update:model-value="(v: string | number | null) => update(i, { contactPhone: String(v ?? '') })"
          />
        </div>
        <div class="col-auto">
          <q-btn flat dense round icon="delete" class="q-mt-xs" aria-label="Αφαίρεση Τοπικού" @click="remove(i)"><q-tooltip>Αφαίρεση</q-tooltip></q-btn>
        </div>
        <div class="col-12">
          <div class="text-caption text-grey-7">Ποιοι κλάδοι τους έρχονται</div>
          <q-option-group
            :model-value="g.kladoi"
            type="checkbox"
            color="klados"
            inline
            :options="kladosOptions"
            @update:model-value="(v: KladosType[]) => update(i, { kladoi: v })"
          />
        </div>
      </div>
    </q-card>

    <q-btn outline color="klados" icon="add" label="Προσθήκη Τοπικού" @click="add" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { KLADOI_IN_ORDER, KLADOS_LABEL, type KladosType } from '@trifylli/shared';
import { emptyGuestTopiko, guestTopikaErrors, type GuestTopikoForm } from './types';

const props = defineProps<{ modelValue: GuestTopikoForm[] }>();
const emit = defineEmits<{ 'update:modelValue': [GuestTopikoForm[]] }>();

const kladosOptions = KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k }));
/** Ο ίδιος έλεγχος που κάνει ο γονέας πριν αποθηκεύσει — εδώ δείχνει πού. */
const errors = computed(() => guestTopikaErrors(props.modelValue));
/** Η κάρτα που μόλις προστέθηκε παίρνει το focus στο όνομα. */
const focusKey = ref<string | null>(null);

function update(index: number, patch: Partial<GuestTopikoForm>): void {
  emit('update:modelValue', props.modelValue.map((g, i) => (i === index ? { ...g, ...patch } : g)));
}

function add(): void {
  const card = emptyGuestTopiko();
  focusKey.value = card.key;
  emit('update:modelValue', [...props.modelValue, card]);
}

function remove(index: number): void {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
}
</script>
