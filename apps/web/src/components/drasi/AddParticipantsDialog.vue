<template>
  <!--
    Προσθήκη συμμετεχόντων από το μητρώο: φίλτρο κλάδου (οι κλάδοι που
    συμμετέχουν στη δράση), αναζήτηση, πολλαπλή επιλογή. Όσοι είναι ήδη μέσα
    δεν εμφανίζονται — η λίστα δείχνει μόνο ποιον μπορείς να προσθέσεις.
  -->
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: min(560px, 96vw); max-height: 90vh" class="column no-wrap">
      <q-card-section class="row items-center q-pb-sm">
        <div class="text-subtitle1 text-weight-medium">Προσθήκη συμμετεχόντων</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-5">
            <q-select
              v-model="filters.klados"
              :options="kladosOptions"
              label="Κλάδος"
              outlined
              dense
              emit-value
              map-options
              color="klados"
            />
          </div>
          <div class="col-12 col-sm-7">
            <q-input v-model="filters.q" label="Αναζήτηση" outlined dense clearable color="klados" debounce="300">
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
        </div>
        <q-btn-toggle
          v-model="filters.kind"
          class="q-mt-sm"
          dense
          unelevated
          toggle-color="klados"
          toggle-text-color="klados-on"
          :options="[
            { label: 'Όλοι', value: '' },
            { label: 'Παιδιά', value: 'MELOS' },
            { label: 'Στελέχη', value: 'STELEXOS' },
          ]"
        />
      </q-card-section>

      <q-card-section class="col scroll q-pt-none">
        <q-inner-loading :showing="loading" />
        <div v-if="!loading && !candidates.length" class="text-grey-6 text-center q-pa-md">
          Κανένα μέλος για προσθήκη με αυτά τα φίλτρα.
        </div>
        <q-list v-else dense>
          <q-item v-for="m in candidates" :key="m.id" tag="label" clickable>
            <q-item-section side>
              <q-checkbox v-model="selected" :val="m.id" color="klados" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ m.lastName }} {{ m.firstName }}</q-item-label>
              <q-item-label caption>
                {{ MEMBER_KIND_LABEL[m.kind] }}
                <span v-if="m.kladosType"> · {{ KLADOS_LABEL[m.kladosType] }}</span>
                <span v-if="m.age !== null"> · {{ m.age }} ετών</span>
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Όλοι της λίστας" :disable="!candidates.length" @click="selected = candidates.map((c) => c.id)" />
        <q-space />
        <q-btn flat label="Άκυρο" v-close-popup />
        <q-btn
          color="klados"
          text-color="klados-on"
          :label="`Προσθήκη (${selected.length})`"
          :disable="!selected.length"
          :loading="saving"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { KLADOS_LABEL, MEMBER_KIND_LABEL, type KladosType, type MemberSummary, type Paginated } from '@trifylli/shared';
import { ApiError, get, post } from '../../lib/api';

const props = defineProps<{
  modelValue: boolean;
  drasiId: string;
  /** Οι κλάδοι που συμμετέχουν — η προεπιλογή του φίλτρου. */
  kladoi: KladosType[];
  /** Όσοι είναι ήδη στη δράση. */
  existingIds: string[];
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; added: [count: number] }>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const members = ref<MemberSummary[]>([]);
const selected = ref<string[]>([]);
const filters = reactive({ klados: '' as KladosType | '', q: '', kind: '' as '' | 'MELOS' | 'STELEXOS' });

const kladosOptions = computed(() => [
  { label: 'Όλοι οι κλάδοι', value: '' },
  ...props.kladoi.map((k) => ({ label: KLADOS_LABEL[k], value: k })),
]);

const candidates = computed(() => {
  const existing = new Set(props.existingIds);
  return members.value.filter((m) => !existing.has(m.id));
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const page = await get<Paginated<MemberSummary>>('/meloi', {
      params: {
        pageSize: 300,
        ...(filters.klados ? { kladosType: filters.klados } : props.kladoi.length ? { kladosType: props.kladoi.join(',') } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
      },
    });
    members.value = page.items;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης μητρώου.' });
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.modelValue, filters.klados, filters.q, filters.kind] as const,
  ([open]) => {
    if (open) void load();
    else selected.value = [];
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  saving.value = true;
  try {
    const result = await post<{ added: number }>(`/draseis/${props.drasiId}/participants`, { memberIds: selected.value });
    emit('added', result.added);
    emit('update:modelValue', false);
    $q.notify({ type: 'positive', message: `Προστέθηκαν ${result.added}.` });
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία προσθήκης.' });
  } finally {
    saving.value = false;
  }
}
</script>
