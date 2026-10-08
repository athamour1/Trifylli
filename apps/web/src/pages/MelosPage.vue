<template>
  <q-page padding>
    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <div class="page-title">{{ data.lastName }} {{ data.firstName }}</div>
        <div class="text-caption text-grey-7 q-mb-md">
          {{ MEMBER_KIND_LABEL[data.kind] }} · {{ MEMBER_STATUS_LABEL[data.status] }}
          <span v-if="data.sex"> · {{ SEX_LABEL[data.sex] ?? data.sex }}</span>
          <span v-if="data.age !== null"> · {{ data.age }} ετών</span>
        </div>

        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-4">
            <q-card flat bordered>
              <q-card-section class="text-subtitle2 text-weight-medium">Στοιχεία</q-card-section>
              <q-separator />
              <q-list dense>
                <q-item v-if="data.email">
                  <q-item-section avatar><q-icon name="mail" /></q-item-section>
                  <q-item-section>{{ data.email }}</q-item-section>
                </q-item>
                <q-item v-if="data.phone">
                  <q-item-section avatar><q-icon name="phone" /></q-item-section>
                  <q-item-section>{{ data.phone }}</q-item-section>
                </q-item>
                <q-item v-if="data.birthDate">
                  <q-item-section avatar><q-icon name="cake" /></q-item-section>
                  <q-item-section>{{ formatDate(data.birthDate) }}</q-item-section>
                </q-item>
                <q-item v-if="address">
                  <q-item-section avatar><q-icon name="home" /></q-item-section>
                  <q-item-section>{{ address }}</q-item-section>
                </q-item>
                <q-item v-for="m in data.memberships" :key="m.id">
                  <q-item-section avatar><q-icon name="groups" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ KLADOS_LABEL[m.klados.type] }}</q-item-label>
                    <q-item-label caption>{{ m.subUnit ?? '—' }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>

            <q-card flat bordered class="q-mt-md">
              <q-card-section class="text-subtitle2 text-weight-medium">Παρουσία</q-card-section>
              <q-separator />
              <q-card-section>
                <q-linear-progress
                  :value="data.attendance.rate / 100"
                  size="20px"
                  :color="data.attendance.rate >= 70 ? 'positive' : data.attendance.rate >= 40 ? 'warning' : 'negative'"
                >
                  <div class="absolute-full flex flex-center">
                    <span class="text-white text-caption">{{ data.attendance.rate }}%</span>
                  </div>
                </q-linear-progress>
                <div class="text-caption text-grey-7 q-mt-xs">
                  {{ data.attendance.present }} από {{ data.attendance.total }} συγκεντρώσεις
                </div>
              </q-card-section>
            </q-card>

            <q-card v-if="data.guardians.length" flat bordered class="q-mt-md">
              <q-card-section class="text-subtitle2 text-weight-medium">Κηδεμόνες</q-card-section>
              <q-separator />
              <q-list dense separator>
                <q-item v-for="g in data.guardians" :key="g.id">
                  <q-item-section avatar>
                    <q-icon name="family_restroom" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ g.fullName ?? '—' }}</q-item-label>
                    <q-item-label caption>
                      {{ guardianKind(g.kind) }}
                      <span v-if="g.phone"> · {{ g.phone }}</span>
                      <span v-if="g.email"> · {{ g.email }}</span>
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <div class="col-12 col-md-4">
            <q-card flat bordered>
              <q-card-section class="text-subtitle2 text-weight-medium">Συνδρομές</q-card-section>
              <q-separator />
              <q-list v-if="data.syndromes.length" dense separator>
                <q-item v-for="s in data.syndromes" :key="s.id">
                  <q-item-section>
                    <q-item-label>{{ s.period.label }}</q-item-label>
                    <q-item-label caption>
                      {{ formatEuro(Number(s.amountPaid)) }} / {{ formatEuro(Number(s.amountDue)) }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge
                      :color="SYNDROMI_COLOR[s.status]"
                      :label="SYNDROMI_STATUS_LABEL[s.status]"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
              <q-card-section v-else class="text-caption text-grey-6">Καμία εγγραφή.</q-card-section>
            </q-card>

            <q-card v-if="hasLeaderRole && leaderProfile" flat bordered class="q-mt-md">
              <q-card-section class="row items-center justify-between q-pb-none">
                <div class="text-subtitle2 text-weight-medium">Θέση στελέχους</div>
                <q-badge v-if="leaderProfile.isSOS" color="deep-orange-7" label="ΣΟΣ" />
              </q-card-section>
              <q-card-section class="q-gutter-xs">
                <div v-for="r in leaderProfile.kladosRoles" :key="r.kladosType" class="row items-center q-gutter-sm">
                  <q-icon name="military_tech" size="18px" :style="{ color: kladosColor(r.kladosType) }" />
                  <span class="text-weight-medium">{{ LEADER_RANK_LABEL[r.rank] }}</span>
                  <span class="text-grey-7">· {{ KLADOS_LABEL[r.kladosType] }}</span>
                </div>
                <div v-for="t in leaderProfile.topikoTitles" :key="t" class="row items-center q-gutter-sm">
                  <q-icon name="account_balance" size="18px" color="grey-7" />
                  <span>{{ t }}</span>
                </div>
              </q-card-section>
            </q-card>

            <q-card v-if="data.licenses.length" flat bordered class="q-mt-md">
              <q-card-section class="text-subtitle2 text-weight-medium">Πτυχία</q-card-section>
              <q-separator />
              <q-list dense separator>
                <q-item v-for="l in data.licenses" :key="l.id">
                  <q-item-section>
                    <q-item-label>{{ l.title }}</q-item-label>
                    <q-item-label caption>
                      <span v-if="l.startDate">{{ formatDate(l.startDate) }}</span>
                      <span v-if="l.expirationDate"> – {{ formatDate(l.expirationDate) }}</span>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge :color="licenseMeta(l.status).color" :label="licenseMeta(l.status).label" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <div class="col-12 col-md-4">
            <q-card flat bordered>
              <q-card-section class="text-subtitle2 text-weight-medium">Πρόοδος</q-card-section>
              <q-separator />
              <q-list v-if="data.proodos.length" dense separator>
                <q-item v-for="p in data.proodos" :key="p.id">
                  <q-item-section>
                    <q-item-label>{{ p.goal.title }}</q-item-label>
                    <q-item-label caption>{{ p.goal.category ?? '—' }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon
                      :name="p.status === 'OLOKLIROMENO' ? 'check_circle' : 'hourglass_empty'"
                      :color="p.status === 'OLOKLIROMENO' ? 'positive' : 'warning'"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
              <q-card-section v-else class="text-caption text-grey-6">Καμία εγγραφή.</q-card-section>
            </q-card>

            <q-card flat bordered class="q-mt-md">
              <q-card-section class="text-subtitle2 text-weight-medium">Συμμετοχές σε δράσεις</q-card-section>
              <q-separator />
              <q-list v-if="data.participations.length" dense separator>
                <q-item
                  v-for="p in data.participations"
                  :key="p.id"
                  clickable
                  :to="{ name: 'drasi', params: { id: p.drasi.id } }"
                >
                  <q-item-section>
                    <q-item-label>{{ p.drasi.title }}</q-item-label>
                    <q-item-label caption>{{ formatDate(p.drasi.dateStart) }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
              <q-card-section v-else class="text-caption text-grey-6">Καμία συμμετοχή.</q-card-section>
            </q-card>
          </div>
        </div>
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  deriveLeaderProfile,
  KLADOS_LABEL,
  KLADOS_META,
  LEADER_RANK_LABEL,
  MEMBER_STATUS_LABEL,
  MEMBER_KIND_LABEL,
  SYNDROMI_STATUS_LABEL,
  type KladosType,
  type MemberStatus,
  type ProodosStatus,
  type MemberKind,
  type SyndromiStatus,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { formatDate, formatEuro } from '../lib/format';

interface MemberDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  sex: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  area: string | null;
  kind: MemberKind;
  status: MemberStatus;
  age: number | null;
  attendance: { total: number; present: number; rate: number };
  memberships: { id: string; subUnit: string | null; klados: { type: KladosType; name: string | null } }[];
  guardians: { id: string; kind: string; fullName: string | null; phone: string | null; email: string | null }[];
  licenses: {
    id: string;
    title: string;
    status: string;
    startDate: string | null;
    expirationDate: string | null;
  }[];
  syndromes: {
    id: string;
    amountDue: string;
    amountPaid: string;
    status: SyndromiStatus;
    period: { label: string };
  }[];
  proodos: { id: string; status: ProodosStatus; goal: { title: string; category: string | null } }[];
  participations: { id: string; drasi: { id: string; title: string; dateStart: string } }[];
}

const route = useRoute();
const id = String(route.params.id);

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<MemberDetail>(`/meloi/${id}`),
  { forbiddenPage: true, cacheKey: `melos:${id}` },
);

const SYNDROMI_COLOR: Record<SyndromiStatus, string> = {
  PLIROMENI: 'positive',
  MERIKI: 'warning',
  EKKREMI: 'negative',
  APALLAGI: 'info',
};

const SEX_LABEL: Record<string, string> = { MALE: 'Άνδρας', FEMALE: 'Γυναίκα' };
const GUARDIAN_KIND_LABEL: Record<string, string> = {
  FATHER: 'Πατέρας',
  MOTHER: 'Μητέρα',
  GUARDIAN: 'Κηδεμόνας',
};
const LICENSE_META: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ενεργό', color: 'positive' },
  EXPIRED: { label: 'Έληξε', color: 'grey-6' },
  PENDING: { label: 'Σε εκκρεμότητα', color: 'warning' },
};

/** Διεύθυνση σε μία γραμμή, παραλείποντας τα κενά κομμάτια. */
const address = computed(() => {
  const d = data.value;
  if (!d) return '';
  const cityLine = [d.postalCode, d.city].filter(Boolean).join(' ');
  return [d.street, cityLine, d.area].filter(Boolean).join(', ');
});

function guardianKind(kind: string): string {
  return GUARDIAN_KIND_LABEL[kind] ?? kind;
}

/** Προφίλ στελέχους (κλάδος+ρόλος / θέσεις Τοπικού / ΣΟΣ) από τα ενεργά πτυχία. */
const leaderProfile = computed(() => (data.value ? deriveLeaderProfile(data.value.licenses) : null));
function kladosColor(k: KladosType): string {
  return KLADOS_META[k].color;
}
const hasLeaderRole = computed(
  () =>
    !!leaderProfile.value &&
    (leaderProfile.value.kladosRoles.length > 0 ||
      leaderProfile.value.topikoTitles.length > 0 ||
      leaderProfile.value.isSOS),
);

function licenseMeta(status: string): { label: string; color: string } {
  return LICENSE_META[status] ?? { label: status, color: 'grey-6' };
}
</script>
