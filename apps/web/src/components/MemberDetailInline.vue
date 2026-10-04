<template>
  <div>
    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <!-- ── Hero: χρώμα κλάδου, με back button πάνω-αριστερά ── -->
        <div class="member-hero rounded-borders q-mb-md">
          <q-btn
            flat round dense icon="arrow_back" color="white" class="hero-back"
            aria-label="Πίσω στη λίστα"
            @click="$emit('back')"
          >
            <q-tooltip>Πίσω στη λίστα</q-tooltip>
          </q-btn>

          <div class="row items-center no-wrap q-gutter-md hero-main">
            <q-avatar size="72px" color="white" text-color="dark" class="text-weight-bold">
              {{ initials }}
            </q-avatar>
            <div class="col">
              <div class="text-h5 text-white text-weight-bold ellipsis">
                {{ data.lastName }} {{ data.firstName }}
              </div>
              <div class="text-white text-subtitle2" style="opacity: 0.9">
                <span v-if="data.idiotita">{{ IDIOTITA_LABEL[data.idiotita] ?? data.idiotita }}</span>
                <span v-else-if="primaryKlados">{{ KLADOS_LABEL[primaryKlados] }}</span>
                <span v-if="subUnit"> · {{ subUnit }}</span>
                <span v-if="data.age !== null"> · {{ data.age }} ετών</span>
              </div>
              <div class="row items-center q-gutter-xs q-mt-sm">
                <q-chip dense square size="sm" color="white" text-color="dark" :label="MEMBER_KIND_LABEL[data.kind]" />
                <q-chip dense square size="sm" color="white" text-color="dark" :label="MEMBER_STATUS_LABEL[data.status]" />
                <q-chip v-if="isSOS" dense square size="sm" color="deep-orange-7" text-color="white" icon="emergency" label="ΣΟΣ" />
              </div>
            </div>
          </div>

          <!-- Γρήγορη εικόνα συναινέσεων/συνδρομής (ίδια «γλώσσα» με τον πίνακα) -->
          <div class="row q-gutter-sm hero-quick">
            <div class="hero-pill"><ConsentMark :ok="gdpr" /><span>GDPR</span></div>
            <div class="hero-pill"><ConsentMark :ok="photo" /><span>Φωτό</span></div>
            <div class="hero-pill"><ConsentMark :ok="syndromiPaid" paid /><span>Συνδρομή</span></div>
          </div>
        </div>

        <!-- ── Κάρτες στοιχείων ── -->
        <div class="row q-col-gutter-md">
          <!-- Επικοινωνία & διεύθυνση -->
          <div class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="contact_mail" class="q-mr-sm" />Επικοινωνία</q-card-section>
              <q-separator />
              <q-list dense>
                <InfoRow v-if="data.email" icon="mail" :value="data.email" />
                <InfoRow v-if="data.phone" icon="phone" :value="data.phone" />
                <InfoRow v-if="data.birthDate" icon="cake" :value="`${formatDate(data.birthDate)}${data.age !== null ? ` · ${data.age} ετών` : ''}`" />
                <InfoRow v-if="data.sex" icon="wc" :value="SEX_LABEL[data.sex] ?? data.sex" />
                <InfoRow v-if="address" icon="home" :value="address" />
                <q-item v-for="m in data.memberships" :key="m.id">
                  <q-item-section avatar><q-icon name="groups" color="klados" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ KLADOS_LABEL[m.klados.type] }}</q-item-label>
                    <q-item-label caption>{{ m.subUnit ?? '—' }}</q-item-label>
                  </q-item-section>
                </q-item>
                <q-item v-if="!data.email && !data.phone && !address">
                  <q-item-section class="text-caption text-grey-6">Χωρίς στοιχεία επικοινωνίας.</q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Συναινέσεις e-SEO -->
          <div class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="verified_user" class="q-mr-sm" />Συναινέσεις (e-SEO)</q-card-section>
              <q-separator />
              <q-list dense>
                <ConsentRow label="GDPR" :ok="gdpr" />
                <ConsentRow label="Άδεια φωτογραφιών (ιδίου)" :ok="photoSelf" />
                <ConsentRow label="Άδεια φωτογραφιών (γονέα)" :ok="photoParent" />
                <ConsentRow label="Πολιτική προσωπικών δεδομένων" :ok="bool('policyConsent')" />
                <ConsentRow label="Υποχρεωτικές συναινέσεις" :ok="bool('requiredConsentsAgreed')" />
                <q-item v-if="!hasEseo">
                  <q-item-section class="text-caption text-grey-6">Δεν έχει συγχρονιστεί από e-SEO.</q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Συνδρομές (status ανά περίοδο — χωρίς ποσά οφειλής) -->
          <div class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="euro" class="q-mr-sm" />Συνδρομές</q-card-section>
              <q-separator />
              <q-list v-if="data.syndromes.length" dense separator>
                <q-item v-for="s in data.syndromes" :key="s.id">
                  <q-item-section>{{ s.period.label }}</q-item-section>
                  <q-item-section side>
                    <q-badge :color="SYNDROMI_COLOR[s.status]" :label="SYNDROMI_STATUS_LABEL[s.status]" />
                  </q-item-section>
                </q-item>
              </q-list>
              <q-card-section v-else class="text-caption text-grey-6">Καμία εγγραφή.</q-card-section>
            </q-card>
          </div>

          <!-- Κηδεμόνες -->
          <div v-if="data.guardians.length" class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="family_restroom" class="q-mr-sm" />Κηδεμόνες</q-card-section>
              <q-separator />
              <q-list dense separator>
                <q-item v-for="g in data.guardians" :key="g.id">
                  <q-item-section>
                    <q-item-label>{{ g.fullName ?? '—' }}</q-item-label>
                    <q-item-label caption>
                      <span>{{ GUARDIAN_KIND_LABEL[g.kind] ?? g.kind }}</span>
                      <span v-if="g.phone"> · {{ g.phone }}</span>
                      <span v-if="g.email"> · {{ g.email }}</span>
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Μητρώο e-SEO (extra στοιχεία) -->
          <div v-if="hasEseo" class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="badge" class="q-mr-sm" />Στοιχεία μητρώου</q-card-section>
              <q-separator />
              <q-list dense>
                <InfoRow v-if="str('registryNumber')" icon="tag" :value="`Αρ. μητρώου: ${str('registryNumber')}`" />
                <InfoRow v-if="str('socialSecurityNumber')" icon="health_and_safety" :value="`ΑΜΚΑ: ${str('socialSecurityNumber')}`" />
                <InfoRow v-if="str('idCardNumber')" icon="contact_page" :value="`ΑΔΤ: ${str('idCardNumber')}`" />
                <InfoRow v-if="str('registrationDate')" icon="event_available" :value="`Εγγραφή: ${formatDate(str('registrationDate'))}`" />
                <InfoRow v-if="str('educationLevel')" icon="school" :value="str('educationLevel')" />
                <q-item v-if="!registryHasAny">
                  <q-item-section class="text-caption text-grey-6">—</q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Πτυχία -->
          <div v-if="data.licenses.length" class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="workspace_premium" class="q-mr-sm" />Πτυχία</q-card-section>
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
                    <q-badge :color="LICENSE_META[l.status]?.color ?? 'grey-6'" :label="LICENSE_META[l.status]?.label ?? l.status" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Παρουσία -->
          <div class="col-12 col-md-6">
            <q-card flat bordered class="full-height">
              <q-card-section class="section-title"><q-icon name="event_available" class="q-mr-sm" />Παρουσία</q-card-section>
              <q-separator />
              <q-card-section>
                <q-linear-progress
                  rounded size="22px"
                  :value="data.attendance.rate / 100"
                  :color="data.attendance.rate >= 70 ? 'positive' : data.attendance.rate >= 40 ? 'warning' : 'negative'"
                  class="q-mb-sm"
                >
                  <div class="absolute-full flex flex-center">
                    <span class="text-white text-caption text-weight-medium">{{ data.attendance.rate }}%</span>
                  </div>
                </q-linear-progress>
                <div class="text-caption text-grey-7">
                  {{ data.attendance.present }} από {{ data.attendance.total }} συγκεντρώσεις
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </template>
    </PageState>
  </div>
</template>

<script setup lang="ts">
import { computed, h, type FunctionalComponent } from 'vue';
import {
  IDIOTITA_LABEL,
  KLADOS_LABEL,
  MEMBER_KIND_LABEL,
  MEMBER_STATUS_LABEL,
  SYNDROMI_STATUS_LABEL,
  deriveLeaderProfile,
  type KladosType,
  type MemberKind,
  type MemberStatus,
  type SyndromiStatus,
} from '@trifylli/shared';
import { QIcon, QItem, QItemSection, QItemLabel } from 'quasar';
import PageState from './PageState.vue';
import ConsentMark from './ConsentMark.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { formatDate } from '../lib/format';

const props = defineProps<{ memberId: string }>();
defineEmits<{ back: [] }>();

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
  idiotita: string | null;
  age: number | null;
  eseoPayload: Record<string, unknown> | null;
  attendance: { total: number; present: number; rate: number };
  memberships: { id: string; subUnit: string | null; klados: { type: KladosType; name: string | null } }[];
  guardians: { id: string; kind: string; fullName: string | null; phone: string | null; email: string | null }[];
  licenses: { id: string; title: string; status: string; startDate: string | null; expirationDate: string | null }[];
  syndromes: { id: string; status: SyndromiStatus; period: { label: string } }[];
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<MemberDetail>(`/meloi/${props.memberId}`),
  { watchSources: [() => props.memberId] },
);

const SYNDROMI_COLOR: Record<SyndromiStatus, string> = {
  PLIROMENI: 'positive',
  MERIKI: 'warning',
  EKKREMI: 'negative',
  APALLAGI: 'info',
};
const SEX_LABEL: Record<string, string> = { MALE: 'Άνδρας', FEMALE: 'Γυναίκα' };
const GUARDIAN_KIND_LABEL: Record<string, string> = { FATHER: 'Πατέρας', MOTHER: 'Μητέρα', GUARDIAN: 'Κηδεμόνας' };
const LICENSE_META: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ενεργό', color: 'positive' },
  EXPIRED: { label: 'Έληξε', color: 'grey-6' },
  PENDING: { label: 'Σε εκκρεμότητα', color: 'warning' },
};

const initials = computed(() =>
  data.value ? `${data.value.lastName.charAt(0)}${data.value.firstName.charAt(0)}`.toUpperCase() : '',
);
const primaryKlados = computed<KladosType | null>(() => data.value?.memberships[0]?.klados.type ?? null);
const subUnit = computed(() => data.value?.memberships.find((m) => m.subUnit)?.subUnit ?? null);
const isSOS = computed(() => (data.value ? deriveLeaderProfile(data.value.licenses).isSOS : false));

const eseo = computed<Record<string, unknown>>(() => data.value?.eseoPayload ?? {});
const hasEseo = computed(() => !!data.value?.eseoPayload && Object.keys(eseo.value).length > 0);
function bool(key: string): boolean {
  return eseo.value[key] === true;
}
function str(key: string): string {
  const v = eseo.value[key];
  return v === null || v === undefined || v === '' ? '' : String(v);
}
const gdpr = computed(() => bool('gdprConsent'));
const photoSelf = computed(() => bool('photoPermission'));
const photoParent = computed(() => bool('parentPhotoPermission'));
const photo = computed(() => photoSelf.value || photoParent.value);
const syndromiPaid = computed(() => (data.value?.syndromes ?? []).some((s) => s.status === 'PLIROMENI'));
const registryHasAny = computed(
  () =>
    !!(str('registryNumber') || str('socialSecurityNumber') || str('idCardNumber') || str('registrationDate') || str('educationLevel')),
);

const address = computed(() => {
  const d = data.value;
  if (!d) return '';
  const cityLine = [d.postalCode, d.city].filter(Boolean).join(' ');
  return [d.street, cityLine, d.area].filter(Boolean).join(', ');
});

/** Μικρή γραμμή «εικονίδιο + τιμή». */
const InfoRow: FunctionalComponent<{ icon: string; value: string }> = (p) =>
  h(QItem, null, () => [
    h(QItemSection, { avatar: true }, () => h(QIcon, { name: p.icon, color: 'grey-7' })),
    h(QItemSection, null, () => p.value),
  ]);
InfoRow.props = ['icon', 'value'];

/** Γραμμή συναίνεσης: ετικέτα αριστερά, στρογγυλό ✓/✗ δεξιά. */
const ConsentRow: FunctionalComponent<{ label: string; ok: boolean }> = (p) =>
  h(QItem, null, () => [
    h(QItemSection, null, () => h(QItemLabel, null, () => p.label)),
    h(QItemSection, { side: true }, () => h(ConsentMark, { ok: p.ok })),
  ]);
ConsentRow.props = ['label', 'ok'];
</script>

<style scoped>
.member-hero {
  position: relative;
  padding: 20px 20px 16px 56px;
  background: var(--klados-color, var(--q-primary));
  background-image: radial-gradient(circle at 100% 0, rgba(255, 255, 255, 0.22), transparent 55%);
  overflow: hidden;
}
.hero-back {
  position: absolute;
  top: 10px;
  left: 8px;
}
.hero-quick {
  margin-top: 14px;
}
.hero-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.92);
  color: #333;
  border-radius: 999px;
  padding: 4px 12px 4px 8px;
  font-size: 12px;
  font-weight: 600;
}
.section-title {
  font-weight: 600;
  display: flex;
  align-items: center;
}
@media (max-width: 599px) {
  .member-hero {
    padding: 48px 16px 16px;
  }
  .hero-main {
    flex-wrap: wrap;
  }
}
</style>
