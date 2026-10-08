<template>
  <div>
    <!-- Σύνολα + ενέργειες -->
    <div class="tf-toolbar q-mb-sm">
      <div class="text-caption text-grey-7">
        {{ rows.length }} άτομα · {{ counts.melos }} παιδιά · {{ counts.stelexos }} στελέχη
      </div>
      <div class="tf-actions">
      <SegmentedToggle
        v-model="view"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="[
          { label: 'Λίστα', value: 'list' },
          { label: 'Ανά υπεύθυνο', value: 'collectors' },
        ]"
      />
      <q-btn v-if="canWrite && !locked" flat color="klados" icon="euro" label="Κόστη" @click="openCosts">
        <q-tooltip>Προεπιλογές κόστους της δράσης</q-tooltip>
      </q-btn>
      <q-btn
        v-if="canWrite"
        color="klados"
        text-color="klados-on"
        unelevated
        icon="person_add"
        label="Προσθήκη"
        @click="addDialog = true"
      />
      </div>
    </div>

    <div v-if="rows.length" class="row q-col-gutter-sm q-mb-md">
      <div class="col-4"><q-card flat bordered><q-card-section class="q-py-sm"><div class="text-caption text-grey-7">Οφειλόμενα</div><div class="text-subtitle1">{{ formatEuro(totals.due) }}</div></q-card-section></q-card></div>
      <div class="col-4"><q-card flat bordered><q-card-section class="q-py-sm"><div class="text-caption text-grey-7">Εισπραγμένα</div><div class="text-subtitle1 text-positive">{{ formatEuro(totals.paid) }}</div></q-card-section></q-card></div>
      <div class="col-4"><q-card flat bordered><q-card-section class="q-py-sm"><div class="text-caption text-grey-7">Ανείσπρακτα</div><div class="text-subtitle1" :class="totals.balance > 0 ? 'text-negative' : 'text-positive'">{{ formatEuro(totals.balance) }}</div></q-card-section></q-card></div>
    </div>

    <q-inner-loading :showing="loading" />

    <!-- ── Λίστα ── -->
    <template v-if="view === 'list'">
      <div v-if="!loading && !rows.length" class="text-center text-grey-6 q-pa-lg">
        <q-icon name="groups" size="40px" class="block q-mx-auto q-mb-sm" />
        Κανένας συμμετέχων ακόμη.
      </div>
      <q-list v-else bordered separator class="rounded-borders">
        <q-expansion-item v-for="p in rows" :key="p.id" dense expand-icon-class="text-grey-6">
          <template #header>
            <q-item-section avatar>
              <q-avatar size="34px" :style="kladosVars(p.user.kladosType)" :class="p.user.kladosType ? 'bg-klados text-klados-on' : 'bg-grey-4'">
                <q-icon :name="p.kind === 'STELEXOS' ? 'badge' : 'face'" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label>
                {{ p.user.lastName }} {{ p.user.firstName }}
                <q-badge v-if="p.user.guestTopikoName" outline color="grey-7" class="q-ml-xs" :label="p.user.guestTopikoName" />
              </q-item-label>
              <q-item-label caption>
                {{ DRASI_FEE_KIND_LABEL[p.feeKind] }}
                <span v-if="p.feeNote"> ({{ p.feeNote }})</span>
                <span v-if="p.collector"> · εισπράττει: {{ p.collector.lastName }} {{ p.collector.firstName }}</span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center no-wrap q-gutter-xs">
                <div class="text-right">
                  <div class="text-caption text-grey-7">{{ formatEuro(p.paid) }} / {{ formatEuro(p.due) }}</div>
                  <q-badge
                    :color="p.balance <= 0 ? 'positive' : 'warning'"
                    :label="p.balance <= 0 ? 'εξοφλημένο' : `υπόλοιπο ${formatEuro(p.balance)}`"
                  />
                </div>
              </div>
            </q-item-section>
          </template>

          <q-card flat class="bg-grey-1">
            <q-card-section class="q-py-sm">
              <div class="row q-gutter-xs q-mb-sm">
                <q-btn v-if="canWrite && !locked" dense outline color="klados" icon="payments" label="Πληρωμή" @click="openPayment(p)" />
                <q-btn v-if="canWrite && !locked" dense flat color="klados" icon="tune" label="Κόστος & υπεύθυνος" @click="openFees(p)" />
                <q-space />
                <q-btn v-if="canWrite && !locked" dense flat color="negative" icon="person_remove" @click="removeParticipant(p)">
                  <q-tooltip>Αφαίρεση από τη δράση</q-tooltip>
                </q-btn>
              </div>
              <div class="text-caption text-grey-7">
                Συμμετοχή {{ formatEuro(p.fee) }}
                <span v-if="p.transport"> · μεταφορικά {{ formatEuro(p.transport) }}</span>
              </div>
              <div v-if="!p.payments.length" class="text-caption text-grey-6 q-mt-xs">Καμία πληρωμή.</div>
              <q-list v-else dense class="q-mt-xs">
                <q-item v-for="pay in p.payments" :key="pay.id" class="q-px-none">
                  <q-item-section>
                    <q-item-label>
                      {{ formatEuro(pay.amount) }}
                      <span class="text-grey-7">· {{ formatDate(pay.paidAt) }} · {{ pay.method === 'BANK' ? 'κατάθεση' : 'μετρητά' }}</span>
                      <span v-if="pay.collectedBy" class="text-grey-7"> · {{ pay.collectedBy.lastName }} {{ pay.collectedBy.firstName }}</span>
                    </q-item-label>
                    <q-item-label v-if="pay.handlingStatus" caption>
                      <q-breadcrumbs gutter="xs" separator-color="grey-4">
                        <q-breadcrumbs-el v-for="(stage, i) in DRASI_PAYMENT_HANDLING_FLOW" :key="stage">
                          <span :class="i <= stageIndex(pay.handlingStatus) ? 'text-klados text-weight-medium' : 'text-grey-5'">
                            <q-icon v-if="i <= stageIndex(pay.handlingStatus)" name="check" size="12px" />{{ DRASI_PAYMENT_HANDLING_SHORT[stage] }}
                          </span>
                        </q-breadcrumbs-el>
                      </q-breadcrumbs>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row no-wrap items-center">
                      <q-btn
                        v-if="canWrite && !locked && nextStage(pay.handlingStatus)"
                        dense
                        flat
                        size="sm"
                        color="klados"
                        :label="DRASI_PAYMENT_HANDLING_SHORT[nextStage(pay.handlingStatus)!]"
                        icon-right="arrow_forward"
                        @click="advance(pay)"
                      />
                      <q-btn v-if="canWrite && !locked" dense flat round size="sm" icon="delete" color="negative" @click="removePayment(pay)" />
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>
        </q-expansion-item>
      </q-list>
    </template>

    <!-- ── Ανά υπεύθυνο στέλεχος ── -->
    <template v-else>
      <div v-if="!collectors.length" class="text-center text-grey-6 q-pa-lg">Χωρίς δεδομένα ακόμη.</div>
      <div v-else class="row q-col-gutter-md">
        <div v-for="c in collectors" :key="c.collector?.id ?? '-'" class="col-12 col-md-6">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle1 text-weight-medium">
                {{ c.collector ? `${c.collector.lastName} ${c.collector.firstName}` : 'Χωρίς υπεύθυνο' }}
              </div>
              <div class="text-caption text-grey-7">{{ c.participants }} άτομα · οφειλόμενα {{ formatEuro(c.expected) }}</div>
              <div class="row q-col-gutter-sm q-mt-xs">
                <div class="col-4"><div class="text-caption text-grey-7">Εισέπραξε</div><div class="text-positive">{{ formatEuro(c.collected) }}</div></div>
                <div class="col-4"><div class="text-caption text-grey-7">Κρατά</div><div :class="c.holding > 0 ? 'text-orange-8 text-weight-bold' : ''">{{ formatEuro(c.holding) }}</div></div>
                <div class="col-4"><div class="text-caption text-grey-7">Ανείσπρακτα</div><div :class="c.outstanding > 0 ? 'text-negative' : ''">{{ formatEuro(c.outstanding) }}</div></div>
              </div>
            </q-card-section>
            <q-card-actions v-if="canWrite && !locked && c.collector && c.holding > 0" align="right">
              <q-btn flat color="klados" icon="move_down" label="Παραδόθηκαν στο ταμείο" @click="handover(c)" />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </template>

    <AddParticipantsDialog
      v-model="addDialog"
      :drasi-id="drasiId"
      :kladoi="kladoi"
      :guest-topika="guestTopika"
      :existing-ids="rows.map((r) => r.user.id)"
      @added="onAdded"
    />

    <!-- ── Πληρωμή ── -->
    <q-dialog v-model="paymentDialog">
      <q-card style="min-width: min(420px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">
          Πληρωμή — {{ target?.user.lastName }} {{ target?.user.firstName }}
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model.number="payment.amount" type="number" label="Ποσό € *" outlined dense step="0.01" :min="0" color="klados" autofocus />
          <SegmentedToggle
            v-model="payment.method"
            dense
            unelevated
            toggle-color="klados"
            toggle-text-color="klados-on"
            :options="[
              { label: 'Μετρητά', value: 'CASH' },
              { label: 'Κατάθεση', value: 'BANK' },
            ]"
          />
          <DateField v-model="payment.paidAt" label="Ημερομηνία" />
          <StelexosPicker v-model="payment.collectedBy" label="Εισέπραξε" :options="stelexiOptions" />
          <q-input v-model="payment.note" label="Σημείωση" outlined dense color="klados" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Καταχώρηση" :loading="saving" @click="submitPayment" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Προεπιλογές κόστους της δράσης ── -->
    <q-dialog v-model="costsDialog">
      <q-card style="min-width: min(420px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Προεπιλογές κόστους</q-card-section>
        <q-card-section class="text-caption text-grey-7 q-pb-none">
          Ισχύουν για όλους τους συμμετέχοντες, εκτός όσων έχουν δικό τους ποσό.
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model.number="costs.costPerPerson" type="number" label="Πλήρης συμμετοχή €" outlined dense step="0.01" :min="0" color="klados" />
          <q-input v-model.number="costs.costReduced" type="number" label="Μειωμένη συμμετοχή €" outlined dense step="0.01" :min="0" color="klados" />
          <q-input v-model.number="costs.costStelexos" type="number" label="Συμμετοχή στελέχους €" outlined dense step="0.01" :min="0" color="klados" />
          <q-input v-model.number="costs.transportCost" type="number" label="Μεταφορικά ανά άτομο €" outlined dense step="0.01" :min="0" color="klados" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Αποθήκευση" :loading="saving" @click="submitCosts" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Κόστος & υπεύθυνος ── -->
    <q-dialog v-model="feesDialog">
      <q-card style="min-width: min(420px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">
          Κόστος — {{ target?.user.lastName }} {{ target?.user.firstName }}
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-select
            v-model="fees.feeKind"
            :options="feeKindOptions"
            label="Είδος συμμετοχής"
            outlined
            dense
            emit-value
            map-options
            color="klados"
            @update:model-value="fees.feeAmount = null"
          />
          <q-input
            v-model.number="fees.feeAmount"
            type="number"
            label="Ποσό συμμετοχής €"
            outlined
            dense
            step="0.01"
            :min="0"
            color="klados"
            :disable="fees.feeKind === 'DOREAN'"
            :placeholder="defaultFeeFor(fees.feeKind) !== null ? String(defaultFeeFor(fees.feeKind)) : undefined"
            :hint="defaultFeeFor(fees.feeKind) !== null ? `Κενό ⇒ ${formatEuro(defaultFeeFor(fees.feeKind)!)} από τις Ρυθμίσεις της δράσης` : 'Κενό ⇒ από τις Ρυθμίσεις της δράσης (δεν έχει οριστεί ποσό)'"
          />
          <q-input
            v-model.number="fees.transportAmount" type="number" label="Μεταφορικά €" outlined dense step="0.01" :min="0" color="klados"
            :placeholder="costs.transportCost != null ? String(costs.transportCost) : undefined"
            :hint="costs.transportCost != null ? `Κενό ⇒ ${formatEuro(costs.transportCost)} από τις Ρυθμίσεις` : undefined"
          />
          <q-input v-model="fees.feeNote" label="Σημείωση (γιατί μειωμένη/δωρεάν)" outlined dense color="klados" />
          <StelexosPicker v-model="fees.collector" label="Υπεύθυνο στέλεχος είσπραξης" :options="stelexiOptions" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Αποθήκευση" :loading="saving" @click="submitFees" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_FEE_KIND_LABEL,
  DrasiFeeKind,
  DRASI_PAYMENT_HANDLING_FLOW,
  DRASI_PAYMENT_HANDLING_SHORT,
  type DrasiCollectorView,
  type DrasiGuestTopikoView,
  type DrasiParticipantView,
  type DrasiPaymentView,
  type KladosType,
  type MemberSummary,
  type Paginated,
  type PaymentHandlingStatus,
} from '@trifylli/shared';
import DateField from '../DateField.vue';
import StelexosPicker from '../StelexosPicker.vue';
import AddParticipantsDialog from './AddParticipantsDialog.vue';
import { ApiError, del, get, patch, post, put } from '../../lib/api';
import { formatDate, formatEuro, toISODate } from '../../lib/format';
import { kladosVars } from '../../lib/klados-theme';

const props = defineProps<{
  drasiId: string;
  kladoi: KladosType[];
  guestTopika: DrasiGuestTopikoView[];
  canWrite: boolean;
  /** Κλειστή δράση: τα οικονομικά δεν αλλάζουν. */
  locked: boolean;
  /** Οι προεπιλογές κόστους της δράσης (Decimal από το API ⇒ string). */
  costs: {
    costPerPerson: string | number | null;
    costReduced: string | number | null;
    costStelexos: string | number | null;
    transportCost: string | number | null;
  };
}>();
const emit = defineEmits<{ changed: [] }>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const view = ref<'list' | 'collectors'>('list');
const rows = ref<DrasiParticipantView[]>([]);
const collectors = ref<DrasiCollectorView[]>([]);
const addDialog = ref(false);

const counts = computed(() => ({
  melos: rows.value.filter((r) => r.kind === 'MELOS').length,
  stelexos: rows.value.filter((r) => r.kind === 'STELEXOS').length,
}));
const totals = computed(() => ({
  due: rows.value.reduce((s, r) => s + r.due, 0),
  paid: rows.value.reduce((s, r) => s + r.paid, 0),
  balance: rows.value.reduce((s, r) => s + r.balance, 0),
}));

/** Μετά από προσθήκη/αφαίρεση: ο γονέας ξαναμετρά τους συμμετέχοντες. */
async function onAdded(): Promise<void> {
  await reload();
  emit('changed');
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    const [list, byCollector] = await Promise.all([
      get<DrasiParticipantView[]>(`/draseis/${props.drasiId}/participants`),
      get<DrasiCollectorView[]>(`/draseis/${props.drasiId}/collectors`),
    ]);
    rows.value = list;
    collectors.value = byCollector;
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης συμμετεχόντων.');
  } finally {
    loading.value = false;
  }
}

// ── Στελέχη για τους pickers ──
const stelexi = ref<MemberSummary[]>([]);
const stelexiOptions = computed(() =>
  stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })),
);

onMounted(async () => {
  await reload();
  try {
    const page = await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } });
    stelexi.value = page.items;
  } catch {
    // Χωρίς λίστα στελεχών οι pickers μένουν άδειοι — οι πληρωμές γράφονται στον συνδεδεμένο.
  }
});

// ── Πληρωμή ──
const target = ref<DrasiParticipantView | null>(null);
const paymentDialog = ref(false);
const payment = reactive({
  amount: 0,
  method: 'CASH' as 'CASH' | 'BANK',
  paidAt: toISODate(new Date()),
  collectedBy: [] as string[],
  note: '',
});

function openPayment(p: DrasiParticipantView): void {
  target.value = p;
  Object.assign(payment, {
    amount: p.balance > 0 ? p.balance : 0,
    method: 'CASH',
    paidAt: toISODate(new Date()),
    collectedBy: p.collector ? [p.collector.id] : [],
    note: '',
  });
  paymentDialog.value = true;
}

async function submitPayment(): Promise<void> {
  if (!target.value || !payment.amount || payment.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Συμπλήρωσε θετικό ποσό.' });
    return;
  }
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/participants/${target.value.user.id}/payments`, {
      amount: payment.amount,
      method: payment.method,
      paidAt: new Date(`${payment.paidAt}T12:00:00`).toISOString(),
      collectedById: payment.collectedBy[0],
      note: payment.note || undefined,
    });
    paymentDialog.value = false;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία καταχώρησης πληρωμής.');
  } finally {
    saving.value = false;
  }
}

function nextStage(s: PaymentHandlingStatus | null): PaymentHandlingStatus | null {
  if (!s) return null;
  const i = stageIndex(s);
  return i < DRASI_PAYMENT_HANDLING_FLOW.length - 1 ? (DRASI_PAYMENT_HANDLING_FLOW[i + 1] ?? null) : null;
}
/** Παλιές πληρωμές με «κατάθεση/τακτοποίηση» μετρούν ως παραδομένες — η δράση σταματά εκεί. */
function stageIndex(s: PaymentHandlingStatus | null): number {
  if (!s) return -1;
  const i = DRASI_PAYMENT_HANDLING_FLOW.indexOf(s);
  return i >= 0 ? i : DRASI_PAYMENT_HANDLING_FLOW.length - 1;
}

async function advance(pay: DrasiPaymentView): Promise<void> {
  const next = nextStage(pay.handlingStatus);
  if (!next) return;
  try {
    await put(`/draseis/${props.drasiId}/payments/${pay.id}/handling`, { handlingStatus: next });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

function removePayment(pay: DrasiPaymentView): void {
  $q.dialog({
    title: 'Διαγραφή πληρωμής',
    message: `Να διαγραφεί η πληρωμή ${formatEuro(pay.amount)};`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/payments/${pay.id}`);
      await reload();
    } catch (err) {
      notifyError(err, 'Αποτυχία διαγραφής.');
    }
  });
}

async function handover(c: DrasiCollectorView): Promise<void> {
  if (!c.collector) return;
  try {
    const r = await post<{ updated: number }>(`/draseis/${props.drasiId}/payments/handover`, { collectorId: c.collector.id });
    $q.notify({ type: 'positive', message: `${r.updated} πληρωμές πέρασαν σε «παραδόθηκε».` });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Προεπιλογές κόστους της δράσης ──
const costsDialog = ref(false);
const costs = reactive({
  costPerPerson: null as number | null,
  costReduced: null as number | null,
  costStelexos: null as number | null,
  transportCost: null as number | null,
});
const toNum = (v: string | number | null): number | null => (v === null || v === '' ? null : Number(v));
function openCosts(): void {
  Object.assign(costs, {
    costPerPerson: toNum(props.costs.costPerPerson),
    costReduced: toNum(props.costs.costReduced),
    costStelexos: toNum(props.costs.costStelexos),
    transportCost: toNum(props.costs.transportCost),
  });
  costsDialog.value = true;
}
async function submitCosts(): Promise<void> {
  saving.value = true;
  try {
    const clean = (v: number | null) => (v === null || (v as unknown) === '' ? undefined : v);
    await patch(`/draseis/${props.drasiId}`, {
      costPerPerson: clean(costs.costPerPerson),
      costReduced: clean(costs.costReduced),
      costStelexos: clean(costs.costStelexos),
      transportCost: clean(costs.transportCost),
    });
    costsDialog.value = false;
    emit('changed');
    $q.notify({ type: 'positive', message: 'Οι προεπιλογές αποθηκεύτηκαν.' });
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    saving.value = false;
  }
}

// ── Κόστος & υπεύθυνος ──
const feesDialog = ref(false);
const feeKindOptions = (Object.keys(DrasiFeeKind) as DrasiFeeKind[]).map((k) => ({ label: DRASI_FEE_KIND_LABEL[k], value: k }));
const fees = reactive({
  feeKind: 'PLIRIS' as DrasiFeeKind,
  feeAmount: null as number | null,
  transportAmount: null as number | null,
  feeNote: '',
  collector: [] as string[],
});

/** Η προεπιλογή των Ρυθμίσεων ανά είδος — ό,τι ισχύει όταν το ποσό μείνει κενό. */
function defaultFeeFor(kind: DrasiFeeKind): number | null {
  if (kind === 'DOREAN') return 0;
  if (kind === 'MEIOMENI') return costs.costReduced ?? costs.costPerPerson;
  if (kind === 'STELEXOS') return costs.costStelexos;
  return costs.costPerPerson;
}

function openFees(p: DrasiParticipantView): void {
  target.value = p;
  Object.assign(fees, {
    feeKind: p.feeKind,
    feeAmount: p.feeAmount,
    transportAmount: p.transportAmount,
    feeNote: p.feeNote ?? '',
    collector: p.collector ? [p.collector.id] : [],
  });
  feesDialog.value = true;
}

async function submitFees(): Promise<void> {
  if (!target.value) return;
  saving.value = true;
  try {
    await patch(`/draseis/${props.drasiId}/participants/${target.value.user.id}/fees`, {
      feeKind: fees.feeKind,
      ...(fees.feeAmount !== null && fees.feeAmount !== ('' as unknown) ? { feeAmount: fees.feeAmount } : {}),
      transportAmount: fees.transportAmount === ('' as unknown) ? null : fees.transportAmount,
      feeNote: fees.feeNote || null,
      collectorId: fees.collector[0] ?? null,
    });
    feesDialog.value = false;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    saving.value = false;
  }
}

function removeParticipant(p: DrasiParticipantView): void {
  $q.dialog({
    title: 'Αφαίρεση από τη δράση',
    message: `${p.user.lastName} ${p.user.firstName}: θα αφαιρεθεί μαζί με τις πληρωμές που έχουν καταγραφεί. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Αφαίρεση', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/participants/${p.user.id}`);
      await reload();
      emit('changed');
    } catch (err) {
      notifyError(err, 'Αποτυχία.');
    }
  });
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}

defineExpose({ reload });
</script>
