<template>
  <div>
    <q-inner-loading :showing="loading" />

    <template v-if="data">
      <div class="row items-start justify-between no-wrap q-mb-sm">
        <div>
          <div class="text-h6">{{ data.name }}</div>
          <div class="text-caption text-grey-7">
            {{ YLIKO_CATEGORY_LABEL[data.category] }}
            <span v-if="data.storagePoint"> · <q-icon name="warehouse" size="14px" /> {{ data.storagePoint.name }}</span>
            · {{ data.totalQty }} {{ data.unit ?? 'τεμ.' }}
          </div>
          <div v-if="data.klados" class="text-caption text-grey-6">{{ KLADOS_LABEL[data.klados.type] }}</div>
        </div>
        <div v-if="qr" class="column items-center q-ml-md" style="flex: none">
          <img :src="qr" alt="QR" width="104" height="104" />
          <q-btn flat dense no-caps size="sm" color="klados" icon="download" label="Λήψη QR" @click="downloadQr" />
        </div>
      </div>

      <div class="row q-gutter-sm q-mb-md">
        <q-btn v-if="canLend" color="klados" text-color="klados-on" no-caps icon="volunteer_activism" label="Δανεισμός" @click="openLend" />
      </div>

      <q-separator class="q-mb-md" />

      <div class="q-gutter-md scroll" style="max-height: 62vh">
        <!-- Ενεργές δεσμεύσεις -->
        <div>
          <div class="section-title q-mb-xs">Ενεργές δεσμεύσεις</div>
          <q-list v-if="active.length" dense separator>
            <q-item v-for="c in active" :key="c.id" class="q-px-none">
              <q-item-section>
                <q-item-label>{{ c.qty }} τεμ. · {{ CHECKOUT_STATUS[c.status] }}</q-item-label>
                <q-item-label caption>
                  {{ formatDate(c.from) }} – {{ formatDate(c.to) }}{{ forWhat(c) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side v-if="canCheckout">
                <q-btn flat dense no-caps color="klados" icon="assignment_return" label="Επιστροφή" @click="openReturn(c)" />
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-grey-5">Καμία ενεργή δέσμευση.</div>
        </div>

        <!-- Βλάβες & επιδιορθώσεις -->
        <div>
          <div class="row items-center justify-between q-mb-xs">
            <div class="section-title">Βλάβες & επιδιορθώσεις</div>
            <q-btn
              v-if="canManage"
              flat dense no-caps color="klados"
              :icon="showMaintForm ? 'close' : 'add'"
              :label="showMaintForm ? 'Κλείσιμο' : 'Σημείωση'"
              @click="toggleMaintForm"
            />
          </div>

          <!-- Νέα σημείωση: ανοίγει επιτόπου (όχι ξεχωριστό dialog). -->
          <q-slide-transition>
            <q-card v-if="showMaintForm" flat bordered class="maint-form q-mb-sm">
              <q-card-section class="q-gutter-md">
                <div class="text-subtitle2 text-weight-medium">Νέα σημείωση</div>
                <q-select
                  v-model="maint.kind"
                  :options="kindOptions"
                  label="Είδος *"
                  outlined dense emit-value map-options
                />
                <q-input
                  v-model="maint.note"
                  label="Περιγραφή *"
                  outlined dense type="textarea" autogrow
                />
                <div class="row q-col-gutter-sm items-start">
                  <div :class="maint.kind === 'REPAIR' ? 'col-12 col-sm-6' : 'col-12'">
                    <DateField v-model="maint.date" label="Ημερομηνία" />
                  </div>
                  <div v-if="maint.kind === 'REPAIR'" class="col-12 col-sm-6">
                    <q-input
                      v-model.number="maint.cost"
                      type="number"
                      label="Κόστος €"
                      outlined dense :min="0" step="0.01"
                    >
                      <template #prepend>
                        <q-icon name="euro" :style="{ color: 'var(--klados-ink)' }" />
                      </template>
                    </q-input>
                  </div>
                </div>
                <!--
                  Η χρέωση πάει αυτόματα στο ταμείο της εμβέλειας από την οποία
                  ανοίχτηκε το υλικό (κλάδος ή Τοπικό) — χωρίς επιλογή, πιο καθαρό.
                -->
                <div
                  v-if="maint.kind === 'REPAIR' && (maint.cost ?? 0) > 0"
                  class="charge-note row items-center no-wrap"
                >
                  <q-icon name="account_balance_wallet" size="18px" class="q-mr-xs" :style="{ color: 'var(--klados-ink)' }" />
                  <span>Το κόστος θα χρεωθεί στο ταμείο <strong>{{ chargeScopeLabel }}</strong>.</span>
                </div>
              </q-card-section>
              <q-card-actions align="right" class="q-pt-none">
                <q-btn flat no-caps label="Άκυρο" @click="showMaintForm = false" />
                <q-btn
                  color="klados" text-color="klados-on" no-caps label="Προσθήκη"
                  :loading="busy" @click="submitMaintenance"
                />
              </q-card-actions>
            </q-card>
          </q-slide-transition>

          <q-list v-if="data.maintenance.length" dense separator>
            <q-item v-for="m in data.maintenance" :key="m.id" class="q-px-none">
              <q-item-section avatar>
                <q-icon :name="m.kind === 'REPAIR' ? 'build' : 'report_problem'" :color="m.kind === 'REPAIR' ? 'klados' : 'warning'" size="20px" />
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ m.note }}</q-item-label>
                <q-item-label caption>
                  {{ MAINTENANCE_KIND_LABEL[m.kind] }} · {{ formatDate(m.date) }}
                  <span v-if="m.cost"> · {{ formatEuro(Number(m.cost)) }}</span>
                  <span v-if="m.createdBy"> · {{ m.createdBy.lastName }} {{ m.createdBy.firstName }}</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side v-if="canManage">
                <q-btn flat dense round icon="delete" color="negative" size="sm" @click="removeMaintenance(m.id)" />
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-grey-5">Καμία σημείωση.</div>
        </div>

        <!-- Ιστορικό δεσμεύσεων -->
        <div>
          <div class="section-title q-mb-xs">Ιστορικό δεσμεύσεων</div>
          <q-list v-if="history.length" dense separator>
            <q-item v-for="c in history" :key="c.id" class="q-px-none">
              <q-item-section>
                <q-item-label>{{ c.qty }} τεμ. · {{ CHECKOUT_STATUS[c.status] }}</q-item-label>
                <q-item-label caption>
                  {{ formatDate(c.from) }} – {{ formatDate(c.to) }}{{ forWhat(c) }}
                  <span v-if="c.returnCondition"> · κατάσταση: {{ RETURN_CONDITION_LABEL[c.returnCondition] }}</span>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-grey-5">Χωρίς ιστορικό.</div>
        </div>
      </div>
    </template>

    <!-- ── Δανεισμός ── -->
    <q-dialog v-model="lendDialog">
      <q-card style="min-width: min(360px, 92vw)">
        <q-card-section class="text-subtitle1 text-weight-medium">Δανεισμός</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select v-model="lend.klados" :options="kladosOptions" label="Σε ποιον δανείζεται *" outlined dense emit-value map-options />
          <q-input v-model.number="lend.qty" type="number" label="Ποσότητα *" outlined dense :min="1" />
          <div class="row q-col-gutter-sm">
            <div class="col-6"><DateField v-model="lend.from" label="Από *" /></div>
            <div class="col-6"><DateField v-model="lend.to" label="Έως *" /></div>
          </div>
        </q-card-section>
        <q-card-section v-if="lendError" class="bg-red-1 text-negative">{{ lendError }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Δανεισμός" :loading="busy" @click="submitLend" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Επιστροφή ── -->
    <q-dialog v-model="returnDialog">
      <q-card style="min-width: min(360px, 92vw)">
        <q-card-section class="text-subtitle1 text-weight-medium">Επιστροφή υλικού</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model.number="ret.returnedQty" type="number" label="Τεμάχια που επιστρέφονται" outlined dense :min="0" :max="returning?.qty ?? 1" />
          <q-select v-model="ret.condition" :options="conditionOptions" label="Κατάσταση *" outlined dense emit-value map-options />
          <q-input v-model="ret.note" label="Σημείωση (προαιρετικό)" outlined dense type="textarea" autogrow />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Καταχώρηση" :loading="busy" @click="submitReturn" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import QRCode from 'qrcode';
import {
  KLADOI_IN_ORDER,
  KLADOS_LABEL,
  MAINTENANCE_KIND_LABEL,
  RETURN_CONDITION_LABEL,
  YLIKO_CATEGORY_LABEL,
  type KladosType,
  type MaintenanceKind,
  type ReturnCondition,
  type YlikoCategory,
} from '@trifylli/shared';
import { ApiError, del, get, patch, post } from '../lib/api';
import { formatDate, formatEuro, toISODate } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import DateField from './DateField.vue';

const props = defineProps<{
  ylikoId: string;
  /** Η εμβέλεια της σελίδας: κλάδος ή `null` για Τοπικό (Κεντρική αποθήκη). */
  scopeKlados: KladosType | null;
}>();
const emit = defineEmits<{ changed: []; loaded: [klados: KladosType | null]; forbidden: [] }>();

interface Checkout {
  id: string;
  qty: number;
  status: string;
  from: string;
  to: string;
  returnedQty: number | null;
  returnCondition: string | null;
  klados: { type: KladosType } | null;
  drasi: { title: string } | null;
  syggentrwsh: { date: string } | null;
  requestedBy: { firstName: string; lastName: string } | null;
}
interface Maintenance {
  id: string;
  kind: string;
  note: string;
  cost: string | null;
  date: string;
  createdBy: { firstName: string; lastName: string } | null;
}
interface Detail {
  id: string;
  name: string;
  category: YlikoCategory;
  totalQty: number;
  unit: string | null;
  klados: { type: KladosType; name: string | null } | null;
  storagePoint: { id: string; name: string } | null;
  maintenance: Maintenance[];
  checkouts: Checkout[];
}

const $q = useQuasar();
const auth = useAuthStore();
// Η διαχείριση ακολουθεί την **εμβέλεια της σελίδας**: ο διαχειριστής κλάδου στη
// σελίδα του κλάδου, ο υπερδιαχειριστής στην Κεντρική αποθήκη (Τοπικό). Ό,τι
// σημείωση/επισκευή γίνεται, χρεώνεται στο ίδιο ταμείο (βλ. chargeScopeLabel).
const canManage = computed(() =>
  props.scopeKlados ? auth.can('yliko:manage', props.scopeKlados) : auth.isSuperAdmin,
);
const canCheckout = computed(() => auth.can('yliko:checkout'));

/** Το ταμείο που χρεώνεται η επισκευή = η εμβέλεια της σελίδας. */
const chargeScopeLabel = computed(() =>
  props.scopeKlados ? KLADOS_LABEL[props.scopeKlados] : 'Τοπικό',
);

const data = ref<Detail | null>(null);
const loading = ref(false);
const qr = ref('');
const busy = ref(false);

const CHECKOUT_STATUS: Record<string, string> = {
  DESMEFSI: 'Δεσμευμένο',
  PARALAVI: 'Παραλήφθηκε',
  EPISTROFI: 'Επιστράφηκε',
  AKYROSI: 'Ακυρώθηκε',
};
const active = computed(() => data.value?.checkouts.filter((c) => c.status === 'DESMEFSI' || c.status === 'PARALAVI') ?? []);
const history = computed(() => data.value?.checkouts.filter((c) => c.status === 'EPISTROFI' || c.status === 'AKYROSI') ?? []);

function forWhat(c: Checkout): string {
  if (c.drasi) return ` · ${c.drasi.title}`;
  if (c.requestedBy) return ` · ${c.requestedBy.lastName} ${c.requestedBy.firstName}`;
  return '';
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await get<Detail>(`/yliko/${props.ylikoId}`);
    emit('loaded', data.value.klados?.type ?? null);
    qr.value = await QRCode.toDataURL(`${window.location.origin}/yliko/item/${props.ylikoId}`, { margin: 1, width: 208 });
  } catch (err) {
    // Όποιος φιλοξενεί την καρτέλα αποφασίζει τι σημαίνει «δεν επιτρέπεται»·
    // η σελίδα του QR πηγαίνει στη σελίδα «δεν έχεις πρόσβαση».
    if (err instanceof ApiError && err.status === 403) emit('forbidden');
    else $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης.' });
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => props.ylikoId, load);

/** Λήψη του QR σε υψηλή ανάλυση — για εκτύπωση ετικέτας σε σκηνές κ.λπ. */
async function downloadQr(): Promise<void> {
  try {
    const url = await QRCode.toDataURL(`${window.location.origin}/yliko/item/${props.ylikoId}`, {
      margin: 2,
      width: 1024,
    });
    const name = (data.value?.name ?? 'yliko').replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-${name}.png`;
    a.click();
  } catch {
    $q.notify({ type: 'negative', message: 'Αποτυχία δημιουργίας QR.' });
  }
}

// Σεντινέλα για «δανεισμός στο Τοπικό» (όπως στα φαρμακεία): η τιμή αυτή σημαίνει
// ότι ο παραλήπτης είναι το Τοπικό, οπότε στο αίτημα παραλείπουμε τον κλάδο.
const TOPIKO = '__TOPIKO__';

/**
 * Παραλήπτες δανεισμού: όλοι οι κλάδοι εκτός του ιδιοκτήτη, συν το Τοπικό όταν το
 * είδος ανήκει σε κλάδο. Έτσι ένας κλάδος δανείζει σε οποιονδήποτε άλλο ή στο
 * Τοπικό — ακριβώς όπως τα φαρμακεία.
 */
const kladosOptions = computed(() => {
  const owner = data.value?.klados?.type ?? null;
  const opts = KLADOI_IN_ORDER.filter((k) => k !== owner).map((k) => ({
    label: KLADOS_LABEL[k],
    value: k as string,
  }));
  if (owner !== null) opts.push({ label: 'Τοπικό', value: TOPIKO });
  return opts;
});

/** Το είδος ανήκει στην εμβέλεια της σελίδας; (αλλιώς είναι δανεισμένο σ' αυτήν). */
const isOwnedByScope = computed(() => (data.value?.klados?.type ?? null) === props.scopeKlados);

/**
 * Δανεισμός επιτρέπεται μόνο από την εμβέλεια που κατέχει το είδος: ο κάτοχος το
 * δανείζει. Ο υπερδιαχειριστής μπορεί επιπλέον από την Κεντρική αποθήκη (Τοπικό)
 * να δανείσει οτιδήποτε. Σε δανεισμένο είδος (π.χ. στη σελίδα του δανειζόμενου)
 * το κουμπί κρύβεται.
 */
const canLend = computed(
  () => canCheckout.value && (isOwnedByScope.value || (props.scopeKlados === null && auth.isSuperAdmin)),
);
const conditionOptions = (Object.keys(RETURN_CONDITION_LABEL) as ReturnCondition[]).map((v) => ({
  value: v,
  label: RETURN_CONDITION_LABEL[v],
}));
const kindOptions = (Object.keys(MAINTENANCE_KIND_LABEL) as MaintenanceKind[]).map((v) => ({
  value: v,
  label: MAINTENANCE_KIND_LABEL[v],
}));

// ── Δανεισμός ──
const lendDialog = ref(false);
const lendError = ref<string | null>(null);
const lend = reactive({ klados: null as string | null, qty: 1, from: toISODate(new Date()), to: '' });

function openLend(): void {
  lendError.value = null;
  lend.klados = null;
  lend.qty = 1;
  lend.from = toISODate(new Date());
  const inAWeek = new Date();
  inAWeek.setDate(inAWeek.getDate() + 7);
  lend.to = toISODate(inAWeek);
  lendDialog.value = true;
}

async function submitLend(): Promise<void> {
  if (!lend.klados || !lend.from || !lend.to || lend.from >= lend.to) {
    lendError.value = 'Συμπλήρωσε κλάδο και σωστό διάστημα.';
    return;
  }
  busy.value = true;
  lendError.value = null;
  try {
    await post('/yliko/checkouts', {
      ylikoId: props.ylikoId,
      qty: lend.qty,
      // Τοπικό ⇒ παραλείπουμε τον κλάδο· αλλιώς ο κλάδος-παραλήπτης.
      ...(lend.klados !== TOPIKO ? { kladosType: lend.klados } : {}),
      from: new Date(`${lend.from}T00:00:00`).toISOString(),
      to: new Date(`${lend.to}T23:59:59`).toISOString(),
    });
    lendDialog.value = false;
    await load();
    emit('changed');
    $q.notify({ type: 'positive', message: 'Ο δανεισμός καταχωρήθηκε.' });
  } catch (err) {
    lendError.value =
      err instanceof ApiError && err.status === 409
        ? (err.payload as { message?: string }).message ?? 'Δεν επαρκεί το απόθεμα.'
        : err instanceof ApiError
          ? err.message
          : 'Αποτυχία.';
  } finally {
    busy.value = false;
  }
}

// ── Επιστροφή ──
const returnDialog = ref(false);
const returning = ref<Checkout | null>(null);
const ret = reactive({ returnedQty: 0, condition: 'KALI' as ReturnCondition, note: '' });

function openReturn(c: Checkout): void {
  returning.value = c;
  ret.returnedQty = c.qty;
  ret.condition = 'KALI';
  ret.note = '';
  returnDialog.value = true;
}

async function submitReturn(): Promise<void> {
  if (!returning.value) return;
  busy.value = true;
  try {
    await patch(`/yliko/checkouts/${returning.value.id}/return`, {
      returnedQty: ret.returnedQty,
      condition: ret.condition,
      note: ret.note || undefined,
    });
    returnDialog.value = false;
    await load();
    emit('changed');
    $q.notify({ type: 'positive', message: 'Η επιστροφή καταχωρήθηκε.' });
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
  } finally {
    busy.value = false;
  }
}

// ── Συντήρηση ──
const showMaintForm = ref(false);
const maint = reactive({
  kind: 'DAMAGE' as MaintenanceKind,
  note: '',
  cost: null as number | null,
  date: toISODate(new Date()),
});

function toggleMaintForm(): void {
  if (showMaintForm.value) {
    showMaintForm.value = false;
    return;
  }
  Object.assign(maint, {
    kind: 'DAMAGE',
    note: '',
    cost: null,
    date: toISODate(new Date()),
  });
  showMaintForm.value = true;
}

async function submitMaintenance(): Promise<void> {
  if (!maint.note.trim()) {
    $q.notify({ type: 'warning', message: 'Συμπλήρωσε περιγραφή.' });
    return;
  }
  // Το κόστος μετράει μόνο στην επιδιόρθωση· χρεώνεται αυτόματα στην εμβέλεια
  // της σελίδας (κλάδος ή Τοπικό).
  const cost = maint.kind === 'REPAIR' && maint.cost != null && maint.cost > 0 ? maint.cost : undefined;
  busy.value = true;
  try {
    await post(`/yliko/${props.ylikoId}/maintenance`, {
      kind: maint.kind,
      note: maint.note.trim(),
      cost,
      chargeToKladosType: cost != null && props.scopeKlados ? props.scopeKlados : undefined,
      date: maint.date || undefined,
    });
    showMaintForm.value = false;
    await load();
    emit('changed');
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
  } finally {
    busy.value = false;
  }
}

function removeMaintenance(id: string): void {
  $q.dialog({
    title: 'Διαγραφή σημείωσης',
    message: 'Να διαγραφεί η σημείωση;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/yliko/maintenance/${id}`);
      await load();
      emit('changed');
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
    }
  });
}
</script>

<style scoped>
/* Η φόρμα νέας σημείωσης ξεχωρίζει διακριτικά με το χρώμα του κλάδου. */
.maint-form {
  border-color: color-mix(in srgb, var(--klados-color) 35%, transparent);
  background: color-mix(in srgb, var(--klados-color) 5%, var(--q-card-bg, #fff));
}

/* Ενημέρωση για το ταμείο που χρεώνεται η επισκευή — όχι πεδίο, απλή γραμμή. */
.charge-note {
  font-size: 0.8rem;
  color: var(--klados-ink);
}
</style>
