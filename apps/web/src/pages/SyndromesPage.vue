<template>
  <q-page padding>
    <div class="page-title q-mb-md">Συνδρομές</div>

    <q-tabs v-model="tab" dense align="left" class="text-klados q-mb-md" narrow-indicator active-color="klados">
      <q-tab name="report" label="Εικόνα" />
      <q-tab name="members" label="Εισπράξεις" />
      <q-tab name="cash" label="Μετρητά" />
      <q-tab name="debtors" label="Οφειλέτες" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated keep-alive>
      <!-- ═══════════ Εικόνα ═══════════ -->
      <q-tab-panel name="report" class="q-pa-none">
        <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
          <template v-if="report">
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="row items-center justify-between">
                  <div>
                    <div class="text-caption text-grey-7">Περίοδος {{ report.period.label }}</div>
                    <div class="text-h5">
                      <span class="text-positive">{{ formatEuro(report.totals.paid) }}</span>
                      <span class="text-grey-6 text-h6"> / {{ formatEuro(report.totals.due) }}</span>
                    </div>
                  </div>
                  <q-circular-progress
                    :value="report.totals.collectedPct"
                    size="64px"
                    :thickness="0.18"
                    color="klados"
                    track-color="grey-3"
                    show-value
                  >
                    <span class="text-caption text-weight-bold">{{ report.totals.collectedPct }}%</span>
                  </q-circular-progress>
                </div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  Εκκρεμεί {{ formatEuro(report.totals.pending) }} · {{ report.totals.debtors }} οφειλέτες από {{ report.totals.members }} μέλη
                </div>
              </q-card-section>
            </q-card>

            <div class="row q-col-gutter-md">
              <div v-for="k in report.perKlados" :key="k.label" class="col-12 col-md-6">
                <q-card flat bordered>
                  <q-card-section class="q-pb-xs">
                    <div class="row items-center justify-between">
                      <div class="text-subtitle2 text-weight-medium">
                        <q-icon name="circle" size="10px" :style="{ color: kladosColor(k.kladosType) }" class="q-mr-xs" />
                        {{ k.label }}
                      </div>
                      <div class="text-weight-bold">{{ k.collectedPct }}%</div>
                    </div>
                  </q-card-section>
                  <q-card-section class="q-pt-none">
                    <q-linear-progress
                      :value="k.collectedPct / 100"
                      size="14px"
                      :color="pctColor(k.collectedPct)"
                      track-color="grey-3"
                      rounded
                    />
                    <div class="row justify-between text-caption q-mt-xs">
                      <span class="text-positive">{{ formatEuro(k.paid) }} εισπράχθηκαν</span>
                      <span class="text-negative">{{ formatEuro(k.pending) }} εκκρεμούν</span>
                    </div>
                    <div class="text-caption text-grey-6">{{ k.members }} μέλη · {{ k.debtors }} οφειλέτες</div>
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </template>
        </PageState>
      </q-tab-panel>

      <!-- ═══════════ Εισπράξεις ═══════════ -->
      <q-tab-panel name="members" class="q-pa-none">
        <div class="row q-col-gutter-sm q-mb-sm items-center">
          <div class="col">
            <q-input v-model="memberSearch" dense outlined clearable debounce="200" placeholder="Αναζήτηση μέλους" />
          </div>
          <q-toggle v-model="onlyOwing" label="Μόνο με υπόλοιπο" />
        </div>
        <PageState :loading="membersLoading" :empty="!filteredMembers.length" empty-text="Καμία συνδρομή." empty-icon="payments">
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="m in filteredMembers" :key="m.syndromiId">
              <q-item-section>
                <q-item-label>{{ m.name }}</q-item-label>
                <q-item-label caption>
                  <span v-if="m.kladosType">{{ KLADOS_LABEL[m.kladosType] }} · </span>
                  {{ formatEuro(m.amountPaid) }} / {{ formatEuro(m.amountDue) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center no-wrap q-gutter-sm">
                  <q-chip dense square :color="statusColor(m.status)" text-color="white" class="text-caption">
                    {{ STATUS_LABEL[m.status] ?? m.status }}
                  </q-chip>
                  <q-btn
                    v-if="canManage && m.status !== 'APALLAGI'"
                    dense no-caps color="klados" text-color="klados-on"
                    icon="add_card" label="Είσπραξη" @click="openPayment(m)"
                  />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </PageState>
      </q-tab-panel>

      <!-- ═══════════ Μετρητά ═══════════ -->
      <q-tab-panel name="cash" class="q-pa-none">
        <PageState :loading="cashLoading" :empty="cash !== null && !cash.items.length" empty-text="Καμία είσπραξη μετρητών." empty-icon="payments">
          <template v-if="cash">
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="q-pb-xs text-subtitle2 text-weight-medium">Πορεία μετρητών</q-card-section>
              <q-card-section class="q-pt-none">
                <div v-for="s in cash.byStage" :key="s.stage" class="q-mb-sm">
                  <div class="row justify-between text-caption">
                    <span>{{ PAYMENT_HANDLING_LABEL[s.stage] }}</span>
                    <span>{{ s.count }} · {{ formatEuro(s.amount) }}</span>
                  </div>
                  <q-linear-progress
                    :value="cashTotal > 0 ? s.amount / cashTotal : 0"
                    size="12px" color="klados" track-color="grey-3" rounded class="q-mt-xs"
                  />
                </div>
              </q-card-section>
            </q-card>

            <q-list bordered separator class="rounded-borders">
              <q-item v-for="p in cash.items" :key="p.paymentId">
                <q-item-section>
                  <q-item-label>{{ p.memberName }} · {{ formatEuro(p.amount) }}</q-item-label>
                  <q-item-label caption>
                    <span v-if="p.kladosType">{{ KLADOS_LABEL[p.kladosType] }} · </span>
                    {{ formatDate(p.paidAt) }}
                    <span v-if="p.collectedBy"> · από {{ p.collectedBy }}</span>
                  </q-item-label>
                  <!-- Πορεία πληρωμής: ποια στάδια έχουν γίνει, με τη σειρά. -->
                  <q-breadcrumbs class="cash-flow q-mt-xs" gutter="xs" separator-color="grey-4">
                    <q-breadcrumbs-el v-for="(stage, i) in PAYMENT_HANDLING_FLOW" :key="stage">
                      <span :class="i <= stageIndex(p.handlingStatus) ? 'text-klados text-weight-medium' : 'text-grey-5'">
                        <q-icon v-if="i <= stageIndex(p.handlingStatus)" name="check" size="13px" class="q-mr-xs" />{{ PAYMENT_HANDLING_SHORT[stage] }}
                      </span>
                    </q-breadcrumbs-el>
                  </q-breadcrumbs>
                </q-item-section>
                <q-item-section side top>
                  <q-btn
                    v-if="canAdvance(p)"
                    dense flat no-caps color="klados" icon="arrow_forward"
                    :label="PAYMENT_HANDLING_SHORT[nextStage(p.handlingStatus)!]"
                    @click="advance(p)"
                  />
                  <div v-else-if="waitsForEforos(p)" class="text-caption text-grey-6 text-right" style="max-width: 110px">
                    <q-icon name="hourglass_empty" size="14px" /> Αναμονή Εφόρου
                  </div>
                  <div v-else-if="!nextStage(p.handlingStatus)" class="text-caption text-positive row items-center no-wrap">
                    <q-icon name="check_circle" size="16px" class="q-mr-xs" /> Ολοκληρώθηκε
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </template>
        </PageState>
      </q-tab-panel>

      <!-- ═══════════ Οφειλέτες ═══════════ -->
      <q-tab-panel name="debtors" class="q-pa-none">
        <PageState :loading="debtorsLoading" :empty="!debtors.length" empty-text="Κανένας οφειλέτης." empty-icon="celebration">
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="d in debtors" :key="d.syndromiId" clickable :to="{ name: 'melos', params: { id: d.memberId } }">
              <q-item-section>
                <q-item-label>{{ d.name }}</q-item-label>
                <q-item-label caption>
                  <span v-if="d.kladosType">{{ KLADOS_LABEL[d.kladosType] }}</span>
                  <span v-if="d.phone"> · {{ d.phone }}</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="text-right">
                  <div class="text-negative text-weight-bold">{{ formatEuro(d.balance) }}</div>
                  <div class="text-caption text-grey-7">{{ formatEuro(d.amountPaid) }} / {{ formatEuro(d.amountDue) }}</div>
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </PageState>
      </q-tab-panel>
    </q-tab-panels>

    <!-- ── Είσπραξη ── -->
    <q-dialog v-model="paymentDialog">
      <q-card style="min-width: min(440px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium">Είσπραξη — {{ selected?.name }}</q-card-section>
        <q-card-section class="q-gutter-md">
          <div class="row items-start form-row">
            <q-input class="col" v-model.number="pay.amount" type="number" label="Ποσό € *" outlined dense :min="0" step="0.01" color="klados" />
            <q-select class="col" v-model="pay.method" :options="methodOptions" label="Τρόπος *" outlined dense emit-value map-options color="klados" />
          </div>
          <DateField v-model="pay.paidAt" label="Ημερομηνία" />
          <q-input v-model="pay.note" label="Σημείωση" outlined dense color="klados" />

          <q-separator />
          <q-toggle v-model="pay.hasDonation" label="Προστέθηκε δωρεά" color="klados" />
          <template v-if="pay.hasDonation">
            <div class="row items-start form-row">
              <q-input class="col" v-model.number="pay.donationAmount" type="number" label="Ποσό δωρεάς €" outlined dense :min="0" step="0.01" color="klados" />
              <q-select class="col" v-model="pay.donorType" :options="donorOptions" label="Από" outlined dense emit-value map-options color="klados" />
            </div>
            <q-input v-model="pay.donationNote" label="Σημείωση δωρεάς (τι & πώς)" outlined dense color="klados" />
            <div class="text-caption text-grey-7">Η δωρεά μπαίνει ως έσοδο στο ταμείο του κλάδου.</div>
          </template>
        </q-card-section>
        <q-card-section v-if="payError" class="bg-red-1 text-negative">{{ payError }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Καταχώρηση" :loading="paySaving" @click="submitPayment" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DONOR_TYPE_LABEL,
  DonorType,
  KLADOS_LABEL,
  KLADOS_META,
  PAYMENT_HANDLING_FLOW,
  PAYMENT_HANDLING_KLADOS_STAGES,
  PAYMENT_HANDLING_LABEL,
  PAYMENT_HANDLING_SHORT,
  PAYMENT_METHOD_LABEL,
  PaymentMethod,
  type KladosType,
  type PaymentHandlingStatus,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { useKladosScope } from '../composables/useKladosScope';
import { ApiError, get, post, put } from '../lib/api';
import { formatDate, formatEuro, toISODate } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import DateField from '../components/DateField.vue';

const $q = useQuasar();
const auth = useAuthStore();
const { klados } = useKladosScope();
const canManage = computed(() => (klados.value ? auth.can('syndromes:manage', klados.value) : auth.isSuperAdmin));
const scopeParams = computed(() => (klados.value ? { klados: klados.value } : {}));

const STATUS_LABEL: Record<string, string> = {
  PLIROMENI: 'Πληρωμένη',
  MERIKI: 'Μερική',
  EKKREMI: 'Εκκρεμεί',
  APALLAGI: 'Απαλλαγή',
};
function statusColor(s: string): string {
  return { PLIROMENI: 'positive', MERIKI: 'warning', EKKREMI: 'grey-6', APALLAGI: 'info' }[s] ?? 'grey-6';
}
function pctColor(pct: number): string {
  return pct >= 70 ? 'positive' : pct >= 40 ? 'warning' : 'negative';
}
function kladosColor(k: KladosType | null): string {
  return k ? KLADOS_META[k].color : '#94a3b8';
}

const tab = ref('report');
const methodOptions = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((v) => ({ value: v, label: PAYMENT_METHOD_LABEL[v] }));
const donorOptions = (Object.keys(DONOR_TYPE_LABEL) as DonorType[]).map((v) => ({ value: v, label: DONOR_TYPE_LABEL[v] }));

// ── Εικόνα ──
interface Report {
  period: { id: string; label: string; amount: number };
  perKlados: { kladosType: KladosType | null; label: string; members: number; due: number; paid: number; pending: number; debtors: number; collectedPct: number }[];
  totals: { due: number; paid: number; pending: number; members: number; debtors: number; collectedPct: number };
}
const { data: report, loading, error, stale, reload } = useAsyncData(
  () => get<Report>('/syndromes/report', { params: scopeParams.value }),
  { cacheKey: 'syndromes:report', watchSources: [klados] },
);

// ── Εισπράξεις ──
interface Member {
  syndromiId: string;
  memberId: string;
  name: string;
  kladosType: KladosType | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
}
const members = ref<Member[]>([]);
const membersLoading = ref(false);
const memberSearch = ref('');
const onlyOwing = ref(false);
const filteredMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase();
  return members.value.filter(
    (m) => (!onlyOwing.value || m.balance > 0) && (!q || m.name.toLowerCase().includes(q)),
  );
});
async function loadMembers(): Promise<void> {
  membersLoading.value = true;
  try {
    const res = await get<{ members: Member[] }>('/syndromes/members', { params: scopeParams.value });
    members.value = res.members;
  } catch {
    members.value = [];
  } finally {
    membersLoading.value = false;
  }
}

// ── Μετρητά ──
interface Cash {
  period: { id: string; label: string };
  items: { paymentId: string; memberName: string; kladosType: KladosType | null; amount: number; paidAt: string; handlingStatus: PaymentHandlingStatus; collectedBy: string | null }[];
  byStage: { stage: PaymentHandlingStatus; count: number; amount: number }[];
}
const cash = ref<Cash | null>(null);
const cashLoading = ref(false);
const cashTotal = computed(() => cash.value?.items.reduce((s, i) => s + i.amount, 0) ?? 0);
async function loadCash(): Promise<void> {
  cashLoading.value = true;
  try {
    cash.value = await get<Cash>('/syndromes/cash', { params: scopeParams.value });
  } catch {
    cash.value = null;
  } finally {
    cashLoading.value = false;
  }
}
function nextStage(s: PaymentHandlingStatus): PaymentHandlingStatus | null {
  const i = PAYMENT_HANDLING_FLOW.indexOf(s);
  return i >= 0 && i < PAYMENT_HANDLING_FLOW.length - 1 ? (PAYMENT_HANDLING_FLOW[i + 1] ?? null) : null;
}
/** Θέση σταδίου στη ροή — για το breadcrumbs (τι έχει γίνει). */
function stageIndex(s: PaymentHandlingStatus): number {
  return PAYMENT_HANDLING_FLOW.indexOf(s);
}
/**
 * Μπορεί ο τρέχων χρήστης να προχωρήσει την πληρωμή στο επόμενο στάδιο; Ο κλάδος
 * μόνο μέχρι την παράδοση στον Έφορο· τα επόμενα μόνο ο Έφορος (υπερδιαχειριστής).
 */
function canAdvance(p: Cash['items'][number]): boolean {
  if (!canManage.value) return false;
  const next = nextStage(p.handlingStatus);
  if (!next) return false;
  return auth.isSuperAdmin || PAYMENT_HANDLING_KLADOS_STAGES.includes(next);
}
/** Ο κλάδος περιμένει τον Έφορο (έφτασε στο όριό του, υπάρχει κι άλλο στάδιο). */
function waitsForEforos(p: Cash['items'][number]): boolean {
  const next = nextStage(p.handlingStatus);
  return !!next && !auth.isSuperAdmin && !PAYMENT_HANDLING_KLADOS_STAGES.includes(next);
}
async function advance(p: Cash['items'][number]): Promise<void> {
  const next = nextStage(p.handlingStatus);
  if (!next) return;
  try {
    await put(`/syndromes/payments/${p.paymentId}/handling`, { handlingStatus: next });
    await loadCash();
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
  }
}

// ── Οφειλέτες ──
interface Debtor {
  syndromiId: string;
  memberId: string;
  name: string;
  phone: string | null;
  kladosType: KladosType | null;
  amountDue: number;
  amountPaid: number;
  balance: number;
}
const debtors = ref<Debtor[]>([]);
const debtorsLoading = ref(false);
async function loadDebtors(): Promise<void> {
  debtorsLoading.value = true;
  try {
    debtors.value = await get<Debtor[]>('/syndromes/debtors', { params: scopeParams.value });
  } catch {
    debtors.value = [];
  } finally {
    debtorsLoading.value = false;
  }
}

// Φόρτωση ανά tab (και όταν αλλάζει ο κλάδος).
watch([tab, klados], ([t]) => {
  if (t === 'members') void loadMembers();
  else if (t === 'cash') void loadCash();
  else if (t === 'debtors') void loadDebtors();
}, { immediate: true });

// ── Είσπραξη (dialog) ──
const paymentDialog = ref(false);
const paySaving = ref(false);
const payError = ref<string | null>(null);
const selected = ref<Member | null>(null);
const pay = ref({
  amount: 0,
  method: 'CASH' as PaymentMethod,
  paidAt: toISODate(new Date()),
  note: '',
  hasDonation: false,
  donationAmount: 0,
  donorType: 'GONEAS' as DonorType,
  donationNote: '',
});

function openPayment(m: Member): void {
  selected.value = m;
  payError.value = null;
  pay.value = {
    amount: m.balance > 0 ? m.balance : m.amountDue,
    method: 'CASH',
    paidAt: toISODate(new Date()),
    note: '',
    hasDonation: false,
    donationAmount: 0,
    donorType: 'GONEAS',
    donationNote: '',
  };
  paymentDialog.value = true;
}

async function submitPayment(): Promise<void> {
  if (!selected.value) return;
  if (!pay.value.amount || pay.value.amount <= 0) {
    payError.value = 'Συμπλήρωσε θετικό ποσό.';
    return;
  }
  if (pay.value.hasDonation && (!pay.value.donationAmount || pay.value.donationAmount <= 0)) {
    payError.value = 'Συμπλήρωσε ποσό δωρεάς ή απενεργοποίησε τη δωρεά.';
    return;
  }
  paySaving.value = true;
  payError.value = null;
  try {
    await post(`/syndromes/${selected.value.syndromiId}/payments`, {
      amount: pay.value.amount,
      method: pay.value.method,
      paidAt: new Date(`${pay.value.paidAt}T12:00:00`).toISOString(),
      note: pay.value.note || undefined,
      ...(pay.value.hasDonation
        ? { donationAmount: pay.value.donationAmount, donorType: pay.value.donorType, donationNote: pay.value.donationNote || undefined }
        : {}),
    });
    paymentDialog.value = false;
    await Promise.all([loadMembers(), reload()]);
    $q.notify({ type: 'positive', message: 'Η είσπραξη καταχωρήθηκε.' });
  } catch (err) {
    payError.value = err instanceof ApiError ? err.message : 'Αποτυχία καταχώρησης.';
  } finally {
    paySaving.value = false;
  }
}
</script>

<style scoped>
.form-row {
  gap: 12px;
}

/* Breadcrumbs πορείας μετρητών: μικρό, διακριτικό, να χωρά σε μία γραμμή. */
.cash-flow {
  font-size: 0.72rem;
  line-height: 1.2;
}
.cash-flow :deep(.q-breadcrumbs__separator) {
  margin: 0 2px;
}
</style>
