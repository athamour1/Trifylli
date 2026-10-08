<template>
  <div>
    <q-inner-loading :showing="loading" />

    <!-- Ποια kits πάνε μαζί -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row items-center q-pb-xs">
        <div class="text-subtitle2 col">Φαρμακεία της δράσης</div>
        <q-btn v-if="canWrite" flat dense color="klados" icon="edit" label="Επιλογή" @click="openPick" />
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div v-if="!view?.assigned.length" class="text-caption text-grey-6">
          Κανένα φαρμακείο ακόμη. Διάλεξε από τα δικά σας ή όσα είναι δανεισμένα σε εσάς· για δανεισμό από
          άλλον κλάδο, ο κάτοχος το δανείζει από τη σελίδα «Φαρμακεία».
        </div>
        <!-- Μια κάρτα ανά φαρμακείο, με τα τρία κουμπιά της σελίδας του στο OuchTracker
             για γρήγορη πρόσβαση: ό,τι χρειάζεται στο πεδίο χωρίς ενδιάμεση οθόνη. -->
        <div v-else class="tf-card-grid" style="--tf-min: 290px">
          <div v-for="k in view.assigned" :key="k.id">
            <q-card flat bordered class="kit-card full-height column" :style="kladosVars(k.kladosType)">
              <q-card-section class="row items-center no-wrap q-pb-sm">
                <q-avatar size="34px" :class="k.kladosType ? 'bg-klados text-klados-on' : 'bg-grey-4'" icon="medical_services" class="q-mr-sm" />
                <div class="col ellipsis text-subtitle1 text-weight-medium">{{ k.name }}</div>
                <q-btn v-if="ouchBase" flat dense round size="sm" icon="open_in_new" color="klados" @click="openInOuch(k.ouchtrackerKitId)">
                  <q-tooltip>Η σελίδα του φαρμακείου στο OuchTracker</q-tooltip>
                </q-btn>
              </q-card-section>
              <q-card-section class="q-pt-none column kit-actions">
                <q-btn
                  unelevated no-caps color="negative" icon="warning" label="Καταχώρηση περιστατικού"
                  :disable="!ouchBase" @click="openInOuch(k.ouchtrackerKitId, 'incident')"
                />
                <q-btn
                  unelevated no-caps color="secondary" icon="inventory_2" label="Περιεχόμενο"
                  :disable="!ouchBase" @click="openInOuch(k.ouchtrackerKitId, 'contents')"
                />
                <q-btn
                  unelevated no-caps color="teal" icon="fact_check" label="Επιθεώρηση"
                  :disable="!ouchBase" @click="openInOuch(k.ouchtrackerKitId, 'inspect')"
                />
              </q-card-section>
              <q-card-section v-if="!ouchBase" class="q-pt-none text-caption text-grey-7">
                Δεν έχει οριστεί διεύθυνση OuchTracker.
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Σύνοψη υγείας -->
    <div class="row items-center q-mb-sm">
      <div class="text-subtitle2 col">
        Σύνοψη υγείας
        <span class="text-caption text-grey-7">— μόνο όσοι έχουν συμπληρωμένο έντυπο· κάθε ανάγνωση καταγράφεται</span>
      </div>
      <q-btn flat dense color="klados" icon="visibility" :label="health ? 'Ανανέωση' : 'Εμφάνιση'" :loading="healthLoading" @click="loadHealth" />
      <q-btn v-if="health?.length" flat dense color="klados" icon="print" label="Εκτύπωση" @click="printHealth" />
    </div>

    <div v-if="health && !health.length" class="text-grey-6 text-center q-pa-md">Κανένα συμπληρωμένο έντυπο υγείας ακόμη.</div>
    <div v-if="health?.length" ref="sheet" class="row q-col-gutter-sm health-sheet">
      <div v-for="h in health" :key="h.participantId" class="col-12 col-md-6">
        <q-card flat bordered class="health-card">
          <q-card-section class="q-py-sm">
            <div class="row items-center">
              <div class="text-subtitle2 col">{{ h.user.lastName }} {{ h.user.firstName }}</div>
              <span class="text-caption text-grey-7">
                <span v-if="h.user.kladosType">{{ KLADOS_LABEL[h.user.kladosType] }}</span>
                <span v-if="h.group"> · {{ h.group }}</span>
                <span v-if="h.skini"> · {{ h.skini }}</span>
              </span>
            </div>
            <div class="text-caption q-mt-xs">
              <div><b>Αλλεργίες:</b> {{ h.allergies || '—' }}</div>
              <div><b>Φάρμακα:</b> {{ h.medications || '—' }}</div>
              <div><b>Παθήσεις:</b> {{ h.conditions || '—' }}</div>
              <div v-if="h.diet"><b>Διατροφή:</b> {{ h.diet }}</div>
              <div v-if="h.bloodType"><b>Ομάδα αίματος:</b> {{ h.bloodType }}</div>
              <div><b>Έκτακτη ανάγκη:</b> <a :href="`tel:${h.emergencyPhone}`">{{ h.emergencyPhone || '—' }}</a></div>
              <div v-if="h.notes"><b>Σημειώσεις:</b> {{ h.notes }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ── Επιλογή kits ── -->
    <q-dialog v-model="pickDialog">
      <q-card style="min-width: min(420px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Φαρμακεία της δράσης</q-card-section>
        <q-card-section>
          <div v-if="!view?.candidates.length" class="text-caption text-grey-6">Κανένα φαρμακείο στην εμβέλεια του διοργανωτή.</div>
          <q-list v-else dense>
            <q-item v-for="k in view.candidates" :key="k.id" tag="label" clickable>
              <q-item-section side><q-checkbox v-model="picked" :val="k.id" color="klados" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ k.name }}</q-item-label>
                <q-item-label caption>{{ k.kladosType ? KLADOS_LABEL[k.kladosType] : 'Τοπικό' }}{{ k.borrowed ? ' · δανεισμένο σε εμάς' : '' }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Αποθήκευση" :loading="saving" @click="savePick" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { KLADOS_LABEL, type DrasiPharmacyView, type HealthSummaryEntry } from '@trifylli/shared';
import { ApiError, get, put } from '../../lib/api';
import { kladosVars } from '../../lib/klados-theme';
import { printElement } from '../../lib/print';
import { OUCHTRACKER_URL } from '../../lib/runtime-config';

const ouchBase = OUCHTRACKER_URL.replace(/\/$/, '');

/**
 * Οι σελίδες του OuchTracker για ένα φαρμακείο — ίδιες με τα τρία κουμπιά της
 * σελίδας του (KitLandingPage): περιστατικό, περιεχόμενο, επιθεώρηση.
 * Το `from=qr` φέρνει τον χρήστη πίσω στη σελίδα του φαρμακείου όταν τελειώσει.
 */
const OUCH_PATHS = {
  landing: (id: string) => `/kit/${id}`,
  incident: (id: string) => `/kit/${id}/incident?from=qr`,
  contents: (id: string) => `/my-kits/${id}`,
  inspect: (id: string) => `/my-kits/${id}/inspect?from=qr`,
} as const;

function openInOuch(kitId: string, page: keyof typeof OUCH_PATHS = 'landing'): void {
  if (ouchBase) window.open(`${ouchBase}${OUCH_PATHS[page](kitId)}`, '_blank', 'noopener');
}

const props = defineProps<{ drasiId: string; canWrite: boolean }>();
const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const view = ref<DrasiPharmacyView | null>(null);
const health = ref<HealthSummaryEntry[] | null>(null);
const healthLoading = ref(false);
const sheet = ref<HTMLElement | null>(null);

async function reload(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiPharmacyView>(`/draseis/${props.drasiId}/pharmacy`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης φαρμακείων.');
  } finally {
    loading.value = false;
  }
}
onMounted(reload);

const pickDialog = ref(false);
const picked = ref<string[]>([]);
function openPick(): void {
  picked.value = view.value?.assigned.map((a) => a.id) ?? [];
  pickDialog.value = true;
}
async function savePick(): Promise<void> {
  saving.value = true;
  try {
    view.value = await put<DrasiPharmacyView>(`/draseis/${props.drasiId}/pharmacy`, { kitIds: picked.value });
    pickDialog.value = false;
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    saving.value = false;
  }
}

async function loadHealth(): Promise<void> {
  healthLoading.value = true;
  try {
    health.value = await get<HealthSummaryEntry[]>(`/draseis/${props.drasiId}/health`);
  } catch (err) {
    notifyError(err, 'Αποτυχία ανάγνωσης.');
  } finally {
    healthLoading.value = false;
  }
}

async function printHealth(): Promise<void> {
  if (sheet.value) await printElement(sheet.value, 'Σύνοψη υγείας');
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>

<style scoped>
.kit-card {
  min-width: 0;
}
.kit-actions {
  gap: 8px;
}
/* Τα κουμπιά πιάνουν όλο το πλάτος της κάρτας και δεν ξεχειλίζουν: μία γραμμή,
   με αποσιωπητικά μόνο αν η κάρτα στενέψει πολύ. */
.kit-actions .q-btn {
  width: 100%;
  min-width: 0;
}
.kit-actions .q-btn :deep(.q-btn__content) {
  flex-wrap: nowrap;
  min-width: 0;
}
.kit-actions .q-btn :deep(.q-btn__content .block) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media print {
  .health-card {
    break-inside: avoid;
    border: 1px solid #999;
    margin-bottom: 8px;
  }
}
</style>
