<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="page-title">{{ inKlados ? `Υλικό — ${kladosLabel}` : 'Κεντρική αποθήκη' }}</div>
      <div class="q-gutter-sm" v-if="canManage">
        <q-btn outline no-caps color="klados" icon="warehouse" label="Σημεία αποθήκευσης" @click="openStorageSettings" />
        <q-btn color="klados" text-color="klados-on" no-caps icon="add" label="Νέο υλικό" @click="openCreate" />
      </div>
    </div>

    <!-- Το διάστημα είναι το κλειδί: «διαθέσιμο» χωρίς ημερομηνίες δεν σημαίνει
         τίποτα όταν το ίδιο υλικό ταξιδεύει από δράση σε δράση. -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-sm items-center">
        <div class="col-12 col-sm-3">
          <q-input v-model="filters.q" label="Αναζήτηση" dense outlined clearable debounce="300" />
        </div>
        <div class="col-6 col-sm-3">
          <q-select
            v-model="filters.category"
            :options="categoryOptions"
            label="Είδος"
            dense
            outlined
            emit-value
            map-options
            clearable
          />
        </div>
        <div class="col-6 col-sm-3">
          <q-input v-model="filters.from" type="date" label="Από" dense outlined />
        </div>
        <div class="col-6 col-sm-3">
          <q-input v-model="filters.to" type="date" label="Έως" dense outlined />
        </div>
      </q-card-section>
    </q-card>

    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!data?.items.length"
      empty-text="Δεν βρέθηκε υλικό."
      empty-icon="inventory_2"
      @retry="reload"
    >
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="item in data?.items" :key="item.ylikoId">
          <q-item-section avatar>
            <q-avatar :style="{ backgroundColor: avatarColor(item), color: readableOn(avatarColor(item)) }" size="36px">
              <q-icon :name="CATEGORY_ICON[item.category]" />
            </q-avatar>
          </q-item-section>

          <q-item-section>
            <q-item-label>{{ item.name }}</q-item-label>
            <q-item-label caption>
              {{ YLIKO_CATEGORY_LABEL[item.category] }}
              <span v-if="!inKlados">· {{ item.ownerKladosType ? KLADOS_LABEL[item.ownerKladosType] : 'Κεντρική αποθήκη' }}</span>
              <span v-if="item.storagePointName"> · <q-icon name="warehouse" size="14px" /> {{ item.storagePointName }}</span>
            </q-item-label>
          </q-item-section>

          <q-item-section side style="min-width: 120px">
            <div class="text-right">
              <div>
                <span class="text-weight-bold" :class="item.availableQty === 0 ? 'text-negative' : 'text-klados'">
                  {{ hasWindow ? item.availableQty : item.totalQty }}
                </span>
                <span class="text-grey-7"> / {{ item.totalQty }}</span>
              </div>
              <div v-if="hasWindow" class="text-caption text-grey-7">{{ item.reservedQty }} δεσμευμένα</div>
            </div>
          </q-item-section>

          <q-item-section side>
            <div class="row items-center">
              <q-btn dense flat round icon="info" @click="openDetail(item)">
                <q-tooltip>Καρτέλα & ιστορικό</q-tooltip>
              </q-btn>
              <q-btn v-if="canManage" dense flat round icon="edit" @click="openEdit(item)">
                <q-tooltip>Επεξεργασία</q-tooltip>
              </q-btn>
              <q-btn
                v-if="auth.can('yliko:checkout')"
                dense
                flat
                round
                icon="bookmark_add"
                color="klados"
                :disable="!hasWindow || item.availableQty === 0"
                @click="openCheckout(item)"
              >
                <q-tooltip>{{ hasWindow ? 'Δέσμευση' : 'Επιλέξτε πρώτα διάστημα' }}</q-tooltip>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>

    <!-- ── Δέσμευση ── -->
    <q-dialog v-model="checkoutDialog">
      <q-card style="min-width: 340px">
        <q-card-section class="text-h6">Δέσμευση υλικού</q-card-section>
        <q-card-section>
          <div class="text-body1 q-mb-sm">{{ selected?.name }}</div>
          <div class="text-caption text-grey-7 q-mb-md">
            Διαθέσιμα {{ selected?.availableQty }} από {{ selected?.totalQty }} για {{ filters.from }} – {{ filters.to }}
          </div>
          <q-input v-model.number="checkoutQty" type="number" label="Ποσότητα" outlined dense :min="1" :max="selected?.availableQty ?? 1" />
          <q-select v-model="checkoutKlados" :options="kladosOptions" label="Για τον κλάδο" outlined dense emit-value map-options clearable class="q-mt-md" />
        </q-card-section>

        <q-card-section v-if="conflict" class="bg-red-1">
          <div class="text-negative text-weight-medium">{{ conflict.message }}</div>
          <q-list dense>
            <q-item v-for="(b, index) in conflict.blockedBy" :key="index">
              <q-item-section><q-item-label caption>{{ b.label }} — {{ b.qty }} τεμ.</q-item-label></q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Δέσμευση" :loading="saving" @click="submitCheckout" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Νέο / επεξεργασία υλικού ── -->
    <q-dialog v-model="ylikoDialog">
      <q-card style="min-width: min(440px, 92vw)">
        <q-card-section class="text-h6">{{ editingId ? 'Επεξεργασία υλικού' : 'Νέο υλικό' }}</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model="ylikoForm.name" label="Όνομα *" outlined dense />
          <div class="row q-col-gutter-sm">
            <div class="col-7">
              <q-select v-model="ylikoForm.category" :options="categoryOptions" label="Είδος *" outlined dense emit-value map-options />
            </div>
            <div class="col-5">
              <q-input v-model.number="ylikoForm.totalQty" type="number" label="Ποσότητα *" outlined dense :min="0" />
            </div>
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model="ylikoForm.unit" label="Μονάδα (π.χ. τεμ.)" outlined dense />
            </div>
            <div class="col-6">
              <q-select
                v-model="ylikoForm.storagePointId"
                :options="storagePointOptions"
                label="Σημείο αποθήκευσης"
                outlined
                dense
                emit-value
                map-options
                clearable
              >
                <template #after>
                  <q-btn v-if="canManage" flat dense round color="klados" icon="add" @click="openStorageSettings">
                    <q-tooltip>Διαχείριση σημείων</q-tooltip>
                  </q-btn>
                </template>
              </q-select>
            </div>
          </div>
          <q-toggle v-model="ylikoForm.consumable" label="Αναλώσιμο (η παραλαβή μειώνει μόνιμα το απόθεμα)" />
          <q-input v-model="ylikoForm.notes" label="Σημειώσεις" outlined dense type="textarea" autogrow />
        </q-card-section>
        <q-card-section v-if="ylikoError" class="bg-red-1 text-negative">{{ ylikoError }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" :label="editingId ? 'Αποθήκευση' : 'Προσθήκη'" :loading="ylikoSaving" @click="saveYliko" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Σημεία αποθήκευσης (settings) ── -->
    <q-dialog v-model="storageDialog">
      <q-card style="min-width: min(440px, 92vw)">
        <q-card-section class="text-h6">Σημεία αποθήκευσης</q-card-section>
        <q-card-section>
          <q-list v-if="storagePoints.length" bordered separator class="rounded-borders q-mb-md">
            <q-item v-for="p in storagePoints" :key="p.id">
              <q-item-section avatar><q-icon name="warehouse" color="grey-7" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ p.name }}</q-item-label>
                <q-item-label caption>{{ p.kladosType ? KLADOS_LABEL[p.kladosType] : 'Κεντρικό' }}</q-item-label>
              </q-item-section>
              <q-item-section side v-if="pointEditable(p)">
                <div class="row">
                  <q-btn flat dense round icon="edit" @click="renamePoint(p)" />
                  <q-btn flat dense round icon="delete" color="negative" @click="archivePoint(p)" />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-grey-6 q-mb-md">Δεν υπάρχουν σημεία ακόμη.</div>

          <div class="row q-gutter-sm items-center">
            <q-input v-model="newPointName" label="Νέο σημείο" outlined dense class="col" @keyup.enter="addPoint" />
            <q-btn color="klados" text-color="klados-on" no-caps icon="add" label="Προσθήκη" :loading="pointSaving" @click="addPoint" />
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Κλείσιμο" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Καρτέλα & ιστορικό υλικού ── -->
    <q-dialog v-model="detailDialog">
      <q-card style="min-width: min(560px, 94vw)">
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-subtitle1 text-weight-medium">Καρτέλα υλικού</div>
          <q-btn flat dense round icon="close" v-close-popup />
        </q-card-section>
        <q-card-section>
          <YlikoDetail v-if="detailId" :yliko-id="detailId" @changed="reload" />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  KLADOS_META,
  YLIKO_CATEGORY_LABEL,
  type CheckoutConflict,
  type KladosType,
  type Paginated,
  type StoragePoint,
  type YlikoAvailability,
  type YlikoCategory,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import YlikoDetail from '../components/YlikoDetail.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, del, get, patch, post } from '../lib/api';
import { readableOn } from '../lib/color';
import { toISODate } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { useKladosScope } from '../composables/useKladosScope';

const $q = useQuasar();
const auth = useAuthStore();
const { klados: routeKlados, inKlados, label: kladosLabel } = useKladosScope();

/** Διαχείριση: ο κλάδος του διαχειριστή του, ή η κεντρική αποθήκη για τον υπερδιαχειριστή. */
const canManage = computed(() =>
  routeKlados.value ? auth.can('yliko:manage', routeKlados.value) : auth.isSuperAdmin,
);

const today = new Date();
const inAWeek = new Date(today);
inAWeek.setDate(inAWeek.getDate() + 7);

const filters = reactive({
  q: '',
  category: null as YlikoCategory | null,
  from: toISODate(today),
  to: toISODate(inAWeek),
});

const hasWindow = computed(() => Boolean(filters.from && filters.to && filters.from < filters.to));

// Μόνο λειτουργικά/προγραμματικά εδώ — το φαρμακείο έχει δική του οθόνη.
const categoryOptions = [
  { value: 'LEITOURGIKO', label: YLIKO_CATEGORY_LABEL.LEITOURGIKO },
  { value: 'PROGRAMMATIKO', label: YLIKO_CATEGORY_LABEL.PROGRAMMATIKO },
];
const kladosOptions = computed(() => auth.kladoi.map((k) => ({ label: k.label, value: k.type })));

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<Paginated<YlikoAvailability>>('/yliko', {
      params: {
        pageSize: 200,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(routeKlados.value ? { klados: routeKlados.value } : {}),
        ...(hasWindow.value
          ? {
              from: new Date(`${filters.from}T00:00:00`).toISOString(),
              to: new Date(`${filters.to}T23:59:59`).toISOString(),
            }
          : {}),
      },
    }),
  { cacheKey: 'yliko', watchSources: [filters, routeKlados] },
);

// ── Σημεία αποθήκευσης ──
const storagePoints = ref<StoragePoint[]>([]);
let storageLoaded = false;
async function loadStoragePoints(): Promise<void> {
  storagePoints.value = await get<StoragePoint[]>('/yliko/storage-points', {
    params: routeKlados.value ? { klados: routeKlados.value } : {},
  });
  storageLoaded = true;
}
async function ensureStoragePoints(): Promise<void> {
  if (!storageLoaded) await loadStoragePoints();
}
const storagePointOptions = computed(() =>
  storagePoints.value.map((p) => ({ value: p.id, label: p.kladosType ? p.name : `${p.name} (κεντρικό)` })),
);
function pointEditable(p: StoragePoint): boolean {
  return p.kladosType !== null || auth.isSuperAdmin;
}

const storageDialog = ref(false);
const newPointName = ref('');
const pointSaving = ref(false);

async function openStorageSettings(): Promise<void> {
  storageDialog.value = true;
  await loadStoragePoints();
}

async function addPoint(): Promise<void> {
  if (!newPointName.value.trim()) return;
  pointSaving.value = true;
  try {
    await post('/yliko/storage-points', {
      name: newPointName.value.trim(),
      ...(routeKlados.value ? { kladosType: routeKlados.value } : {}),
    });
    newPointName.value = '';
    await loadStoragePoints();
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία προσθήκης.' });
  } finally {
    pointSaving.value = false;
  }
}

function renamePoint(p: StoragePoint): void {
  $q.dialog({
    title: 'Μετονομασία',
    prompt: { model: p.name, type: 'text' },
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Αποθήκευση' },
  }).onOk(async (name: string) => {
    if (!name.trim()) return;
    try {
      await patch(`/yliko/storage-points/${p.id}`, { name: name.trim() });
      await loadStoragePoints();
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
    }
  });
}

function archivePoint(p: StoragePoint): void {
  $q.dialog({
    title: 'Διαγραφή σημείου',
    message: `Να διαγραφεί «${p.name}»; Το υλικό που το δείχνει θα μείνει χωρίς σημείο.`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/yliko/storage-points/${p.id}`);
      await loadStoragePoints();
      await reload();
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία διαγραφής.' });
    }
  });
}

// ── Νέο / επεξεργασία υλικού ──
const ylikoDialog = ref(false);
const editingId = ref<string | null>(null);
const ylikoSaving = ref(false);
const ylikoError = ref<string | null>(null);
const ylikoForm = reactive({
  name: '',
  category: 'LEITOURGIKO' as YlikoCategory,
  totalQty: 1,
  unit: '',
  storagePointId: null as string | null,
  consumable: false,
  notes: '',
});

function resetForm(): void {
  Object.assign(ylikoForm, {
    name: '',
    category: 'LEITOURGIKO',
    totalQty: 1,
    unit: '',
    storagePointId: null,
    consumable: false,
    notes: '',
  });
}

async function openCreate(): Promise<void> {
  editingId.value = null;
  resetForm();
  ylikoError.value = null;
  ylikoDialog.value = true;
  await ensureStoragePoints();
}

interface YlikoFull {
  name: string;
  category: YlikoCategory;
  totalQty: number;
  unit: string | null;
  storagePointId: string | null;
  consumable: boolean;
  notes: string | null;
}

async function openEdit(item: YlikoAvailability): Promise<void> {
  editingId.value = item.ylikoId;
  ylikoError.value = null;
  await ensureStoragePoints();
  try {
    const full = await get<YlikoFull>(`/yliko/${item.ylikoId}`);
    Object.assign(ylikoForm, {
      name: full.name,
      category: full.category,
      totalQty: full.totalQty,
      unit: full.unit ?? '',
      storagePointId: full.storagePointId ?? null,
      consumable: full.consumable ?? false,
      notes: full.notes ?? '',
    });
    ylikoDialog.value = true;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης.' });
  }
}

async function saveYliko(): Promise<void> {
  if (!ylikoForm.name.trim()) {
    ylikoError.value = 'Συμπλήρωσε όνομα.';
    return;
  }
  ylikoSaving.value = true;
  ylikoError.value = null;
  const payload = {
    name: ylikoForm.name.trim(),
    category: ylikoForm.category,
    totalQty: ylikoForm.totalQty,
    unit: ylikoForm.unit || undefined,
    storagePointId: ylikoForm.storagePointId ?? undefined,
    consumable: ylikoForm.consumable,
    notes: ylikoForm.notes || undefined,
    ...(routeKlados.value ? { kladosType: routeKlados.value } : {}),
  };
  try {
    if (editingId.value) await patch(`/yliko/${editingId.value}`, payload);
    else await post('/yliko', payload);
    ylikoDialog.value = false;
    await reload();
    $q.notify({ type: 'positive', message: editingId.value ? 'Το υλικό ενημερώθηκε.' : 'Το υλικό προστέθηκε.' });
  } catch (err) {
    ylikoError.value = err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.';
  } finally {
    ylikoSaving.value = false;
  }
}

// ── Καρτέλα & ιστορικό ──
const detailDialog = ref(false);
const detailId = ref<string | null>(null);
function openDetail(item: YlikoAvailability): void {
  detailId.value = item.ylikoId;
  detailDialog.value = true;
}

// ── Δέσμευση ──
const checkoutDialog = ref(false);
const selected = ref<YlikoAvailability | null>(null);
const checkoutQty = ref(1);
const checkoutKlados = ref<KladosType | null>(null);
const conflict = ref<(CheckoutConflict & { message: string }) | null>(null);
const saving = ref(false);

function openCheckout(item: YlikoAvailability): void {
  selected.value = item;
  checkoutQty.value = 1;
  conflict.value = null;
  checkoutKlados.value =
    routeKlados.value ?? (auth.kladoi.length === 1 ? (auth.kladoi[0]?.type ?? null) : null);
  checkoutDialog.value = true;
}

async function submitCheckout(): Promise<void> {
  if (!selected.value) return;
  saving.value = true;
  conflict.value = null;
  try {
    await post('/yliko/checkouts', {
      ylikoId: selected.value.ylikoId,
      qty: checkoutQty.value,
      from: new Date(`${filters.from}T00:00:00`).toISOString(),
      to: new Date(`${filters.to}T23:59:59`).toISOString(),
      ...(checkoutKlados.value ? { kladosType: checkoutKlados.value } : {}),
    });
    checkoutDialog.value = false;
    await reload();
    $q.notify({ type: 'positive', message: 'Η δέσμευση καταχωρήθηκε.' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      conflict.value = err.payload as CheckoutConflict & { message: string };
    } else {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία δέσμευσης.' });
    }
  } finally {
    saving.value = false;
  }
}

const CATEGORY_ICON: Record<YlikoCategory, string> = {
  LEITOURGIKO: 'construction',
  PROGRAMMATIKO: 'palette',
  FARMAKEIO: 'medical_services',
};

// Το χρώμα του avatar ακολουθεί τον κλάδο στον οποίο ανήκει το υλικό· τα
// κεντρικά (χωρίς κλάδο) κρατούν ένα χρώμα ανά είδος, για να ξεχωρίζουν.
const CATEGORY_HEX: Record<YlikoCategory, string> = {
  LEITOURGIKO: '#6d4c41',
  PROGRAMMATIKO: '#3949ab',
  FARMAKEIO: '#c62828',
};

function avatarColor(item: YlikoAvailability): string {
  return item.ownerKladosType ? KLADOS_META[item.ownerKladosType].color : CATEGORY_HEX[item.category];
}
</script>
