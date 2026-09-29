<template>
  <q-page padding>
    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <div class="page-title">{{ data.title }}</div>
        <div class="text-caption text-grey-7 q-mb-md">
          {{ DRASI_TYPE_LABEL[data.type] }} · {{ formatDateRange(data.dateStart, data.dateEnd) }}
          <span v-if="data.location"> · {{ data.location }}</span>
        </div>

        <q-tabs v-model="tab" dense align="left" class="text-klados q-mb-md" narrow-indicator>
          <q-tab name="stats" label="Στοιχεία ανά κλάδο" />
          <q-tab name="participants" :label="`Συμμετέχοντες (${data.participants.length})`" />
          <q-tab name="yliko" :label="`Υλικό (${data.checkouts.length})`" />
          <q-tab v-if="data.syggentrwseis.length" name="programma" label="Πρόγραμμα" />
          <q-tab v-if="data.incidents.length" name="incidents" label="Περιστατικά" />
        </q-tabs>

        <q-tab-panels v-model="tab" animated>
          <!-- Το φύλλο που ζητά το Τοπικό πριν την αναχώρηση. -->
          <q-tab-panel name="stats" class="q-pa-none">
            <PageState :loading="statsLoading" :empty="!stats?.perKlados.length">
              <q-markup-table v-if="stats" flat bordered>
                <thead>
                  <tr>
                    <th class="text-left">Κλάδος</th>
                    <th class="text-right">Στελέχη</th>
                    <th class="text-right">Κατασκηνωτές</th>
                    <th class="text-right">Σύνολο</th>
                    <th class="text-left">Δεσμευμένο υλικό</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="k in stats.perKlados" :key="k.kladosType">
                    <td class="text-left">{{ KLADOS_LABEL[k.kladosType] }}</td>
                    <td class="text-right">{{ k.stelexi }}</td>
                    <td class="text-right">{{ k.kataskinotes }}</td>
                    <td class="text-right text-weight-bold">{{ k.total }}</td>
                    <td class="text-left">
                      <span v-if="!k.ylikoCheckedOut.length" class="text-grey-6">—</span>
                      <q-chip
                        v-for="y in k.ylikoCheckedOut"
                        :key="y.ylikoId"
                        dense
                        size="sm"
                        outline
                      >
                        {{ y.name }} × {{ y.qty }}
                      </q-chip>
                    </td>
                  </tr>
                  <tr class="bg-grey-2">
                    <td class="text-left text-weight-bold">ΣΥΝΟΛΟ</td>
                    <td class="text-right text-weight-bold">{{ stats.totals.stelexi }}</td>
                    <td class="text-right text-weight-bold">{{ stats.totals.kataskinotes }}</td>
                    <td class="text-right text-weight-bold">{{ stats.totals.total }}</td>
                    <td />
                  </tr>
                </tbody>
              </q-markup-table>
            </PageState>
          </q-tab-panel>

          <q-tab-panel name="participants" class="q-pa-none">
            <q-list bordered separator class="rounded-borders">
              <q-item v-for="p in data.participants" :key="p.id">
                <q-item-section>
                  <q-item-label>{{ p.user.lastName }} {{ p.user.firstName }}</q-item-label>
                  <q-item-label caption>
                    {{ MEMBER_KIND_LABEL[p.kind] }}
                    <span v-if="p.user.memberships[0]">
                      · {{ KLADOS_LABEL[p.user.memberships[0].klados.type] }}
                    </span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-icon
                    :name="p.confirmed ? 'check_circle' : 'help_outline'"
                    :color="p.confirmed ? 'positive' : 'grey-5'"
                  >
                    <q-tooltip>{{ p.confirmed ? 'Επιβεβαιωμένη' : 'Χωρίς επιβεβαίωση' }}</q-tooltip>
                  </q-icon>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <q-tab-panel name="yliko" class="q-pa-none">
            <q-list bordered separator class="rounded-borders">
              <q-item v-for="c in data.checkouts" :key="c.id">
                <q-item-section>
                  <q-item-label>{{ c.yliko.name }}</q-item-label>
                  <q-item-label caption>{{ YLIKO_CATEGORY_LABEL[c.yliko.category] }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-sm">
                    <span>{{ c.qty }} {{ c.yliko.unit ?? '' }}</span>
                    <q-badge :label="CHECKOUT_STATUS_LABEL[c.status]" />
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <q-tab-panel name="programma" class="q-pa-none">
            <q-list bordered separator class="rounded-borders">
              <q-item
                v-for="s in data.syggentrwseis"
                :key="s.id"
                clickable
                :to="{ name: 'syggentrwsh', params: { id: s.id } }"
              >
                <q-item-section>
                  <q-item-label>{{ s.title ?? formatDate(s.date) }}</q-item-label>
                  <q-item-label caption>
                    {{ formatDate(s.date) }} · {{ KLADOS_LABEL[s.klados.type] }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge outline :label="`${s._count.timeline} κομμάτια`" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <q-tab-panel name="incidents" class="q-pa-none">
            <q-list bordered separator class="rounded-borders">
              <q-item v-for="i in data.incidents" :key="i.id">
                <q-item-section avatar><q-icon name="healing" color="red-7" /></q-item-section>
                <q-item-section>
                  <q-item-label>{{ i.summary }}</q-item-label>
                  <q-item-label caption>{{ formatDateTime(i.occurredAt) }}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>
        </q-tab-panels>
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  CHECKOUT_STATUS_LABEL,
  DRASI_TYPE_LABEL,
  KLADOS_LABEL,
  MEMBER_KIND_LABEL,
  YLIKO_CATEGORY_LABEL,
  type CheckoutStatus,
  type DrasiType,
  type KataskinosiStats,
  type KladosType,
  type MemberKind,
  type YlikoCategory,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { applyKladosTheme } from '../lib/klados-theme';
import { get } from '../lib/api';
import { formatDate, formatDateRange, formatDateTime } from '../lib/format';

interface DrasiDetail {
  id: string;
  title: string;
  type: DrasiType;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  klados: { type: KladosType } | null;
  participants: {
    id: string;
    kind: MemberKind;
    confirmed: boolean;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      memberships: { klados: { type: KladosType } }[];
    };
  }[];
  checkouts: {
    id: string;
    qty: number;
    status: CheckoutStatus;
    yliko: { id: string; name: string; category: YlikoCategory; unit: string | null };
  }[];
  syggentrwseis: {
    id: string;
    title: string | null;
    date: string;
    klados: { type: KladosType };
    _count: { timeline: number };
  }[];
  incidents: { id: string; summary: string; occurredAt: string }[];
}

const route = useRoute();
const id = String(route.params.id);
const tab = ref('stats');

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<DrasiDetail>(`/draseis/${id}`),
  { cacheKey: `drasi:${id}` },
);

// Η σελίδα ζει εκτός `/k/:klados`, οπότε το layout δεν ξέρει τον κλάδο της· τον
// δηλώνει μόνη της ώστε τα κουμπιά της να πάρουν το χρώμα του.
watch(
  () => data.value?.klados?.type,
  (klados) => applyKladosTheme(klados ?? null),
  { immediate: true },
);

const stats = ref<KataskinosiStats | null>(null);
const statsLoading = ref(false);

watch(
  data,
  async (value) => {
    if (!value) return;
    statsLoading.value = true;
    try {
      stats.value = await get<KataskinosiStats>(`/draseis/${id}/stats`);
    } catch {
      stats.value = null;
    } finally {
      statsLoading.value = false;
    }
  },
  { immediate: true },
);
</script>
