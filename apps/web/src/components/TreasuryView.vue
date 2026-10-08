<template>
  <div>
    <!-- Σύνοψη -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">Υπόλοιπο</div>
            <div class="text-h5" :class="(summary?.balance ?? 0) < 0 ? 'text-negative' : 'text-klados'">
              {{ formatEuro(summary?.balance ?? 0) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">Έσοδα</div>
            <div class="text-h6 text-positive">{{ formatEuro(summary?.income ?? 0) }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">Έξοδα</div>
            <div class="text-h6 text-negative">{{ formatEuro(summary?.expense ?? 0) }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Ανά κατηγορία -->
    <q-card v-if="summary?.byCategory.length" flat bordered class="q-mb-md">
      <q-card-section class="q-pb-xs text-subtitle2 text-weight-medium">Ανά κατηγορία</q-card-section>
      <q-card-section class="q-pt-none">
        <div v-for="c in summary.byCategory" :key="c.kind + c.category" class="q-mb-sm">
          <div class="row items-center justify-between text-caption">
            <span>
              <q-icon :name="c.kind === 'INCOME' ? 'south_west' : 'north_east'" :color="c.kind === 'INCOME' ? 'positive' : 'negative'" size="14px" />
              {{ TREASURY_CATEGORY_LABEL[c.category] ?? c.category }}
            </span>
            <span :class="c.kind === 'INCOME' ? 'text-positive' : 'text-negative'">{{ formatEuro(c.amount) }}</span>
          </div>
          <q-linear-progress
            :value="maxCategory > 0 ? c.amount / maxCategory : 0"
            :color="c.kind === 'INCOME' ? 'positive' : 'negative'"
            track-color="grey-3"
            size="6px"
            class="q-mt-xs rounded-borders"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Ενέργειες + φίλτρα — σε μία γραμμή και στο κινητό. -->
    <div class="row items-center no-wrap justify-between q-mb-sm" style="gap: 8px">
      <SegmentedToggle
        v-model="filters.kind"
        :options="[
          { label: 'Όλα', value: '' },
          { label: 'Έσοδα', value: 'INCOME' },
          { label: 'Έξοδα', value: 'EXPENSE' },
        ]"
        toggle-color="klados"
        toggle-text-color="klados-on"
        no-caps
        dense
        unelevated
        class="bordered-toggle"
      />
      <!-- Στο κινητό: δύο μικρά στρογγυλά + / −, δίπλα στο φίλτρο. -->
      <div v-if="canManage" class="row no-wrap q-gutter-sm">
        <q-btn
          color="positive" no-caps icon="add" :round="$q.screen.lt.sm" :dense="$q.screen.lt.sm"
          :label="$q.screen.lt.sm ? undefined : 'Έσοδο'" aria-label="Νέο έσοδο" @click="openEntry('INCOME')"
        >
          <q-tooltip v-if="$q.screen.lt.sm">Νέο έσοδο</q-tooltip>
        </q-btn>
        <q-btn
          color="negative" no-caps icon="remove" :round="$q.screen.lt.sm" :dense="$q.screen.lt.sm"
          :label="$q.screen.lt.sm ? undefined : 'Έξοδο'" aria-label="Νέο έξοδο" @click="openEntry('EXPENSE')"
        >
          <q-tooltip v-if="$q.screen.lt.sm">Νέο έξοδο</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-inner-loading :showing="loading" />

    <q-list v-if="entries.length" bordered separator class="rounded-borders">
      <q-item v-for="e in entries" :key="e.id">
        <q-item-section avatar>
          <q-avatar :color="e.kind === 'INCOME' ? 'positive' : 'negative'" text-color="white" size="34px">
            <q-icon :name="e.kind === 'INCOME' ? 'south_west' : 'north_east'" />
          </q-avatar>
        </q-item-section>
        <q-item-section>
          <q-item-label>
            {{ TREASURY_CATEGORY_LABEL[e.category] ?? e.category }}
            <span v-if="e.description" class="text-grey-8">— {{ e.description }}</span>
          </q-item-label>
          <q-item-label caption>
            {{ formatDate(e.occurredAt) }}
            <span v-if="e.donorType"> · δωρεά ({{ DONOR_TYPE_LABEL[e.donorType] ?? e.donorType }})</span>
            <span v-if="e.createdBy"> · {{ e.createdBy.lastName }} {{ e.createdBy.firstName }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row items-center no-wrap">
            <q-btn
              v-if="e.receipt"
              flat dense round icon="receipt_long" color="klados"
              :loading="receiptLoading === e.receipt.id"
              @click="viewReceipt(e)"
            >
              <q-tooltip>Απόδειξη</q-tooltip>
            </q-btn>
            <div class="text-weight-bold q-mx-sm" :class="e.kind === 'INCOME' ? 'text-positive' : 'text-negative'">
              {{ e.kind === 'INCOME' ? '+' : '−' }}{{ formatEuro(e.amount) }}
            </div>
            <q-btn v-if="canManage" flat dense round icon="delete" color="negative" size="sm" @click="removeEntry(e)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>
    <div v-else-if="!loading" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="account_balance_wallet" size="40px" class="q-mb-sm block" />
      Καμία κίνηση ακόμη.
    </div>

    <!-- ── Νέα κίνηση ── -->
    <!-- `persistent` όταν έχει ανέβει απόδειξη: μια κατά λάθος κλικ έξω δεν
         πρέπει να χάνει το αρχείο που μόλις ανέβηκε. -->
    <q-dialog v-model="entryDialog" :persistent="!!form.file">
      <q-card style="min-width: min(440px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">
          {{ form.kind === 'INCOME' ? 'Νέο έσοδο' : 'Νέο έξοδο' }}
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <div class="row items-start form-row">
            <q-select class="col" v-model="form.category" :options="categoryOptions" label="Κατηγορία *" outlined dense emit-value map-options color="klados" />
            <q-input class="col" v-model.number="form.amount" type="number" label="Ποσό € *" outlined dense :min="0" step="0.01" color="klados" />
          </div>
          <DateField v-model="form.occurredAt" label="Ημερομηνία" />
          <q-select
            v-if="form.kind === 'INCOME' && form.category === 'DOREA'"
            v-model="form.donorType"
            :options="donorOptions"
            label="Από"
            outlined dense emit-value map-options clearable color="klados"
          />
          <q-input v-model="form.description" label="Περιγραφή" outlined dense type="textarea" autogrow color="klados" />
          <q-file
            v-model="form.file"
            label="Απόδειξη (εικόνα ή PDF)"
            outlined dense clearable
            accept="image/*,application/pdf"
            :max-file-size="MAX_RECEIPT_BYTES"
            color="klados"
          >
            <template #prepend><q-icon name="attach_file" /></template>
          </q-file>
        </q-card-section>
        <q-card-section v-if="formError" class="bg-red-1 text-negative">{{ formError }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Καταχώρηση" :loading="saving" @click="submitEntry" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Προβολή απόδειξης ── -->
    <q-dialog v-model="receiptDialog" @hide="closeReceipt">
      <q-card style="min-width: min(560px, 94vw)">
        <q-card-section class="row items-center no-wrap q-pb-none">
          <q-icon name="receipt_long" class="q-mr-sm" :style="{ color: 'var(--klados-ink, var(--q-primary))' }" />
          <div class="text-subtitle1 text-weight-medium ellipsis">{{ receiptName }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="text-center">
          <img
            v-if="receiptIsImage"
            :src="receiptUrl"
            alt="Απόδειξη"
            style="max-width: 100%; max-height: 68vh; border-radius: 8px"
          />
          <iframe
            v-else-if="receiptIsPdf"
            :src="receiptUrl"
            title="Απόδειξη"
            style="width: 100%; height: 68vh; border: none; border-radius: 8px"
          />
          <div v-else class="q-pa-lg text-grey-7">
            <q-icon name="description" size="48px" class="block q-mx-auto q-mb-sm" />
            Δεν υπάρχει προεπισκόπηση — κατέβασέ το για να το δεις.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Κλείσιμο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" no-caps icon="download" label="Λήψη" @click="downloadReceipt" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DONOR_TYPE_LABEL,
  DonorType,
  MAX_RECEIPT_BYTES,
  TREASURY_CATEGORY_LABEL,
  TREASURY_EXPENSE_CATEGORIES,
  TREASURY_INCOME_CATEGORIES,
  type KladosType,
  type TreasuryEntryView,
  type TreasurySummary,
} from '@trifylli/shared';
import { ApiError, del, get, getBlob, post, upload } from '../lib/api';
import { formatDate, formatEuro, toISODate } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import DateField from './DateField.vue';

const props = defineProps<{ klados: KladosType | null }>();

const $q = useQuasar();
const auth = useAuthStore();
const canManage = computed(() =>
  props.klados ? auth.can('treasury:manage', props.klados) : auth.isSuperAdmin,
);

const summary = ref<TreasurySummary | null>(null);
const entries = ref<TreasuryEntryView[]>([]);
const loading = ref(false);
const filters = reactive({ kind: '' as '' | 'INCOME' | 'EXPENSE' });

const maxCategory = computed(() => Math.max(0, ...(summary.value?.byCategory.map((c) => c.amount) ?? [0])));

const scopeParams = computed(() => (props.klados ? { klados: props.klados } : {}));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [s, list] = await Promise.all([
      get<TreasurySummary>('/treasury/summary', { params: scopeParams.value }),
      get<TreasuryEntryView[]>('/treasury', {
        params: { ...scopeParams.value, ...(filters.kind ? { kind: filters.kind } : {}) },
      }),
    ]);
    summary.value = s;
    entries.value = list;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης.' });
  } finally {
    loading.value = false;
  }
}
watch(() => [props.klados, filters.kind], load, { immediate: true });

// ── Κατηγορίες / δωρητής ──
const categoryOptions = computed(() => {
  const cats = form.kind === 'INCOME' ? TREASURY_INCOME_CATEGORIES : TREASURY_EXPENSE_CATEGORIES;
  return cats.map((c) => ({ value: c, label: TREASURY_CATEGORY_LABEL[c] ?? c }));
});
const donorOptions = (Object.keys(DONOR_TYPE_LABEL) as DonorType[]).map((v) => ({ value: v, label: DONOR_TYPE_LABEL[v] }));

// ── Νέα κίνηση ──
const entryDialog = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const form = reactive({
  kind: 'INCOME' as 'INCOME' | 'EXPENSE',
  category: 'ALLO' as string,
  amount: 0,
  occurredAt: toISODate(new Date()),
  description: '',
  donorType: null as DonorType | null,
  file: null as File | null,
});

function openEntry(kind: 'INCOME' | 'EXPENSE'): void {
  formError.value = null;
  Object.assign(form, {
    kind,
    category: (kind === 'INCOME' ? TREASURY_INCOME_CATEGORIES : TREASURY_EXPENSE_CATEGORIES)[0],
    amount: 0,
    occurredAt: toISODate(new Date()),
    description: '',
    donorType: null,
    file: null,
  });
  entryDialog.value = true;
}

async function submitEntry(): Promise<void> {
  if (!form.amount || form.amount <= 0) {
    formError.value = 'Συμπλήρωσε θετικό ποσό.';
    return;
  }
  saving.value = true;
  formError.value = null;
  try {
    let receiptFileId: string | undefined;
    if (form.file) {
      const ref = await upload<{ id: string }>('/files', form.file, {
        purpose: 'RECEIPT',
        ...(props.klados ? { kladosType: props.klados } : {}),
      });
      receiptFileId = ref.id;
    }
    await post('/treasury', {
      kind: form.kind,
      category: form.category,
      amount: form.amount,
      occurredAt: new Date(`${form.occurredAt}T12:00:00`).toISOString(),
      description: form.description || undefined,
      donorType: form.kind === 'INCOME' && form.category === 'DOREA' ? form.donorType ?? undefined : undefined,
      receiptFileId,
      ...(props.klados ? { kladosType: props.klados } : {}),
    });
    entryDialog.value = false;
    await load();
    $q.notify({ type: 'positive', message: 'Η κίνηση καταχωρήθηκε.' });
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : 'Αποτυχία καταχώρησης.';
  } finally {
    saving.value = false;
  }
}

function removeEntry(e: TreasuryEntryView): void {
  $q.dialog({
    title: 'Διαγραφή κίνησης',
    message: `Να διαγραφεί «${TREASURY_CATEGORY_LABEL[e.category] ?? e.category}» ${formatEuro(e.amount)};`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/treasury/${e.id}`);
      await load();
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
    }
  });
}

// ── Προβολή απόδειξης (κάρτα με λήψη + κλείσιμο) ──
const receiptLoading = ref<string | null>(null);
const receiptDialog = ref(false);
const receiptUrl = ref('');
const receiptName = ref('');
const receiptType = ref('');
const receiptIsImage = computed(() => receiptType.value.startsWith('image/'));
const receiptIsPdf = computed(() => receiptType.value === 'application/pdf');

async function viewReceipt(e: TreasuryEntryView): Promise<void> {
  if (!e.receipt) return;
  receiptLoading.value = e.receipt.id;
  try {
    const blob = await getBlob(`/files/${e.receipt.id}`);
    if (receiptUrl.value) URL.revokeObjectURL(receiptUrl.value);
    receiptUrl.value = URL.createObjectURL(blob);
    receiptName.value = e.receipt.filename;
    receiptType.value = e.receipt.contentType || blob.type;
    receiptDialog.value = true;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία ανοίγματος.' });
  } finally {
    receiptLoading.value = null;
  }
}

function downloadReceipt(): void {
  if (!receiptUrl.value) return;
  const a = document.createElement('a');
  a.href = receiptUrl.value;
  a.download = receiptName.value || 'apodeiksi';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Ελευθερώνει το object URL όταν κλείνει η κάρτα — αλλιώς διαρρέει μνήμη. */
function closeReceipt(): void {
  if (receiptUrl.value) {
    URL.revokeObjectURL(receiptUrl.value);
    receiptUrl.value = '';
  }
}
</script>

<style scoped>
.bordered-toggle {
  border: 1px solid var(--line);
  border-radius: 8px;
}

/* Σταθερό κενό ανάμεσα στις δύο στήλες — χωρίς το αρνητικό περιθώριο του
   `q-col-gutter` που έκανε τις γραμμές να μη στοιχίζονται με τα μονά πεδία. */
.form-row {
  gap: 12px;
}
</style>
