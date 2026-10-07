<template>
  <q-page padding>
    <PageState :loading="loading && !data" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <div class="row items-start justify-between q-gutter-sm">
          <div>
            <div class="page-title">{{ data.title }}</div>
            <div class="text-caption text-grey-7">
              {{ DRASI_TYPE_LABEL[data.type] }} · {{ formatDateRange(data.dateStart, data.dateEnd) }}
              <span v-if="data.location"> · {{ data.location }}</span>
            </div>
          </div>
          <q-btn
            v-if="canWrite && wizardRoute"
            flat
            color="klados"
            icon="tune"
            :label="data.status === 'PROSXEDIO' ? 'Συνέχεια στήσιμου' : 'Στήσιμο'"
            :to="wizardRoute"
          />
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
          <q-tab name="participants" :label="`Συμμετέχοντες (${data.participants.length})`" />
          <q-tab name="omades" label="Ομάδες" />
          <q-tab name="tamio" label="Ταμείο" />
          <q-tab v-if="ypiresies.length" name="ypiresies" label="Υπηρεσίες" />
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
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  CHECKOUT_STATUS_LABEL,
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_TYPE_LABEL,
  DRASI_YPIRESIA_KINDS,
  KLADOS_LABEL,
  KLADOS_META,
  YLIKO_CATEGORY_LABEL,
  type CheckoutStatus,
  type DrasiGuestTopikoView,
  type DrasiRoleKind,
  type DrasiRoleView,
  type DrasiStatus,
  type DrasiType,
  type KataskinosiStats,
  type KladosType,
  type MemberKind,
  type YlikoCategory,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import DrasiOmades from '../components/drasi/DrasiOmades.vue';
import DrasiSymmetexontes from '../components/drasi/DrasiSymmetexontes.vue';
import DrasiTamio from '../components/drasi/DrasiTamio.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { applyKladosTheme, kladosVars } from '../lib/klados-theme';
import { get } from '../lib/api';
import { formatDate, formatDateRange, formatDateTime } from '../lib/format';
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
const auth = useAuthStore();
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
