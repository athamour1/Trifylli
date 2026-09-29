<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="page-title">Δράσεις{{ inKlados ? ` — ${kladosLabel}` : '' }}</div>
      <q-btn-toggle
        v-model="typeFilter"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="[
          { label: 'Όλες', value: null },
          { label: 'Μονοήμερες', value: 'MONOIMERI' },
          { label: 'Πολυήμερες', value: 'POLYIMERI' },
          { label: 'Κατασκηνώσεις', value: 'KATASKINOSI' },
        ]"
      />
    </div>

    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!data?.items.length"
      empty-text="Καμία δράση."
      empty-icon="hiking"
      @retry="reload"
    >
      <div class="row q-col-gutter-md">
        <div v-for="d in data?.items" :key="d.id" class="col-12 col-md-6">
          <q-card flat bordered clickable @click="$router.push({ name: 'drasi', params: { id: d.id } })">
            <q-card-section class="row items-start justify-between">
              <div>
                <div class="text-subtitle1 text-weight-medium">{{ d.title }}</div>
                <div class="text-caption text-grey-7">
                  {{ formatDateRange(d.dateStart, d.dateEnd) }}
                  <span v-if="d.location"> · {{ d.location }}</span>
                </div>
              </div>
              <q-badge :color="TYPE_COLOR[d.type]" :label="DRASI_TYPE_LABEL[d.type]" />
            </q-card-section>

            <q-separator />

            <q-card-section class="row text-center">
              <div class="col">
                <div class="text-h6">{{ d._count.participants }}</div>
                <div class="text-caption text-grey-7">Συμμετέχοντες</div>
              </div>
              <div class="col">
                <div class="text-h6">{{ d._count.checkouts }}</div>
                <div class="text-caption text-grey-7">Δεσμεύσεις</div>
              </div>
              <div class="col">
                <div class="text-h6">{{ d._count.syggentrwseis }}</div>
                <div class="text-caption text-grey-7">Πρόγραμμα</div>
              </div>
              <div class="col">
                <div class="text-body2 q-pt-xs">
                  {{ d.klados ? KLADOS_LABEL[d.klados.type] : 'Τοπικό' }}
                </div>
                <div class="text-caption text-grey-7">Φορέας</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DRASI_TYPE_LABEL, KLADOS_LABEL, type DrasiType, type KladosType, type Paginated } from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { formatDateRange } from '../lib/format';
import { useKladosScope } from '../composables/useKladosScope';

interface DrasiRow {
  id: string;
  title: string;
  type: DrasiType;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  klados: { type: KladosType } | null;
  _count: { participants: number; syggentrwseis: number; checkouts: number };
}

const { klados, inKlados, label: kladosLabel } = useKladosScope();
const typeFilter = ref<DrasiType | null>(null);

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<Paginated<DrasiRow>>('/draseis', {
      params: {
        pageSize: 100,
        ...(typeFilter.value ? { type: typeFilter.value } : {}),
        ...(klados.value ? { klados: klados.value } : {}),
      },
    }),
  { cacheKey: 'draseis', watchSources: [typeFilter, klados] },
);

const TYPE_COLOR: Record<DrasiType, string> = {
  MONOIMERI: 'teal-6',
  POLYIMERI: 'deep-purple-6',
  KATASKINOSI: 'orange-8',
};
</script>
