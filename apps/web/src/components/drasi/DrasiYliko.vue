<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn-toggle
        v-model="view"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="[
          { label: `Αγορές (${list?.shopping.length ?? 0})`, value: 'shopping' },
          { label: `Από τις αποθήκες (${list?.checkouts.length ?? 0})`, value: 'checkouts' },
          { label: `Φέρνουν άλλοι (${list?.external.length ?? 0})`, value: 'external' },
        ]"
      />
      <q-space />
      <q-btn flat color="klados" icon="print" label="Λίστα φόρτωσης" :disable="!total" @click="printList" />
    </div>

    <q-inner-loading :showing="loading" />

    <!-- ── Αγορές ── -->
    <template v-if="view === 'shopping'">
      <q-card v-if="canWrite" flat bordered class="q-pa-sm q-mb-md">
        <div class="row q-col-gutter-sm items-start">
          <div class="col-12 col-sm-4"><q-input v-model="shopForm.name" label="Τι θα αγοραστεί" outlined dense color="klados" @keyup.enter="addShopping" /></div>
          <div class="col-4 col-sm-1"><q-input v-model.number="shopForm.qty" type="number" label="Ποσ." outlined dense :min="1" color="klados" /></div>
          <div class="col-8 col-sm-2"><q-input v-model.number="shopForm.estimatedCost" type="number" label="Εκτίμηση €" outlined dense :min="0" step="0.01" color="klados" /></div>
          <div class="col-12 col-sm-4"><StelexosPicker v-model="shopForm.assignee" label="Ποιος το αγοράζει" :options="stelexiOptions" /></div>
          <div class="col-12 col-sm-1 row items-center">
            <q-btn round dense color="klados" text-color="klados-on" icon="add" :disable="!shopForm.name.trim()" :loading="saving" @click="addShopping" />
          </div>
        </div>
      </q-card>

      <div v-if="list && !list.shopping.length" class="text-center text-grey-6 q-pa-lg">Καμία αγορά στη λίστα.</div>
      <q-list v-else-if="list" bordered separator class="rounded-borders">
        <q-item v-for="s in list.shopping" :key="s.id">
          <q-item-section avatar>
            <q-icon :name="s.purchasedAt ? 'check_circle' : 'shopping_cart'" :color="s.purchasedAt ? 'positive' : 'grey-6'" />
          </q-item-section>
          <q-item-section>
            <q-item-label :class="s.purchasedAt ? 'text-grey-7' : ''">{{ s.name }} <span class="text-grey-6">× {{ s.qty }}</span></q-item-label>
            <q-item-label caption>
              <span v-if="s.assignee">{{ s.assignee.lastName }} {{ s.assignee.firstName }}</span>
              <span v-if="s.estimatedCost !== null"> · εκτίμηση {{ formatEuro(s.estimatedCost) }}</span>
              <span v-if="s.treasuryEntry" class="text-negative"> · έξοδο {{ formatEuro(s.treasuryEntry.amount) }} ({{ TREASURY_CATEGORY_LABEL[s.treasuryEntry.category] }})</span>
              <span v-if="s.yliko" class="text-positive"> · στην αποθήκη</span>
              <span v-if="s.note"> · {{ s.note }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section v-if="canWrite" side>
            <div class="row no-wrap">
              <q-btn v-if="!s.purchasedAt" dense flat color="klados" icon="paid" label="Αγοράστηκε" @click="openPurchase(s)" />
              <q-btn v-if="!s.treasuryEntry" dense flat round icon="delete" color="negative" @click="removeShopping(s)" />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </template>

    <!-- ── Από τις αποθήκες ── -->
    <template v-else-if="view === 'checkouts'">
      <div class="row items-center q-mb-sm">
        <div class="text-caption text-grey-7 col">Δεσμεύσεις από τις αποθήκες του Τοπικού για τις ημέρες της δράσης.</div>
        <q-btn v-if="canWrite" color="klados" text-color="klados-on" unelevated icon="inventory_2" label="Δέσμευση" @click="openReserve" />
      </div>
      <div v-if="list && !list.checkouts.length" class="text-center text-grey-6 q-pa-lg">Καμία δέσμευση.</div>
      <q-list v-else-if="list" bordered separator class="rounded-borders">
        <q-item v-for="c in list.checkouts" :key="c.id">
          <q-item-section avatar>
            <q-avatar size="30px" :style="kladosVars(c.kladosType)" :class="c.kladosType ? 'bg-klados text-klados-on' : 'bg-grey-4'"><q-icon name="inventory_2" size="16px" /></q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ c.name }}</q-item-label>
            <q-item-label caption>{{ c.qty }} {{ c.unit ?? '' }} · {{ c.kladosType ? KLADOS_LABEL[c.kladosType] : 'Κεντρική αποθήκη' }}</q-item-label>
          </q-item-section>
          <q-item-section side><q-badge :label="CHECKOUT_STATUS_LABEL[c.status]" /></q-item-section>
        </q-item>
      </q-list>
    </template>

    <!-- ── Φέρνουν άλλοι ── -->
    <template v-else>
      <q-card v-if="canWrite" flat bordered class="q-pa-sm q-mb-md">
        <div class="row q-col-gutter-sm items-start">
          <div class="col-12 col-sm-4"><q-input v-model="extForm.name" label="Τι φέρνουν" outlined dense color="klados" @keyup.enter="addExternal" /></div>
          <div class="col-4 col-sm-1"><q-input v-model.number="extForm.qty" type="number" label="Ποσ." outlined dense :min="1" color="klados" /></div>
          <div class="col-8 col-sm-3">
            <q-select v-model="extForm.owner" :options="ownerOptions" label="Ποιος το φέρνει" outlined dense emit-value map-options color="klados" />
          </div>
          <div class="col-12 col-sm-3"><StelexosPicker v-model="extForm.responsible" label="Υπεύθυνο στέλεχος" :options="stelexiOptions" /></div>
          <div class="col-12 col-sm-1 row items-center">
            <q-btn round dense color="klados" text-color="klados-on" icon="add" :disable="!extForm.name.trim()" :loading="saving" @click="addExternal" />
          </div>
        </div>
      </q-card>
      <div v-if="list && !list.external.length" class="text-center text-grey-6 q-pa-lg">Τίποτα από άλλους.</div>
      <q-list v-else-if="list" bordered separator class="rounded-borders">
        <q-item v-for="x in list.external" :key="x.id">
          <q-item-section avatar>
            <q-icon :name="x.returnedAt ? 'assignment_return' : 'luggage'" :color="x.returnedAt ? 'positive' : 'grey-7'" />
          </q-item-section>
          <q-item-section>
            <q-item-label :class="x.returnedAt ? 'text-grey-7' : ''">{{ x.name }} <span class="text-grey-6">× {{ x.qty }}</span></q-item-label>
            <q-item-label caption>
              {{ ownerLabel(x) }}
              <span v-if="x.responsible"> · {{ x.responsible.lastName }} {{ x.responsible.firstName }}</span>
              <span v-if="x.returnedAt" class="text-positive"> · επιστράφηκε {{ formatDate(x.returnedAt) }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section v-if="canWrite" side>
            <div class="row no-wrap items-center">
              <q-toggle :model-value="!!x.returnedAt" dense color="positive" label="Επιστράφηκε" @update:model-value="(v: boolean) => toggleReturned(x, v)" />
              <q-btn dense flat round icon="delete" color="negative" @click="removeExternal(x)" />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </template>

    <!-- ── Αγοράστηκε ── -->
    <q-dialog v-model="purchaseDialog">
      <q-card style="min-width: min(420px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Αγοράστηκε — {{ purchaseTarget?.name }}</q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model.number="purchase.amount" type="number" label="Ποσό € *" outlined dense :min="0" step="0.01" color="klados" autofocus />
          <q-select v-model="purchase.category" :options="categoryOptions" label="Κατηγορία εξόδου" outlined dense emit-value map-options color="klados" />
          <q-file v-model="purchase.file" label="Απόδειξη" outlined dense clearable accept="image/*,application/pdf" :max-file-size="MAX_RECEIPT_BYTES" color="klados" />
          <q-toggle v-model="purchase.keepAsYliko" color="klados" label="Μένει στην αποθήκη μετά τη δράση (γίνεται είδος)" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Καταχώρηση εξόδου" :loading="saving" @click="submitPurchase" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Δέσμευση από αποθήκη ── -->
    <q-dialog v-model="reserveDialog">
      <q-card style="min-width: min(480px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Δέσμευση υλικού για τη δράση</q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-select
            v-model="reserve.ylikoId"
            :options="ylikoOptions"
            label="Είδος"
            outlined
            dense
            use-input
            emit-value
            map-options
            color="klados"
            input-debounce="300"
            @filter="filterYliko"
          >
            <template #option="{ itemProps, opt }">
              <q-item v-bind="itemProps">
                <q-item-section>
                  <q-item-label>{{ opt.label }}</q-item-label>
                  <q-item-label caption>{{ opt.caption }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-input v-model.number="reserve.qty" type="number" label="Ποσότητα" outlined dense :min="1" color="klados" />
          <div class="text-caption text-grey-7">Διάστημα: {{ formatDate(dateStart) }} – {{ formatDate(dateEnd) }} (οι ημέρες της δράσης).</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Δέσμευση" :disable="!reserve.ylikoId || !reserve.qty" :loading="saving" @click="submitReserve" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Λίστα φόρτωσης (εκτυπώσιμη) ── -->
    <div ref="sheet" class="loading-sheet" style="display: none">
      <h2>Λίστα φόρτωσης</h2>
      <template v-if="list">
        <h3 v-if="list.checkouts.length">Από τις αποθήκες</h3>
        <ul><li v-for="c in list.checkouts" :key="c.id">☐ {{ c.name }} × {{ c.qty }} {{ c.unit ?? '' }} <small>({{ c.kladosType ? KLADOS_LABEL[c.kladosType] : 'κεντρική' }})</small></li></ul>
        <h3 v-if="list.shopping.length">Αγορές</h3>
        <ul><li v-for="s in list.shopping" :key="s.id">☐ {{ s.name }} × {{ s.qty }} <small v-if="s.assignee">({{ s.assignee.lastName }} {{ s.assignee.firstName }})</small></li></ul>
        <h3 v-if="list.external.length">Φέρνουν άλλοι — να επιστραφούν</h3>
        <ul><li v-for="x in list.external" :key="x.id">☐ {{ x.name }} × {{ x.qty }} <small>({{ ownerLabel(x) }})</small></li></ul>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  CHECKOUT_STATUS_LABEL,
  DRASI_EXPENSE_CATEGORIES,
  KLADOS_LABEL,
  MAX_RECEIPT_BYTES,
  TREASURY_CATEGORY_LABEL,
  type DrasiExternalYlikoView,
  type DrasiGuestTopikoView,
  type DrasiLoadingList,
  type DrasiShoppingItemView,
  type KladosType,
  type MemberSummary,
  type Paginated,
  type YlikoAvailability,
} from '@trifylli/shared';
import StelexosPicker from '../StelexosPicker.vue';
import { ApiError, del, get, patch, post, upload } from '../../lib/api';
import { formatDate, formatEuro } from '../../lib/format';
import { kladosVars } from '../../lib/klados-theme';
import { printElement } from '../../lib/print';

const props = defineProps<{
  drasiId: string;
  organiser: KladosType | null;
  kladoi: KladosType[];
  guestTopika: DrasiGuestTopikoView[];
  dateStart: string;
  dateEnd: string;
  canWrite: boolean;
}>();

const $q = useQuasar();
const view = ref<'shopping' | 'checkouts' | 'external'>('shopping');
const loading = ref(false);
const saving = ref(false);
const list = ref<DrasiLoadingList | null>(null);
const sheet = ref<HTMLElement | null>(null);
const total = computed(() => (list.value ? list.value.shopping.length + list.value.checkouts.length + list.value.external.length : 0));

async function reload(): Promise<void> {
  loading.value = true;
  try {
    list.value = await get<DrasiLoadingList>(`/draseis/${props.drasiId}/yliko/loading-list`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης υλικού.');
  } finally {
    loading.value = false;
  }
}

const stelexi = ref<MemberSummary[]>([]);
const stelexiOptions = computed(() => stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })));
onMounted(async () => {
  await reload();
  try {
    stelexi.value = (await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } })).items;
  } catch {
    // Χωρίς στελέχη οι pickers μένουν άδειοι.
  }
});

// ── Αγορές ──
const shopForm = reactive({ name: '', qty: 1, estimatedCost: null as number | null, assignee: [] as string[] });
async function addShopping(): Promise<void> {
  if (!shopForm.name.trim()) return;
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/yliko/shopping`, {
      name: shopForm.name.trim(),
      qty: shopForm.qty || 1,
      ...(shopForm.estimatedCost !== null && (shopForm.estimatedCost as unknown) !== '' ? { estimatedCost: shopForm.estimatedCost } : {}),
      ...(shopForm.assignee[0] ? { assigneeId: shopForm.assignee[0] } : {}),
    });
    Object.assign(shopForm, { name: '', qty: 1, estimatedCost: null });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  } finally {
    saving.value = false;
  }
}
async function removeShopping(s: DrasiShoppingItemView): Promise<void> {
  try {
    await del(`/draseis/${props.drasiId}/yliko/shopping/${s.id}`);
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία διαγραφής.');
  }
}
const purchaseDialog = ref(false);
const purchaseTarget = ref<DrasiShoppingItemView | null>(null);
const purchase = reactive({ amount: null as number | null, category: 'PROGRAMMA', file: null as File | null, keepAsYliko: false });
const categoryOptions = DRASI_EXPENSE_CATEGORIES.map((c) => ({ label: TREASURY_CATEGORY_LABEL[c] ?? c, value: c }));
function openPurchase(s: DrasiShoppingItemView): void {
  purchaseTarget.value = s;
  Object.assign(purchase, { amount: s.estimatedCost, category: 'PROGRAMMA', file: null, keepAsYliko: false });
  purchaseDialog.value = true;
}
async function submitPurchase(): Promise<void> {
  if (!purchaseTarget.value || !purchase.amount || purchase.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Συμπλήρωσε ποσό.' });
    return;
  }
  saving.value = true;
  try {
    let receiptFileId: string | undefined;
    if (purchase.file) {
      const ref = await upload<{ id: string }>('/files', purchase.file, { purpose: 'RECEIPT', ...(props.organiser ? { kladosType: props.organiser } : {}) });
      receiptFileId = ref.id;
    }
    await post(`/draseis/${props.drasiId}/yliko/shopping/${purchaseTarget.value.id}/purchase`, {
      amount: purchase.amount,
      category: purchase.category,
      receiptFileId,
      keepAsYliko: purchase.keepAsYliko,
    });
    purchaseDialog.value = false;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία καταχώρησης.');
  } finally {
    saving.value = false;
  }
}

// ── Δέσμευση ──
const reserveDialog = ref(false);
const reserve = reactive({ ylikoId: null as string | null, qty: 1 });
const ylikoOptions = ref<{ label: string; value: string; caption: string }[]>([]);
function openReserve(): void {
  Object.assign(reserve, { ylikoId: null, qty: 1 });
  reserveDialog.value = true;
}
async function filterYliko(needle: string, update: (fn: () => void) => void): Promise<void> {
  try {
    const page = await get<Paginated<YlikoAvailability>>('/yliko', {
      params: {
        pageSize: 50,
        from: props.dateStart,
        to: props.dateEnd,
        ...(props.organiser ? { klados: props.organiser } : {}),
        ...(needle ? { q: needle } : {}),
      },
    });
    update(() => {
      ylikoOptions.value = page.items.map((y) => ({
        label: y.name,
        value: y.ylikoId,
        caption: `διαθέσιμα ${y.availableQty}/${y.totalQty}${y.ownerKladosType ? ` · ${KLADOS_LABEL[y.ownerKladosType]}` : ' · κεντρική'}`,
      }));
    });
  } catch {
    update(() => {
      ylikoOptions.value = [];
    });
  }
}
async function submitReserve(): Promise<void> {
  saving.value = true;
  try {
    await post('/yliko/checkouts', {
      ylikoId: reserve.ylikoId,
      qty: reserve.qty,
      drasiId: props.drasiId,
      ...(props.organiser ? { kladosType: props.organiser } : {}),
      from: props.dateStart,
      to: props.dateEnd,
    });
    reserveDialog.value = false;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία δέσμευσης.');
  } finally {
    saving.value = false;
  }
}

// ── Φέρνουν άλλοι ──
const ownerOptions = computed(() => [
  ...props.kladoi.map((k) => ({ label: KLADOS_LABEL[k], value: `k:${k}` })),
  ...props.guestTopika.map((g) => ({ label: g.topikoName, value: `g:${g.id}` })),
]);
const extForm = reactive({ name: '', qty: 1, owner: '' as string, responsible: [] as string[] });
function ownerLabel(x: DrasiExternalYlikoView): string {
  return x.owner.guestTopiko?.name ?? (x.owner.kladosType ? KLADOS_LABEL[x.owner.kladosType] : 'άλλος');
}
async function addExternal(): Promise<void> {
  if (!extForm.name.trim()) return;
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/yliko/external`, {
      name: extForm.name.trim(),
      qty: extForm.qty || 1,
      ...(extForm.owner.startsWith('k:') ? { kladosType: extForm.owner.slice(2) } : {}),
      ...(extForm.owner.startsWith('g:') ? { guestTopikoId: extForm.owner.slice(2) } : {}),
      ...(extForm.responsible[0] ? { responsibleId: extForm.responsible[0] } : {}),
    });
    Object.assign(extForm, { name: '', qty: 1 });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  } finally {
    saving.value = false;
  }
}
async function toggleReturned(x: DrasiExternalYlikoView, returned: boolean): Promise<void> {
  try {
    await patch(`/draseis/${props.drasiId}/yliko/external/${x.id}/returned`, { returned });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}
async function removeExternal(x: DrasiExternalYlikoView): Promise<void> {
  try {
    await del(`/draseis/${props.drasiId}/yliko/external/${x.id}`);
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία διαγραφής.');
  }
}

async function printList(): Promise<void> {
  if (!sheet.value) return;
  sheet.value.style.display = 'block';
  try {
    await printElement(sheet.value, 'Λίστα φόρτωσης');
  } finally {
    sheet.value.style.display = 'none';
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>

<style scoped>
@media print {
  .loading-sheet h2 { font-size: 20px; margin: 0 0 8px; }
  .loading-sheet h3 { font-size: 14px; margin: 12px 0 4px; }
  .loading-sheet ul { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .loading-sheet li { padding: 2px 0; border-bottom: 1px dotted #bbb; }
}
</style>
