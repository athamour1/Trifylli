<template>
  <!--
    «Για ποιους» ένα παράλληλο γεύμα: οι συμμετέχοντες της δράσης, πρώτα όσοι
    έχουν δηλώσει αλλεργία ή διατροφή. Κάθε αλλαγή σώζεται αμέσως (PATCH).
    Όποιος δεν βλέπει αλλεργίες δεν φτάνει ως εδώ (`participantIds === null`).
  -->
  <q-select
    v-if="editable"
    :model-value="selected"
    :options="options"
    emit-value
    map-options
    multiple
    use-chips
    outlined
    dense
    color="klados"
    label="Για ποιους"
    :loading="saving"
    options-dense
    @update:model-value="save"
  >
    <template #option="{ itemProps, opt, selected: isSelected }">
      <q-item v-bind="itemProps">
        <q-item-section side>
          <q-checkbox :model-value="isSelected" dense color="klados" class="no-pointer-events" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ opt.label }}</q-item-label>
          <q-item-label v-if="opt.needs" caption>{{ opt.needs }}</q-item-label>
        </q-item-section>
      </q-item>
    </template>
  </q-select>
  <div v-else>
    <div class="text-caption text-grey-7">Για ποιους</div>
    <div v-if="!selected.length" class="text-caption text-grey-6">Κανείς ακόμα.</div>
    <q-chip v-for="id in selected" :key="id" dense :label="labelOf(id)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { DrasiFoodNeedsView, DrasiMealVariantView } from '@trifylli/shared';
import { ApiError, get, patch } from '../../lib/api';
import { variantPeopleOptions } from '../../lib/meal-variants';

const props = defineProps<{
  drasiId: string;
  itemId: string;
  variantId: string;
  /** Ποιοι είναι τώρα στο παράλληλο (όπως τους έφερε το `GET` του γεύματος). */
  participantIds: string[];
  participants: { id: string; user: { firstName: string; lastName: string } }[];
  editable: boolean;
  /** Βλέπει τη λίστα αλλεργιών — τότε αυτοί μπαίνουν πρώτοι στις επιλογές. */
  canSeeNeeds: boolean;
}>();
const emit = defineEmits<{ saved: [variant: DrasiMealVariantView] }>();
const $q = useQuasar();

const selected = ref<string[]>([...props.participantIds]);
watch(
  () => props.participantIds,
  (ids) => (selected.value = [...ids]),
);

const needs = ref<DrasiFoodNeedsView['people']>([]);
if (props.canSeeNeeds) {
  get<DrasiFoodNeedsView>(`/draseis/${props.drasiId}/diatrofologio/allergies`)
    .then((data) => (needs.value = data.people))
    .catch(() => undefined); // χωρίς τη λίστα: απλώς αλφαβητικά
}

const options = computed(() => variantPeopleOptions(props.participants, needs.value));
const labels = computed(() => new Map(options.value.map((o) => [o.value, o.label])));
const labelOf = (id: string): string => labels.value.get(id) ?? '—';

const saving = ref(false);
async function save(value: string[] | null): Promise<void> {
  const previous = selected.value;
  selected.value = value ?? [];
  saving.value = true;
  try {
    const variant = await patch<DrasiMealVariantView>(`/draseis/${props.drasiId}/diatrofologio/${props.itemId}/variants/${props.variantId}`, {
      participantIds: selected.value,
    });
    emit('saved', variant);
  } catch (err) {
    selected.value = previous;
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Δεν σώθηκε.' });
  } finally {
    saving.value = false;
  }
}
</script>
