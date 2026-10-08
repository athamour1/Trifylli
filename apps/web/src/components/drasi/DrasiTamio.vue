<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <SegmentedToggle
        v-model="view"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="[
          { label: 'Σύνοψη', value: 'summary' },
          { label: 'Κινήσεις', value: 'entries' },
          { label: 'Προϋπολογισμός', value: 'budget' },
          { label: 'Λογαριασμοί', value: 'ledger' },
        ]"
      />
      <q-space />
      <q-btn flat color="klados" icon="table_view" label="Excel" :loading="exporting" @click="exportXlsx" />
      <q-btn v-if="canWrite && !locked" flat color="negative" icon="lock" label="Κλείσιμο δράσης" @click="closeDrasi" />
    </div>

    <q-banner v-if="locked" rounded class="bg-grey-2 q-mb-md">
      <template #avatar><q-icon name="lock" color="grey-7" /></template>
      Η δράση είναι κλειστή: το ταμείο της δεν δέχεται αλλαγές.
      <span v-if="summary"> Υπόλοιπο κλεισίματος: <b>{{ formatEuro(summary.balance) }}</b>.</span>
    </q-banner>

    <q-inner-loading :showing="loading" />

    <!-- ── Σύνοψη ── -->
    <template v-if="view === 'summary' && summary">
      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-sm-4">
          <q-card flat bordered><q-card-section>
            <div class="text-caption text-grey-7">Υπόλοιπο</div>
            <div class="text-h5" :class="summary.balance < 0 ? 'text-negative' : 'text-klados'">{{ formatEuro(summary.balance) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-sm-4">
          <q-card flat bordered><q-card-section>
            <div class="text-caption text-grey-7">Έσοδα</div>
            <div class="text-h6 text-positive">{{ formatEuro(summary.income) }}</div>
            <div class="text-caption text-grey-7">συμμετοχές {{ formatEuro(summary.incomeFromPayments) }} · κινήσεις {{ formatEuro(summary.incomeFromEntries) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-sm-4">
          <q-card flat bordered><q-card-section>
            <div class="text-caption text-grey-7">Έξοδα</div>
            <div class="text-h6 text-negative">{{ formatEuro(summary.expense) }}</div>
            <div class="text-caption text-grey-7">{{ summary.expenses.reduce((s, e) => s + e.count, 0) }} αποδείξεις</div>
          </q-card-section></q-card>
        </div>
      </div>

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="q-pb-xs text-subtitle2">Έξοδα ανά κατηγορία</q-card-section>
        <q-card-section class="q-pt-none">
          <div v-for="c in summary.expenses" :key="c.category" class="q-mb-sm">
            <div class="row items-center justify-between text-caption">
              <span>{{ TREASURY_CATEGORY_LABEL[c.category] ?? c.category }} <span class="text-grey-6">({{ c.count }})</span></span>
              <span>
                <span class="text-negative">{{ formatEuro(c.actual) }}</span>
                <span v-if="c.planned" class="text-grey-7"> / {{ formatEuro(c.planned) }}</span>
                <span class="text-grey-6"> · {{ pct(c.actualPct) }}</span>
                <span v-if="c.targetPct !== null" :class="c.actualPct > c.targetPct ? 'text-negative' : 'text-positive'"> (στόχος {{ pct(c.targetPct) }})</span>
              </span>
            </div>
            <q-linear-progress
              :value="maxExpense > 0 ? c.actual / maxExpense : 0"
              :color="c.planned && c.actual > c.planned ? 'negative' : 'klados'"
              track-color="grey-3"
              size="6px"
              class="q-mt-xs rounded-borders"
            />
          </div>
        </q-card-section>
      </q-card>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-6">
          <q-card flat bordered class="full-height">
            <q-card-section class="q-pb-xs text-subtitle2">Συμμετοχές</q-card-section>
            <q-card-section class="q-pt-none">
              <div class="row text-center q-mb-sm">
                <div class="col"><div class="text-caption text-grey-7">Οφειλόμενα</div><div>{{ formatEuro(summary.fees.expected) }}</div></div>
                <div class="col"><div class="text-caption text-grey-7">Εισπραγμένα</div><div class="text-positive">{{ formatEuro(summary.fees.collected) }}</div></div>
                <div class="col"><div class="text-caption text-grey-7">Ανείσπρακτα</div><div :class="summary.fees.outstanding > 0 ? 'text-negative' : ''">{{ formatEuro(summary.fees.outstanding) }}</div></div>
              </div>
              <div v-for="k in summary.fees.byKind" :key="k.kind" class="text-caption text-grey-7">
                {{ DRASI_FEE_KIND_LABEL[k.kind] }}: {{ k.count }} × → {{ formatEuro(k.amount) }}
              </div>
              <div v-if="summary.fees.byStage.length" class="q-mt-sm">
                <div v-for="s in summary.fees.byStage" :key="s.stage" class="text-caption">
                  <q-icon name="circle" size="8px" :color="s.stage === 'EISPRAXTHIKE' ? 'orange-7' : 'positive'" class="q-mr-xs" />
                  {{ PAYMENT_HANDLING_LABEL[s.stage] }}: {{ formatEuro(s.amount) }} ({{ s.count }})
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-6">
          <q-card flat bordered class="full-height">
            <q-card-section class="q-pb-xs text-subtitle2">Λογαριασμοί στελεχών</q-card-section>
            <q-card-section class="q-pt-none">
              <div class="row text-center">
                <div class="col"><div class="text-caption text-grey-7">Προκαταβολές</div><div>{{ formatEuro(summary.ledger.given) }}</div></div>
                <div class="col"><div class="text-caption text-grey-7">Επιστροφές</div><div>{{ formatEuro(summary.ledger.returned) }}</div></div>
                <div class="col"><div class="text-caption text-grey-7">Αποδόσεις</div><div>{{ formatEuro(summary.ledger.reimbursed) }}</div></div>
              </div>
              <div class="q-mt-sm text-caption" :class="summary.ledger.open !== 0 ? 'text-orange-8' : 'text-grey-7'">
                Ανοιχτό υπόλοιπο σε χέρια στελεχών: <b>{{ formatEuro(summary.ledger.open) }}</b>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </template>

    <!-- ── Κινήσεις ── -->
    <template v-else-if="view === 'entries'">
      <!-- Γρήγορη καταχώριση: μία γραμμή, Enter, επόμενη — η κατηγορία μένει. -->
      <q-card v-if="canWrite && !locked" flat bordered class="q-pa-sm q-mb-md">
        <div class="row q-col-gutter-sm items-start">
          <!-- Καμία εναλλαγή «έξοδο/έσοδο»: το είδος το λέει το κουμπί στο τέλος (− / +). -->
          <div class="col-6 col-sm-3">
            <q-select v-model="entry.category" :options="categoryOptions" label="Κατηγορία" outlined dense emit-value map-options color="klados">
              <template #option="scope">
                <q-item-label v-if="scope.opt.header" header class="q-py-xs text-weight-medium">{{ scope.opt.label }}</q-item-label>
                <q-item v-else v-bind="scope.itemProps" dense>
                  <q-item-section>{{ scope.opt.label }}</q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>
          <div class="col-6 col-sm-2"><DateField v-model="entry.occurredAt" label="Ημερομηνία" /></div>
          <div class="col-12 col-sm-4">
            <q-select
              v-model="entry.description"
              :options="descriptionOptions"
              label="Αιτιολογία"
              outlined
              dense
              use-input
              hide-dropdown-icon
              new-value-mode="add-unique"
              input-debounce="0"
              color="klados"
              @filter="filterDescriptions"
              @keyup.enter="submitEntry(defaultKind)"
            />
          </div>
          <div class="col-12 col-sm-3">
            <q-input v-model.number="entry.amount" type="number" label="Ποσό €" outlined dense step="0.01" :min="0" color="klados" @keyup.enter="submitEntry(defaultKind)" />
          </div>
          <div class="col-12">
            <q-file v-model="entry.file" label="Απόδειξη (φωτογραφία ή PDF)" outlined dense clearable accept="image/*,application/pdf" :max-file-size="MAX_RECEIPT_BYTES" color="klados">
              <template #prepend><q-icon name="photo_camera" /></template>
            </q-file>
          </div>
          <div class="col-12 row no-wrap q-gutter-sm justify-end">
            <q-btn
              unelevated no-caps color="negative" icon="remove" label="Έξοδο"
              class="entry-btn" :disable="!kindAllowed('EXPENSE')" :loading="saving && savingKind === 'EXPENSE'"
              @click="submitEntry('EXPENSE')"
            />
            <q-btn
              unelevated no-caps color="positive" icon="add" label="Έσοδο"
              class="entry-btn" :disable="!kindAllowed('INCOME')" :loading="saving && savingKind === 'INCOME'"
              @click="submitEntry('INCOME')"
            />
          </div>
        </div>
      </q-card>

      <SegmentedToggle
        v-model="entryFilter"
        class="q-mb-sm"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="[
          { label: 'Όλα', value: '' },
          { label: 'Έξοδα', value: 'EXPENSE' },
          { label: 'Έσοδα', value: 'INCOME' },
        ]"
      />

      <div v-if="!filteredEntries.length" class="text-center text-grey-6 q-pa-lg">Καμία κίνηση.</div>
      <q-list v-else bordered separator class="rounded-borders">
        <q-item v-for="e in filteredEntries" :key="e.id">
          <q-item-section avatar>
            <q-avatar :color="e.kind === 'INCOME' ? 'positive' : 'negative'" text-color="white" size="30px">
              <span class="text-caption">{{ serial(e) }}</span>
            </q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ e.description || (TREASURY_CATEGORY_LABEL[e.category] ?? e.category) }}</q-item-label>
            <q-item-label caption>
              {{ TREASURY_CATEGORY_LABEL[e.category] ?? e.category }} · {{ formatDate(e.occurredAt) }}
              <span v-if="e.createdBy"> · {{ e.createdBy.lastName }} {{ e.createdBy.firstName }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap">
              <q-btn v-if="e.receipt" flat dense round icon="receipt_long" color="klados" @click="viewReceipt(e)"><q-tooltip>Απόδειξη</q-tooltip></q-btn>
              <div class="text-weight-bold q-mx-sm" :class="e.kind === 'INCOME' ? 'text-positive' : 'text-negative'">
                {{ e.kind === 'INCOME' ? '+' : '−' }}{{ formatEuro(e.amount) }}
              </div>
              <q-btn v-if="canWrite && !locked" flat dense round icon="delete" color="negative" size="sm" @click="removeEntry(e)" />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </template>

    <!-- ── Προϋπολογισμός ── -->
    <template v-else-if="view === 'budget'">
      <q-markup-table flat bordered dense>
        <thead>
          <tr><th class="text-left">Κατηγορία</th><th class="text-right">Ποσό €</th><th class="text-right">Στόχος %</th><th class="text-right">Πραγματικό</th></tr>
        </thead>
        <tbody>
          <tr v-for="line in budgetLines" :key="line.category">
            <td>{{ TREASURY_CATEGORY_LABEL[line.category] ?? line.category }}</td>
            <td class="text-right" style="width: 140px">
              <q-input v-model.number="line.planned" type="number" dense outlined step="1" :min="0" :disable="!canWrite || locked" color="klados" input-class="text-right" />
            </td>
            <td class="text-right" style="width: 120px">
              <q-input v-model.number="line.targetPct" type="number" dense outlined step="1" :min="0" :max="100" :disable="!canWrite || locked" color="klados" input-class="text-right" suffix="%" />
            </td>
            <td class="text-right text-grey-7">{{ formatEuro(actualFor(line.category)) }}</td>
          </tr>
          <tr class="bg-grey-2 text-weight-bold">
            <td>Σύνολο</td>
            <td class="text-right">{{ formatEuro(budgetLines.reduce((s, l) => s + (l.planned || 0), 0)) }}</td>
            <td class="text-right">{{ budgetLines.reduce((s, l) => s + (l.targetPct || 0), 0) }}%</td>
            <td class="text-right">{{ formatEuro(summary?.expense ?? 0) }}</td>
          </tr>
        </tbody>
      </q-markup-table>
      <div v-if="canWrite && !locked" class="row justify-end q-mt-sm">
        <q-btn color="klados" text-color="klados-on" label="Αποθήκευση προϋπολογισμού" :loading="saving" @click="saveBudget" />
      </div>
    </template>

    <!-- ── Λογαριασμοί στελεχών ── -->
    <template v-else-if="view === 'ledger'">
      <div class="row justify-between items-center q-mb-sm">
        <div class="text-caption text-grey-7">
          Υπόλοιπο = προκαταβολές − επιστροφές. Κλείνει με «Τακτοποιήθηκε» όταν το υπόλοιπο καλύφθηκε από αποδείξεις.
        </div>
        <q-btn v-if="canWrite && !locked" color="klados" text-color="klados-on" unelevated icon="add" label="Κίνηση" @click="openLedger" />
      </div>
      <div v-if="!ledger.length" class="text-center text-grey-6 q-pa-lg">Κανένας λογαριασμός ακόμη.</div>
      <div v-else class="row q-col-gutter-md">
        <div v-for="acc in ledger" :key="acc.user.id" class="col-12 col-md-6">
          <q-card flat bordered>
            <q-card-section class="q-pb-xs">
              <div class="row items-center">
                <div class="text-subtitle1 text-weight-medium col">{{ acc.user.lastName }} {{ acc.user.firstName }}</div>
                <q-badge :color="acc.balance === 0 ? 'positive' : 'orange-7'" :label="acc.balance === 0 ? 'τακτοποιημένο' : `υπόλοιπο ${formatEuro(acc.balance)}`" />
              </div>
              <div class="text-caption text-grey-7">
                πήρε {{ formatEuro(acc.given) }} · επέστρεψε {{ formatEuro(acc.returned) }} · του αποδόθηκαν {{ formatEuro(acc.reimbursed) }}
              </div>
            </q-card-section>
            <q-list dense>
              <q-item v-for="e in acc.entries" :key="e.id">
                <q-item-section>
                  <q-item-label>{{ DRASI_LEDGER_KIND_LABEL[e.kind] }} <span class="text-grey-7">· {{ formatDate(e.occurredAt) }}</span></q-item-label>
                  <q-item-label v-if="e.note" caption>{{ e.note }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center no-wrap">
                    <span :class="e.kind === 'EPISTROFI' ? 'text-positive' : 'text-negative'">{{ e.kind === 'EPISTROFI' ? '+' : '−' }}{{ formatEuro(e.amount) }}</span>
                    <q-icon v-if="e.settledAt" name="check_circle" color="positive" size="16px" class="q-ml-xs"><q-tooltip>Τακτοποιήθηκε</q-tooltip></q-icon>
                    <q-btn v-if="canWrite && !locked" flat dense round size="sm" icon="delete" color="negative" @click="removeLedger(e)" />
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
            <q-card-actions v-if="canWrite && !locked && acc.balance !== 0" align="right">
              <q-btn flat color="klados" icon="done_all" label="Τακτοποιήθηκε" @click="settle(acc)" />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </template>

    <!-- ── Κίνηση λογαριασμού ── -->
    <q-dialog v-model="ledgerDialog">
      <q-card style="min-width: min(420px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Κίνηση λογαριασμού στελέχους</q-card-section>
        <q-card-section class="q-gutter-sm">
          <StelexosPicker v-model="ledgerForm.user" label="Στέλεχος" :options="stelexiOptions" />
          <q-select v-model="ledgerForm.kind" :options="ledgerKindOptions" label="Κίνηση" outlined dense emit-value map-options color="klados" />
          <q-input v-model.number="ledgerForm.amount" type="number" label="Ποσό € *" outlined dense step="0.01" :min="0" color="klados" />
          <DateField v-model="ledgerForm.occurredAt" label="Ημερομηνία" />
          <q-input v-model="ledgerForm.note" label="Σημείωση" outlined dense color="klados" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Καταχώρηση" :loading="saving" @click="submitLedger" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Προβολή απόδειξης ── -->
    <q-dialog v-model="receiptDialog" @hide="closeReceipt">
      <q-card style="min-width: min(560px, 94vw)">
        <q-card-section class="row items-center no-wrap q-pb-none">
          <div class="text-subtitle1 text-weight-medium ellipsis">{{ receiptName }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="text-center">
          <img v-if="receiptType.startsWith('image/')" :src="receiptUrl" alt="Απόδειξη" style="max-width: 100%; max-height: 68vh; border-radius: 8px" />
          <iframe v-else :src="receiptUrl" title="Απόδειξη" style="width: 100%; height: 68vh; border: none" />
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_EXPENSE_CATEGORIES,
  DRASI_FEE_KIND_LABEL,
  DRASI_INCOME_CATEGORIES,
  DRASI_LEDGER_KIND_LABEL,
  DrasiLedgerKind,
  MAX_RECEIPT_BYTES,
  PAYMENT_HANDLING_LABEL,
  TREASURY_CATEGORY_LABEL,
  type DrasiBudgetView,
  type DrasiLedgerAccount,
  type DrasiLedgerView,
  type DrasiTreasurySummary,
  type KladosType,
  type MemberSummary,
  type Paginated,
  type TreasuryEntryView,
} from '@trifylli/shared';
import DateField from '../DateField.vue';
import StelexosPicker from '../StelexosPicker.vue';
import { ApiError, del, downloadFile, get, getBlob, patch, post, put, upload } from '../../lib/api';
import { formatDate, formatEuro, toISODate } from '../../lib/format';

const props = defineProps<{
  drasiId: string;
  /** Ο διοργανωτής — η εμβέλεια των αποδείξεων (`null` = Τοπικό). */
  organiser: KladosType | null;
  canWrite: boolean;
  locked: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();

const $q = useQuasar();
const view = ref<'summary' | 'entries' | 'budget' | 'ledger'>('summary');
const loading = ref(false);
const saving = ref(false);
const summary = ref<DrasiTreasurySummary | null>(null);
const entries = ref<TreasuryEntryView[]>([]);
const ledger = ref<DrasiLedgerAccount[]>([]);
const budgetLines = ref<{ category: string; planned: number | null; targetPct: number | null }[]>([]);

const maxExpense = computed(() => Math.max(0, ...(summary.value?.expenses.map((e) => e.actual) ?? [0])));
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

async function reload(): Promise<void> {
  loading.value = true;
  try {
    const [s, list, led, bud] = await Promise.all([
      get<DrasiTreasurySummary>(`/draseis/${props.drasiId}/treasury/summary`),
      get<TreasuryEntryView[]>(`/draseis/${props.drasiId}/treasury`),
      get<DrasiLedgerAccount[]>(`/draseis/${props.drasiId}/ledger`),
      get<DrasiBudgetView[]>(`/draseis/${props.drasiId}/budget`),
    ]);
    summary.value = s;
    entries.value = list;
    ledger.value = led;
    budgetLines.value = DRASI_EXPENSE_CATEGORIES.map((category) => {
      const b = bud.find((x) => x.category === category);
      return { category, planned: b?.planned ?? null, targetPct: b?.targetPct != null ? Math.round(b.targetPct * 100) : null };
    });
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης ταμείου.');
  } finally {
    loading.value = false;
  }
}

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
    // Χωρίς λίστα στελεχών δεν ανοίγουν λογαριασμοί — τα υπόλοιπα δουλεύουν.
  }
});

// ── Κινήσεις ──
const entryFilter = ref<'' | 'INCOME' | 'EXPENSE'>('');
const filteredEntries = computed(() => entries.value.filter((e) => !entryFilter.value || e.kind === entryFilter.value));
const entry = reactive({
  category: DRASI_EXPENSE_CATEGORIES[0] as string,
  occurredAt: toISODate(new Date()),
  description: '' as string | null,
  amount: null as number | null,
  file: null as File | null,
});
type EntryKind = 'INCOME' | 'EXPENSE';
const categoryLabel = (c: string): string => TREASURY_CATEGORY_LABEL[c as keyof typeof TREASURY_CATEGORY_LABEL] ?? c;
/** Όλες οι κατηγορίες, σε δύο ομάδες· το «Άλλο» μία φορά, στο τέλος (ισχύει και για τα δύο). */
const categoryOptions = computed(() => [
  { header: true, label: 'Έξοδα', value: '__expense', disable: true },
  ...DRASI_EXPENSE_CATEGORIES.filter((c) => c !== 'ALLO').map((c) => ({ value: c, label: categoryLabel(c) })),
  { header: true, label: 'Έσοδα', value: '__income', disable: true },
  ...DRASI_INCOME_CATEGORIES.filter((c) => c !== 'ALLO').map((c) => ({ value: c, label: categoryLabel(c) })),
  { header: true, label: 'Γενικά', value: '__any', disable: true },
  { value: 'ALLO', label: categoryLabel('ALLO') },
]);
/** Ταιριάζει η κατηγορία με το είδος; (Έσοδο με «Μετακίνηση» δεν έχει νόημα.) */
const kindAllowed = (kind: EntryKind): boolean =>
  (kind === 'INCOME' ? DRASI_INCOME_CATEGORIES : DRASI_EXPENSE_CATEGORIES).includes(entry.category as never);
/** Με Enter: το είδος που ταιριάζει στην κατηγορία — έξοδο όταν ταιριάζουν και τα δύο. */
const defaultKind = computed<EntryKind>(() => (kindAllowed('EXPENSE') ? 'EXPENSE' : 'INCOME'));
const savingKind = ref<EntryKind | null>(null);
/** Οι αιτιολογίες που έχουν ήδη γραφτεί — «Διόδια» πληκτρολογείται μία φορά. */
const knownDescriptions = computed(() => [...new Set(entries.value.map((e) => e.description).filter((d): d is string => !!d))]);
const descriptionOptions = ref<string[]>([]);
function filterDescriptions(needle: string, update: (fn: () => void) => void): void {
  update(() => {
    const q = needle.trim().toLowerCase();
    descriptionOptions.value = q ? knownDescriptions.value.filter((d) => d.toLowerCase().includes(q)) : knownDescriptions.value;
  });
}

/** Α/Α ανά κατηγορία κατά ημερομηνία — υπολογίζεται, δεν αποθηκεύεται. */
function serial(e: TreasuryEntryView): string {
  const same = entries.value
    .filter((x) => x.kind === e.kind && x.category === e.category)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt));
  const label = TREASURY_CATEGORY_LABEL[e.category] ?? e.category;
  return `${label.charAt(0)}${same.findIndex((x) => x.id === e.id) + 1}`;
}

async function submitEntry(kind: EntryKind): Promise<void> {
  if (!entry.amount || entry.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Συμπλήρωσε ποσό.' });
    return;
  }
  if (!kindAllowed(kind)) return;
  saving.value = true;
  savingKind.value = kind;
  try {
    let receiptFileId: string | undefined;
    if (entry.file) {
      const ref = await upload<{ id: string }>('/files', entry.file, {
        purpose: 'RECEIPT',
        ...(props.organiser ? { kladosType: props.organiser } : {}),
      });
      receiptFileId = ref.id;
    }
    await post(`/draseis/${props.drasiId}/treasury`, {
      kind,
      category: entry.category,
      amount: entry.amount,
      occurredAt: new Date(`${entry.occurredAt}T12:00:00`).toISOString(),
      description: entry.description || undefined,
      receiptFileId,
    });
    // Η κατηγορία και η ημερομηνία μένουν: δέκα διόδια καταχωρίζονται σε δέκα δευτερόλεπτα.
    entry.amount = null;
    entry.file = null;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία καταχώρησης.');
  } finally {
    saving.value = false;
    savingKind.value = null;
  }
}

function removeEntry(e: TreasuryEntryView): void {
  $q.dialog({
    title: 'Διαγραφή κίνησης',
    message: `Να διαγραφεί «${e.description || (TREASURY_CATEGORY_LABEL[e.category] ?? e.category)}» ${formatEuro(e.amount)};`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/treasury/${e.id}`);
      await reload();
    } catch (err) {
      notifyError(err, 'Αποτυχία διαγραφής.');
    }
  });
}

// ── Προϋπολογισμός ──
function actualFor(category: string): number {
  return summary.value?.expenses.find((e) => e.category === category)?.actual ?? 0;
}
async function saveBudget(): Promise<void> {
  saving.value = true;
  try {
    await put(`/draseis/${props.drasiId}/budget`, {
      items: budgetLines.value
        .filter((l) => (l.planned ?? 0) > 0 || (l.targetPct ?? 0) > 0)
        .map((l) => ({
          category: l.category,
          planned: l.planned ?? 0,
          ...(l.targetPct !== null && l.targetPct !== ('' as unknown) ? { targetPct: l.targetPct / 100 } : {}),
        })),
    });
    await reload();
    $q.notify({ type: 'positive', message: 'Ο προϋπολογισμός αποθηκεύτηκε.' });
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    saving.value = false;
  }
}

// ── Λογαριασμοί ──
const ledgerDialog = ref(false);
const ledgerKindOptions = (Object.keys(DrasiLedgerKind) as DrasiLedgerKind[]).map((k) => ({ label: DRASI_LEDGER_KIND_LABEL[k], value: k }));
const ledgerForm = reactive({
  user: [] as string[],
  kind: 'PROKATAVOLI' as DrasiLedgerKind,
  amount: null as number | null,
  occurredAt: toISODate(new Date()),
  note: '',
});
function openLedger(): void {
  Object.assign(ledgerForm, { user: [], kind: 'PROKATAVOLI', amount: null, occurredAt: toISODate(new Date()), note: '' });
  ledgerDialog.value = true;
}
async function submitLedger(): Promise<void> {
  if (!ledgerForm.user[0] || !ledgerForm.amount || ledgerForm.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Διάλεξε στέλεχος και ποσό.' });
    return;
  }
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/ledger`, {
      userId: ledgerForm.user[0],
      kind: ledgerForm.kind,
      amount: ledgerForm.amount,
      occurredAt: new Date(`${ledgerForm.occurredAt}T12:00:00`).toISOString(),
      note: ledgerForm.note || undefined,
    });
    ledgerDialog.value = false;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία καταχώρησης.');
  } finally {
    saving.value = false;
    savingKind.value = null;
  }
}
async function removeLedger(e: DrasiLedgerView): Promise<void> {
  try {
    await del(`/draseis/${props.drasiId}/ledger/${e.id}`);
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία διαγραφής.');
  }
}
async function settle(acc: DrasiLedgerAccount): Promise<void> {
  try {
    await post(`/draseis/${props.drasiId}/ledger/settle`, { userId: acc.user.id });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Excel ──
const exporting = ref(false);
async function exportXlsx(): Promise<void> {
  exporting.value = true;
  try {
    await downloadFile(`/draseis/${props.drasiId}/export.xlsx`, 'tameio-drasis.xlsx');
  } catch (err) {
    notifyError(err, 'Αποτυχία εξαγωγής.');
  } finally {
    exporting.value = false;
  }
}

// ── Κλείσιμο ──
function closeDrasi(): void {
  $q.dialog({
    title: 'Κλείσιμο δράσης',
    message: `Το ταμείο κλειδώνει: καμία κίνηση, πληρωμή ή λογαριασμός δεν αλλάζει μετά. Υπόλοιπο: ${formatEuro(summary.value?.balance ?? 0)}. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Κλείσιμο', color: 'negative' },
    persistent: true,
  }).onOk(async () => {
    try {
      await patch(`/draseis/${props.drasiId}`, { status: 'KLEISTI' });
      emit('changed');
      await reload();
    } catch (err) {
      notifyError(err, 'Αποτυχία.');
    }
  });
}

// ── Απόδειξη ──
const receiptDialog = ref(false);
const receiptUrl = ref('');
const receiptName = ref('');
const receiptType = ref('');
async function viewReceipt(e: TreasuryEntryView): Promise<void> {
  if (!e.receipt) return;
  try {
    const blob = await getBlob(`/files/${e.receipt.id}`);
    closeReceipt();
    receiptUrl.value = URL.createObjectURL(blob);
    receiptName.value = e.receipt.filename;
    receiptType.value = e.receipt.contentType || blob.type;
    receiptDialog.value = true;
  } catch (err) {
    notifyError(err, 'Αποτυχία ανοίγματος.');
  }
}
function closeReceipt(): void {
  if (receiptUrl.value) URL.revokeObjectURL(receiptUrl.value);
  receiptUrl.value = '';
}

watch(() => props.locked, () => void reload());

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}

defineExpose({ reload });
</script>

<style scoped>
/* Τα δύο κουμπιά καταχώρησης: ίσα, και στο κινητό μοιράζονται το πλάτος. */
.entry-btn {
  min-width: 120px;
}
@media (max-width: 599px) {
  .entry-btn {
    flex: 1 1 0;
  }
}
</style>
