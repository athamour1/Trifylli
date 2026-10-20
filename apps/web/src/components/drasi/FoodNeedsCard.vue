<template>
  <!-- Αλλεργίες & διατροφή από τις δηλώσεις υγείας (F16): κλειστή εξ ορισμού,
       φορτώνει σε κάθε άνοιγμα — κάθε άνοιγμα καταγράφεται στο API. -->
  <q-card flat bordered class="q-mb-md">
    <q-expansion-item v-model="open" icon="no_food" :label="label" header-class="text-weight-medium">
      <q-card-section class="q-pt-none">
        <q-inner-loading :showing="loading" />
        <div v-if="error" class="text-negative text-body2">{{ error }}</div>
        <template v-else-if="data">
          <div class="text-caption text-grey-7 q-mb-sm">
            Από τις δηλώσεις υγείας: {{ data.submitted }} από {{ data.expected }}.
            <span v-if="data.submitted < data.expected">Η λίστα μπορεί να μην είναι πλήρης.</span>
          </div>
          <div v-if="!data.people.length" class="text-grey-6">Καμία αλλεργία ή ειδική διατροφή στις δηλώσεις.</div>
          <q-list v-else dense separator>
            <q-item v-for="p in data.people" :key="p.participantId">
              <q-item-section>
                <q-item-label>{{ p.lastName }} {{ p.firstName }}</q-item-label>
                <q-item-label caption>{{ [p.kladosType ? KLADOS_LABEL[p.kladosType] : null, p.group].filter(Boolean).join(' · ') }}</q-item-label>
                <q-item-label v-if="p.allergies"><b>Αλλεργίες:</b> {{ p.allergies }}</q-item-label>
                <q-item-label v-if="p.diet"><b>Διατροφή:</b> {{ p.diet }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card-section>
    </q-expansion-item>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { KLADOS_LABEL, type DrasiFoodNeedsView } from '@trifylli/shared';
import { ApiError, get } from '../../lib/api';

const props = defineProps<{ drasiId: string }>();
const open = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<DrasiFoodNeedsView | null>(null);
const label = computed(() => (data.value ? `Αλλεργίες & διατροφή · ${data.value.people.length} άτομα` : 'Αλλεργίες & διατροφή'));

watch(open, async (isOpen) => {
  if (!isOpen) return;
  loading.value = true;
  error.value = null;
  try {
    data.value = await get<DrasiFoodNeedsView>(`/draseis/${props.drasiId}/diatrofologio/allergies`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Δεν φορτώθηκαν.';
  } finally {
    loading.value = false;
  }
});
</script>
