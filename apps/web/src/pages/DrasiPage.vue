<template>
  <!--
    Η σελίδα της δράσης: αριστερά οι ενότητές της σαν δεύτερο συρτάρι δίπλα στο
    κύριο (σε μικρές οθόνες γίνεται οριζόντια λωρίδα), δεξιά η ενότητα. Η πρώτη,
    «Επισκόπηση», είναι το γρήγορο βλέμμα: ποιοι έρχονται, αρχηγείο, πλήθη.
    Η ενότητα ζει στη διαδρομή (/draseis/:id/:section) ώστε να ανοίγει με link.
  -->
  <q-page>
    <PageState :loading="loading && !data" :error="error" :stale="stale" @retry="reload">
      <div v-if="data" class="row no-wrap drasi-body">
        <!-- ── Συρτάρι ενοτήτων ── -->
        <nav class="drasi-nav gt-sm">
          <q-list padding>
            <q-item-label header class="q-pb-xs">Ενότητες</q-item-label>
            <q-item
              v-for="s in sections"
              :key="s.name"
              clickable
              dense
              :active="section === s.name"
              active-class="drasi-nav__active"
              :to="{ name: 'drasi', params: { id, section: s.name } }"
              replace
            >
              <q-item-section avatar><q-icon :name="s.icon" size="20px" /></q-item-section>
              <q-item-section>{{ s.label }}</q-item-section>
              <q-item-section v-if="s.badge" side><q-badge color="grey-4" text-color="grey-9" :label="s.badge" /></q-item-section>
            </q-item>
          </q-list>
        </nav>

        <div class="col drasi-content q-pa-md">
          <div class="row items-start justify-between q-gutter-sm q-mb-sm">
            <div>
              <div class="page-title">{{ data.title }}</div>
              <div class="text-caption text-grey-7">
                {{ DRASI_TYPE_LABEL[data.type] }} · {{ formatDateRange(data.dateStart, data.dateEnd) }}
                · έναρξη {{ formatTime(data.dateStart) }}
                <span v-if="data.location"> · {{ data.location }}</span>
                <q-badge v-if="data.status !== 'ENERGI'" :color="data.status === 'KLEISTI' ? 'grey-8' : 'orange-7'" :label="DRASI_STATUS_LABEL[data.status]" class="q-ml-xs" />
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
          </div>

          <!-- Σε μικρές οθόνες οι ενότητες γίνονται λωρίδα πάνω από το περιεχόμενο. -->
          <q-tabs
            :model-value="section"
            dense
            align="left"
            class="lt-md text-klados q-mb-md"
            narrow-indicator
            outside-arrows
            mobile-arrows
            @update:model-value="(v: string) => goSection(v)"
          >
            <q-tab v-for="s in sections" :key="s.name" :name="s.name" :label="s.badge ? `${s.label} (${s.badge})` : s.label" />
          </q-tabs>

          <q-tab-panels :model-value="section" animated>
            <!-- ── Επισκόπηση: το γρήγορο βλέμμα ── -->
            <q-tab-panel name="episkopisi" class="q-pa-none">
              <q-banner v-if="data.status === 'PROSXEDIO'" rounded class="bg-grey-2 q-mb-md">
                <template #avatar><q-icon name="edit_note" color="grey-7" /></template>
                Προσχέδιο: το στήσιμο δεν ολοκληρώθηκε. Δεν εμφανίζεται στο ημερολόγιο μέχρι να ολοκληρωθεί.
              </q-banner>

              <!-- Αριθμοί με μια ματιά -->
              <div class="row q-col-gutter-sm q-mb-md">
                <div v-for="n in numbers" :key="n.label" class="col-6 col-sm-3">
                  <q-card flat bordered class="q-pa-sm">
                    <div class="text-caption text-grey-7">{{ n.label }}</div>
                    <div class="text-h6">{{ n.value }}</div>
                  </q-card>
                </div>
              </div>

              <!-- Ποιοι έρχονται: δικοί μας κλάδοι στο χρώμα τους, φιλοξενούμενα Τοπικά ουδέτερα. -->
              <div class="text-subtitle2 q-mb-xs">Ποιοι έρχονται</div>
              <div class="row items-center q-gutter-xs q-mb-md">
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

              <q-card v-if="ypiresies.length" flat bordered class="q-mb-md">
                <q-card-section class="q-pb-none text-subtitle2">Υπηρεσίες</q-card-section>
                <q-card-section class="row q-col-gutter-sm">
                  <div v-for="group in ypiresies" :key="group.kind" class="col-12 col-sm-6 col-md-4">
                    <div class="text-caption text-grey-7">{{ DRASI_ROLE_LABEL[group.kind] }}</div>
                    <div v-for="r in group.roles" :key="r.id">
                      {{ r.user.lastName }} {{ r.user.firstName }}
                      <a v-if="r.user.phone" :href="`tel:${r.user.phone}`" class="text-klados text-caption q-ml-xs">{{ r.user.phone }}</a>
                    </div>
                  </div>
                </q-card-section>
              </q-card>

              <!-- Το φύλλο που ζητά το Τοπικό πριν την αναχώρηση. -->
              <div class="text-subtitle2 q-mb-xs">Στοιχεία ανά κλάδο</div>
              <PageState :loading="statsLoading" :empty="!stats?.perKlados.length" class="q-mb-md">
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

              <template v-if="data.incidents.length">
                <div class="text-subtitle2 q-mb-xs">Περιστατικά</div>
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="i in data.incidents" :key="i.id">
              <q-item-section avatar><q-icon name="healing" color="red-7" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ i.summary }}</q-item-label>
                <q-item-label caption>{{ formatDateTime(i.occurredAt) }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
              </template>
            </q-tab-panel>

            <q-tab-panel name="programma" class="q-pa-none">
              <DrasiProgramma :drasi-id="id" :organiser="data.klados?.type ?? null" :can-write="canWrite && data.status !== 'KLEISTI'" />
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

            <q-tab-panel name="tamio" class="q-pa-none">
              <DrasiTamio
                :drasi-id="id"
                :organiser="data.klados?.type ?? null"
                :can-write="canWrite"
                :locked="data.status === 'KLEISTI'"
                @changed="reload"
              />
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

          </q-tab-panels>
        </div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_STATUS_LABEL,
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
const router = useRouter();

/** Η ενότητα ζει στη διαδρομή· άγνωστη ή κενή ⇒ Επισκόπηση. */
const section = computed(() => {
  const s = typeof route.params.section === 'string' ? route.params.section : '';
  return sections.value.some((x) => x.name === s) ? s : 'episkopisi';
});
function goSection(name: string): void {
  void router.replace({ name: 'drasi', params: { id, section: name } });
}

const sections = computed(() => {
  const list = [
    { name: 'episkopisi', label: 'Επισκόπηση', icon: 'dashboard', badge: '' },
    { name: 'programma', label: 'Πρόγραμμα', icon: 'schedule', badge: '' },
    { name: 'participants', label: 'Συμμετέχοντες', icon: 'groups', badge: String(data.value?.participants.length ?? '') },
    { name: 'omades', label: 'Ομάδες', icon: 'diversity_3', badge: '' },
    { name: 'entypa', label: 'Έντυπα', icon: 'assignment', badge: '' },
    { name: 'farmakeio', label: 'Φαρμακείο', icon: 'medical_services', badge: '' },
    { name: 'yliko', label: 'Υλικό', icon: 'inventory_2', badge: '' },
    { name: 'tamio', label: 'Ταμείο', icon: 'account_balance_wallet', badge: '' },
    { name: 'symvoulia', label: 'Συμβούλια', icon: 'forum', badge: '' },
    { name: 'axiologisi', label: 'Αξιολόγηση', icon: 'rate_review', badge: '' },
    { name: 'ektyposi', label: 'Εκτύπωση', icon: 'print', badge: '' },
  ];
  if (canWrite.value) list.push({ name: 'rythmiseis', label: 'Ρυθμίσεις', icon: 'settings', badge: '' });
  return list;
});

/** Οι αριθμοί της επισκόπησης. */
const numbers = computed(() => {
  const d = data.value;
  if (!d) return [];
  const days = Math.max(1, Math.round((new Date(d.dateEnd).setHours(12) - new Date(d.dateStart).setHours(12)) / 86_400_000) + 1);
  return [
    { label: 'Συμμετέχοντες', value: d.participants.length },
    { label: 'Στελέχη', value: stats.value?.totals.stelexi ?? d.participants.filter((p) => p.kind === 'STELEXOS').length },
    { label: 'Παιδιά', value: stats.value?.totals.kataskinotes ?? d.participants.filter((p) => p.kind !== 'STELEXOS').length },
    { label: d.type === 'MONOIMERI' ? 'Ημέρα' : 'Ημέρες', value: days },
  ];
});

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<DrasiDetail>(`/draseis/${id}`),
  { cacheKey: `drasi:${id}` },
);

// Η σελίδα ζει εκτός `/k/:klados`, οπότε το layout δεν ξέρει τον κλάδο της· τον
// δηλώνει μόνη της ώστε τα κουμπιά της να πάρουν το χρώμα του.
// Και στην αλλαγή διαδρομής: το layout καθαρίζει το θέμα σε κάθε πλοήγηση, άρα
// και όταν αλλάζει μόνο η ενότητα/το στοιχείο μέσα στην ίδια σελίδα — ο κλάδος
// δεν άλλαξε, οπότε μόνο η διαδρομή μάς ξυπνά να το ξαναβάψουμε.
watch(
  [() => data.value?.klados?.type, () => route.fullPath],
  ([klados]) => applyKladosTheme(klados ?? null),
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

<style scoped>
/* Το συρτάρι της δράσης: κολλάει κάτω από την κεφαλίδα και πιάνει όλο το ύψος, σαν συνέχεια του κύριου συρταριού. */
.drasi-nav {
  flex: 0 0 224px;
  width: 224px;
  position: sticky;
  top: 50px;
  align-self: flex-start;
  min-height: calc(100vh - 50px);
  border-right: 1px solid rgba(0, 0, 0, 0.12);
  background: #fafafa;
}
.drasi-nav__active {
  color: var(--klados-ink);
  background: color-mix(in srgb, var(--klados-ink) 10%, transparent);
  font-weight: 600;
}
.drasi-content {
  min-width: 0;
}
</style>
