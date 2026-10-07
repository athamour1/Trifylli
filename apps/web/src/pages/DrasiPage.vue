<template>
  <q-page padding>
    <PageState :loading="loading && !data" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <div class="row items-start justify-between q-gutter-sm">
          <div>
            <div class="page-title">{{ data.title }}</div>
            <div class="text-caption text-grey-7">
              {{ DRASI_TYPE_LABEL[data.type] }} · {{ formatDateRange(data.dateStart, data.dateEnd) }}
              · έναρξη {{ formatTime(data.dateStart) }}
              <span v-if="data.location"> · {{ data.location }}</span>
            </div>
          </div>
          <q-btn
            v-if="canWrite && wizardRoute && data.status === 'PROSXEDIO'"
            flat
            color="klados"
            icon="tune"
            label="Συνέχεια στήσιμου"
            :to="wizardRoute"
          />
          <q-btn v-else-if="canWrite" flat color="klados" icon="settings" label="Ρυθμίσεις" @click="tab = 'rythmiseis'" />
        </div>

        <!-- Ποιοι έρχονται: δικοί μας κλάδοι στο χρώμα τους, φιλοξενούμενα Τοπικά ουδέτερα. -->
        <div class="row items-center q-gutter-xs q-mt-sm q-mb-md">
          <q-chip
            v-for="k in data.kladoi"
            :key="k"
            dense
            :style="kladosVars(k)"
            class="bg-klados text-klados-on"
            :icon="KLADOS_META[k].icon"
            :label="KLADOS_LABEL[k]"
          />
          <q-chip
            v-for="g in data.guestTopika"
            :key="g.id"
            dense
            outline
            icon="location_city"
            :label="g.topikoName"
          >
            <q-tooltip v-if="g.kladoi.length || g.contactName">
              <span v-if="g.kladoi.length">{{ g.kladoi.map((k) => KLADOS_LABEL[k]).join(', ') }}</span>
              <span v-if="g.contactName"> · {{ g.contactName }}</span>
              <span v-if="g.contactPhone"> {{ g.contactPhone }}</span>
            </q-tooltip>
          </q-chip>
          <span v-if="!data.kladoi.length && !data.guestTopika.length" class="text-caption text-grey-6">
            Δεν έχει δηλωθεί ποιοι έρχονται.
          </span>
        </div>

        <q-banner v-if="data.status === 'PROSXEDIO'" rounded class="bg-grey-2 q-mb-md">
          <template #avatar><q-icon name="edit_note" color="grey-7" /></template>
          Προσχέδιο: το στήσιμο δεν ολοκληρώθηκε. Δεν εμφανίζεται στο ημερολόγιο μέχρι να ολοκληρωθεί.
        </q-banner>

        <!-- Το αρχηγείο: ονόματα και τηλέφωνα — αυτό ψάχνει κανείς στις 7 το πρωί. -->
        <q-card v-if="arxigeio.length" flat bordered class="q-mb-md">
          <q-card-section class="q-pb-none text-subtitle2">Αρχηγείο</q-card-section>
          <q-card-section class="row q-col-gutter-sm">
            <div v-for="group in arxigeio" :key="group.kind" class="col-12 col-sm-6 col-md-4">
              <div class="text-caption text-grey-7">{{ DRASI_ROLE_LABEL[group.kind] }}</div>
              <div v-for="r in group.roles" :key="r.id">
                {{ r.user.lastName }} {{ r.user.firstName }}
                <a v-if="r.user.phone" :href="`tel:${r.user.phone}`" class="text-klados text-caption q-ml-xs">
                  {{ r.user.phone }}
                </a>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-tabs v-model="tab" dense align="left" class="text-klados q-mb-md" narrow-indicator>
          <q-tab name="stats" label="Στοιχεία ανά κλάδο" />
          <q-tab name="programma" label="Πρόγραμμα" />
          <q-tab name="participants" :label="`Συμμετέχοντες (${data.participants.length})`" />
          <q-tab name="omades" label="Ομάδες" />
          <q-tab name="entypa" label="Έντυπα" />
          <q-tab name="farmakeio" label="Φαρμακείο" />
          <q-tab name="yliko" label="Υλικό" />
          <q-tab name="tamio" label="Ταμείο" />
          <q-tab name="symvoulia" label="Συμβούλια" />
          <q-tab name="axiologisi" label="Αξιολόγηση" />
          <q-tab name="ektyposi" label="Εκτύπωση" />
          <q-tab v-if="canWrite" name="rythmiseis" label="Ρυθμίσεις" icon="settings" />
          <q-tab v-if="ypiresies.length" name="ypiresies" label="Υπηρεσίες" />
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
            <DrasiSymmetexontes
              :drasi-id="id"
              :kladoi="data.kladoi"
              :guest-topika="data.guestTopika"
              :can-write="canWrite"
              :locked="data.status === 'KLEISTI'"
              :costs="{
                costPerPerson: data.costPerPerson,
                costReduced: data.costReduced,
                costStelexos: data.costStelexos,
                transportCost: data.transportCost,
              }"
              @changed="reload"
            />
          </q-tab-panel>

          <q-tab-panel name="omades" class="q-pa-none">
            <DrasiOmades
              :drasi-id="id"
              :kladoi="data.kladoi"
              :organiser="data.klados?.type ?? null"
              :can-write="canWrite && data.status !== 'KLEISTI'"
            />
          </q-tab-panel>

          <q-tab-panel name="entypa" class="q-pa-none">
            <DrasiEntypa :drasi-id="id" :can-write="canWrite && data.status !== 'KLEISTI'" />
          </q-tab-panel>

          <q-tab-panel name="farmakeio" class="q-pa-none">
            <DrasiFarmakeio :drasi-id="id" :can-write="canWrite && data.status !== 'KLEISTI'" />
          </q-tab-panel>

          <q-tab-panel name="tamio" class="q-pa-none">
            <DrasiTamio
              :drasi-id="id"
              :organiser="data.klados?.type ?? null"
              :can-write="canWrite"
              :locked="data.status === 'KLEISTI'"
              @changed="reload"
            />
          </q-tab-panel>

          <q-tab-panel name="ypiresies" class="q-pa-none">
            <q-list bordered separator class="rounded-borders">
              <q-item v-for="group in ypiresies" :key="group.kind">
                <q-item-section>
                  <q-item-label>{{ DRASI_ROLE_LABEL[group.kind] }}</q-item-label>
                  <q-item-label caption>
                    {{ group.roles.map((r) => `${r.user.lastName} ${r.user.firstName}`).join(', ') }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <q-tab-panel name="yliko" class="q-pa-none">
            <DrasiYliko
              :drasi-id="id"
              :organiser="data.klados?.type ?? null"
              :kladoi="data.kladoi"
              :guest-topika="data.guestTopika"
              :date-start="data.dateStart"
              :date-end="data.dateEnd"
              :can-write="canWrite && data.status !== 'KLEISTI'"
            />
          </q-tab-panel>

          <q-tab-panel name="programma" class="q-pa-none">
            <DrasiProgramma :drasi-id="id" :organiser="data.klados?.type ?? null" :can-write="canWrite && data.status !== 'KLEISTI'" />
          </q-tab-panel>

          <q-tab-panel name="symvoulia" class="q-pa-none">
            <DrasiSymvoulia :drasi-id="id" :can-write="canWrite" />
          </q-tab-panel>

          <q-tab-panel name="axiologisi" class="q-pa-none">
            <DrasiAxiologisi :drasi-id="id" :can-write="canWrite" />
          </q-tab-panel>

          <q-tab-panel name="ektyposi" class="q-pa-none">
            <DrasiEktyposi :drasi-id="id" :title="data.title" />
          </q-tab-panel>

          <q-tab-panel name="rythmiseis" class="q-pa-none">
            <DrasiRythmiseis :data="data" @changed="reload" />
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
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_TYPE_LABEL,
  DRASI_YPIRESIA_KINDS,
  KLADOS_LABEL,
  KLADOS_META,
  type DrasiGuestTopikoView,
  type DrasiRoleKind,
  type DrasiRoleView,
  type DrasiStatus,
  type DrasiType,
  type KataskinosiStats,
  type KladosType,
  type MemberKind,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import DrasiAxiologisi from '../components/drasi/DrasiAxiologisi.vue';
import DrasiEktyposi from '../components/drasi/DrasiEktyposi.vue';
import DrasiEntypa from '../components/drasi/DrasiEntypa.vue';
import DrasiFarmakeio from '../components/drasi/DrasiFarmakeio.vue';
import DrasiOmades from '../components/drasi/DrasiOmades.vue';
import DrasiProgramma from '../components/drasi/DrasiProgramma.vue';
import DrasiRythmiseis from '../components/drasi/DrasiRythmiseis.vue';
import DrasiSymvoulia from '../components/drasi/DrasiSymvoulia.vue';
import DrasiYliko from '../components/drasi/DrasiYliko.vue';
import DrasiSymmetexontes from '../components/drasi/DrasiSymmetexontes.vue';
import DrasiTamio from '../components/drasi/DrasiTamio.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { applyKladosTheme, kladosVars } from '../lib/klados-theme';
import { get } from '../lib/api';
import { formatDateRange, formatDateTime, formatTime } from '../lib/format';
import { useAuthStore } from '../stores/auth';

interface DrasiDetail {
  id: string;
  title: string;
  type: DrasiType;
  status: DrasiStatus;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  klados: { type: KladosType } | null;
  description: string | null;
  kladoi: KladosType[];
  guestTopika: DrasiGuestTopikoView[];
  roles: DrasiRoleView[];
  costPerPerson: string | number | null;
  costReduced: string | number | null;
  costStelexos: string | number | null;
  transportCost: string | number | null;
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
  checkouts: { id: string }[];
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
const auth = useAuthStore();
const id = String(route.params.id);
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'stats');

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

const canWrite = computed(() => auth.can('drasi:write', data.value?.klados?.type ?? undefined));

/**
 * Το wizard ζει κάτω από `/k/:klados/`. Για δράση Τοπικού (χωρίς διοργανωτή
 * κλάδο) χρησιμοποιείται ο πρώτος κλάδος που βλέπει ο χρήστης — το στήσιμο
 * δεν εξαρτάται από τη διαδρομή, μόνο το θέμα χρωμάτων.
 */
const wizardRoute = computed(() => {
  const klados = data.value?.klados?.type ?? auth.kladoi[0]?.type;
  return klados ? { name: 'klados-drasi-nea', params: { klados }, query: { id } } : null;
});

interface RoleGroup {
  kind: DrasiRoleKind;
  roles: DrasiRoleView[];
}

function groupRoles(kinds: readonly DrasiRoleKind[]): RoleGroup[] {
  const roles = data.value?.roles ?? [];
  return kinds
    .map((kind) => ({ kind, roles: roles.filter((r) => r.kind === kind) }))
    .filter((g) => g.roles.length > 0);
}

const arxigeio = computed(() => groupRoles(DRASI_ARXIGEIO_KINDS));
const ypiresies = computed(() => groupRoles(DRASI_YPIRESIA_KINDS));

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
