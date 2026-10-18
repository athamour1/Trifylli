<template>
  <q-page padding>
    <div class="q-mb-md">
      <div class="text-caption text-grey-7">
        Συγχρονισμός μητρώου από το e-SEO και σύνδεση με το Ouchtracker.
      </div>
    </div>

    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <!-- ── e-SEO ── -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="int-head">
          <q-icon name="cloud_sync" size="36px" color="primary" class="int-head__icon" />
          <div class="col">
            <div class="text-subtitle1">e-SEO · Μητρώο μελών</div>
            <div class="text-caption text-grey-7">
              Αντλεί μέλη, στελέχη και στοιχεία επικοινωνίας από το eseo.seo.gr.
            </div>
          </div>
          <div class="int-head__actions">
            <q-btn
              color="primary"
              icon="sync"
              label="Συγχρονισμός τώρα"
              :loading="syncing"
              :disable="!data?.eseo.configured || !data?.eseo.topikoCode || !offline.online"
              @click="runSync"
            />
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section class="row items-center q-gutter-sm">
          <q-chip
            :color="data?.eseo.configured ? 'positive' : 'grey-5'"
            text-color="white"
            :icon="data?.eseo.configured ? 'check' : 'block'"
            :label="data?.eseo.configured ? 'Ρυθμισμένο' : 'Δεν έχει ρυθμιστεί'"
          />
          <q-chip
            :color="data?.eseo.enabled ? 'positive' : 'grey-5'"
            text-color="white"
            :icon="data?.eseo.enabled ? 'schedule' : 'schedule_off'"
            :label="data?.eseo.enabled ? 'Αυτόματος συγχρονισμός ενεργός' : 'Αυτόματος συγχρονισμός ανενεργός'"
          />
          <q-chip
            v-if="data?.eseo.webhookConfigured"
            color="secondary"
            text-color="white"
            icon="webhook"
            label="Webhook ενεργό"
          />
          <q-space />
          <div class="text-caption text-grey-7">
            Πρόγραμμα: {{ describeCron(data?.eseo.cron) }}
          </div>
        </q-card-section>

        <q-separator />

        <!-- Ο κωδικός του Τοπικού: με αυτόν ο συγχρονισμός βρίσκει τα μέλη του. -->
        <q-card-section class="row items-start q-gutter-sm">
          <q-input
            v-model="topikoCode"
            dense
            outlined
            label="Κωδικός Τοπικού στο e-SEO"
            hint="Ο αριθμός του Τοπικού στο eseo.seo.gr (π.χ. 35)"
            class="eseo-code"
            :maxlength="32"
            @keyup.enter="saveCode"
          />
          <q-btn flat color="primary" label="Αποθήκευση" :disable="!codeChanged" :loading="savingCode" class="q-mt-xs" @click="saveCode" />
        </q-card-section>

        <q-card-section v-if="data?.eseo.configured && !data.eseo.topikoCode" class="bg-orange-1 text-orange-10 text-body2">
          Χωρίς κωδικό Τοπικού ο συγχρονισμός δεν ξέρει ποια μέλη να φέρει — συμπλήρωσέ τον παραπάνω.
        </q-card-section>

        <q-card-section v-if="!data?.eseo.configured" class="bg-orange-1 text-orange-10 text-body2">
          Λείπουν οι ρυθμίσεις e-SEO από τον server (<code>ESEO_BASE_URL</code> και
          <code>ESEO_REFRESH_TOKEN</code>). Μέχρι να οριστούν, ο συγχρονισμός είναι
          ανενεργός.
        </q-card-section>

        <q-card-section v-else-if="!offline.online" class="text-caption text-grey-7">
          Ο χειροκίνητος συγχρονισμός χρειάζεται σύνδεση στο δίκτυο.
        </q-card-section>
      </q-card>

      <!-- Αποτέλεσμα τελευταίου χειροκίνητου συγχρονισμού -->
      <q-banner v-if="lastSummary" dense class="bg-green-1 text-green-10 q-mb-md rounded-borders">
        <template #avatar><q-icon name="task_alt" /></template>
        Ο συγχρονισμός ολοκληρώθηκε: {{ summaryLine(lastSummary) }}
        <div v-if="lastSummary.unmappedTypes.length" class="text-caption text-orange-10 q-mt-xs">
          Άγνωστοι τύποι μέλους (χωρίς τοποθέτηση σε κλάδο):
          {{ lastSummary.unmappedTypes.join(', ') }}
        </div>
      </q-banner>

      <!-- ── Ouchtracker ── -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="int-head">
          <q-icon name="medical_services" size="36px" color="grey-7" class="int-head__icon" />
          <div class="col">
            <div class="text-subtitle1">Ouchtracker · Φαρμακείο</div>
            <div class="text-caption text-grey-7">
              Απόθεμα φαρμακευτικού υλικού και ιατρικά περιστατικά.
            </div>
          </div>
          <div class="int-head__actions">
          <q-chip
            :color="data?.ouchtracker.configured ? 'positive' : 'grey-5'"
            text-color="white"
            :icon="data?.ouchtracker.configured ? 'check' : 'block'"
            :label="data?.ouchtracker.configured ? 'Ρυθμισμένο' : 'Δεν έχει ρυθμιστεί'"
          />
          <!-- Απευθείας άνοιγμα του διαχειριστικού OuchTracker (SSO: μπαίνει με
               τον ίδιο λογαριασμό, χωρίς δεύτερη σύνδεση). Χρήσιμο όταν δεν
               υπάρχει ακόμη συνδεδεμένο φαρμακείο για deep-link. -->
          <q-btn
            color="primary"
            icon="open_in_new"
            label="Άνοιγμα"
            class="q-ml-sm"
            :disable="!ouchBase"
            @click="openOuchtracker"
          />
          </div>
        </q-card-section>

        <q-card-section v-if="!ouchBase" class="text-caption text-grey-7 q-pt-none">
          Για το κουμπί «Άνοιγμα» όρισε τη διεύθυνση του OuchTracker
          (<code>OUCHTRACKER_URL</code>) στις ρυθμίσεις του web container.
        </q-card-section>
      </q-card>

      <!-- ── Ιστορικό ── -->
      <div class="text-subtitle2 text-weight-medium q-mb-sm">Πρόσφατοι συγχρονισμοί</div>
      <q-list v-if="data?.recentRuns.length" bordered separator class="rounded-borders">
        <q-item v-for="run in data.recentRuns" :key="run.id">
          <q-item-section avatar>
            <q-spinner v-if="!run.finishedAt" color="primary" size="24px" />
            <q-icon v-else :name="run.ok ? 'check_circle' : 'error'" :color="run.ok ? 'positive' : 'negative'" />
          </q-item-section>
          <q-item-section>
            <q-item-label>
              {{ sourceLabel(run.source) }}
              <span class="text-grey-7">· {{ formatDateTime(run.startedAt) }}</span>
            </q-item-label>
            <q-item-label caption>
              <template v-if="run.finishedAt">
                +{{ run.created }} νέα · {{ run.updated }} ενημερώσεις · {{ run.skipped }} παραλείψεις
              </template>
              <template v-else>Σε εξέλιξη…</template>
            </q-item-label>
            <q-item-label v-if="run.error" caption class="text-negative">{{ run.error }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="column items-center q-pa-lg text-grey-7">
        <q-icon name="history" size="40px" class="q-mb-sm" />
        <div>Δεν έχει γίνει ακόμη κανένας συγχρονισμός.</div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, post, get, put } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { OUCHTRACKER_URL } from '../lib/runtime-config';
import { useOfflineStore } from '../stores/offline';

interface SyncRun {
  id: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  created: number;
  updated: number;
  skipped: number;
  error: string | null;
}

interface IntegrationsStatus {
  eseo: { configured: boolean; topikoCode: string | null; cron: string; enabled: boolean; webhookConfigured: boolean };
  ouchtracker: { configured: boolean };
  recentRuns: SyncRun[];
}

interface SyncSummary {
  created: number;
  updated: number;
  skipped: number;
  deactivated: number;
  licenses: number;
  unmappedTypes: string[];
}

const $q = useQuasar();
const offline = useOfflineStore();

/** Βάση URL του OuchTracker (runtime config· χωρίς τελικό «/»). */
const ouchBase = OUCHTRACKER_URL.replace(/\/$/, '');

/** Ανοίγει το διαχειριστικό OuchTracker σε νέα καρτέλα (SSO auto-login). */
function openOuchtracker(): void {
  if (!ouchBase) return;
  window.open(ouchBase, '_blank', 'noopener');
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<IntegrationsStatus>('/integrations/status'),
  { cacheKey: 'integrations-status' },
);

const syncing = ref(false);
const lastSummary = ref<SyncSummary | null>(null);

// ── Κωδικός Τοπικού στο e-SEO ──
const topikoCode = ref('');
watch(
  () => data.value?.eseo.topikoCode,
  (code) => (topikoCode.value = code ?? ''),
  { immediate: true },
);
const codeChanged = computed(() => topikoCode.value.trim() !== (data.value?.eseo.topikoCode ?? ''));
const savingCode = ref(false);
async function saveCode(): Promise<void> {
  if (!codeChanged.value) return;
  savingCode.value = true;
  try {
    await put('/integrations/eseo/topiko-code', { code: topikoCode.value.trim() || null });
    $q.notify({ type: 'positive', message: 'Ο κωδικός e-SEO αποθηκεύτηκε.' });
    await reload();
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.' });
  } finally {
    savingCode.value = false;
  }
}

async function runSync(): Promise<void> {
  syncing.value = true;
  try {
    // Ένα πλήρες πέρασμα μητρώου ξεπερνά εύκολα τα 20s του προεπιλεγμένου timeout.
    const summary = await post<SyncSummary>('/integrations/eseo/sync', undefined, { timeout: 180_000 });
    lastSummary.value = summary;
    $q.notify({ type: 'positive', message: `Συγχρονισμός e-SEO: ${summaryLine(summary)}` });
    await reload();
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία συγχρονισμού e-SEO.',
    });
  } finally {
    syncing.value = false;
  }
}

function summaryLine(s: SyncSummary): string {
  return (
    `${s.created} νέα, ${s.updated} ενημερώσεις, ${s.skipped} παραλείψεις` +
    (s.deactivated ? `, ${s.deactivated} απενεργοποιήσεις` : '') +
    (s.licenses ? `, ${s.licenses} πτυχία` : '')
  );
}

function sourceLabel(source: string): string {
  if (source === 'ESEO') return 'e-SEO';
  if (source === 'OUCHTRACKER') return 'Ouchtracker';
  return source;
}

/** Μεταφράζει το πιο συνηθισμένο cron σε κάτι αναγνώσιμο· αλλιώς το δείχνει ως έχει. */
function describeCron(cron: string | undefined): string {
  if (!cron) return '—';
  const hour = /^0\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron.trim())?.[1];
  return hour ? `κάθε μέρα στις ${hour.padStart(2, '0')}:00` : cron;
}
</script>

<style scoped lang="scss">
// Κεφαλίδα κάρτας: εικονίδιο + τίτλος, και οι ενέργειες δίπλα όταν χωρούν —
// αλλιώς πέφτουν από κάτω, αντί να στριμώχνουν τον τίτλο λέξη-λέξη.
.int-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  > .col {
    flex: 1 1 220px;
    min-width: 0;
  }
}
.int-head__icon {
  flex: none;
}
.eseo-code {
  width: 260px;
  max-width: 100%;
}
.int-head__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  .q-chip {
    margin: 0;
  }
}
</style>
