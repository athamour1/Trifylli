<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md q-gutter-sm">
      <div class="page-title">Δράσεις</div>
      <div class="row items-center q-gutter-sm">
        <SegmentedToggle
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
        <q-btn
          v-if="canWrite"
          color="klados"
          text-color="klados-on"
          unelevated
          icon="add"
          label="Νέα δράση"
          :to="{ name: inKlados ? 'klados-drasi-nea' : 'drasi-nea' }"
        />
      </div>
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
          <!-- `cursor-pointer` και όχι `clickable`: η q-card δεν έχει τέτοιο prop, οπότε
               δεν έβγαζε δείκτη συνδέσμου. Μαζί role/tabindex/Enter ώστε να ανοίγει
               και από το πληκτρολόγιο, όπως ένας σύνδεσμος. -->
          <q-card
            flat
            bordered
            class="cursor-pointer"
            :class="{ 'drasi-draft': d.status === 'PROSXEDIO' }"
            role="link"
            tabindex="0"
            @click="open(d)"
            @keydown.enter.prevent="open(d)"
          >
            <q-card-section class="row items-start justify-between">
              <div>
                <div class="text-subtitle1 text-weight-medium">{{ d.title }}</div>
                <div class="text-caption text-grey-7">
                  {{ formatDateRange(d.dateStart, d.dateEnd) }}
                  <span v-if="d.location"> · {{ d.location }}</span>
                  <span v-if="d.kladoi.length > 1 || d.guestTopika.length">
                    · {{ [...d.kladoi.map((k) => KLADOS_LABEL[k]), ...d.guestTopika.map((g) => g.topikoName)].join(', ') }}
                  </span>
                </div>
              </div>
              <div class="column items-end q-gutter-xs">
                <q-badge :color="TYPE_COLOR[d.type]" :label="DRASI_TYPE_LABEL[d.type]" />
                <!-- Προσχέδιο = το wizard δεν τελείωσε· το κλικ το συνεχίζει. -->
                <q-badge v-if="d.status === 'PROSXEDIO'" outline color="grey-7" label="Προσχέδιο — συνέχεια" />
              </div>
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
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  DRASI_TYPE_LABEL,
  KLADOS_LABEL,
  type DrasiStatus,
  type DrasiType,
  type KladosType,
  type Paginated,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { formatDateRange } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { useKladosScope } from '../composables/useKladosScope';

interface DrasiRow {
  id: string;
  title: string;
  type: DrasiType;
  status: DrasiStatus;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  klados: { type: KladosType } | null;
  kladoi: KladosType[];
  guestTopika: { topikoName: string }[];
  _count: { participants: number; syggentrwseis: number; checkouts: number; roles: number };
}

const router = useRouter();
const auth = useAuthStore();
const { klados, inKlados } = useKladosScope();
const typeFilter = ref<DrasiType | null>(null);
const canWrite = computed(() => auth.can('drasi:write', klados.value ?? undefined));

/** Προσχέδιο → πίσω στο wizard· αλλιώς η σελίδα της δράσης. */
function open(d: DrasiRow): void {
  if (d.status === 'PROSXEDIO' && canWrite.value && inKlados.value) {
    void router.push({ name: inKlados.value ? 'klados-drasi-nea' : 'drasi-nea', query: { id: d.id } });
  } else {
    void router.push({ name: 'drasi', params: { id: d.id } });
  }
}

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

<style scoped>
.drasi-draft {
  border-style: dashed;
  opacity: 0.85;
}
</style>
