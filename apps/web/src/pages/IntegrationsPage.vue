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

        <!-- Ο λογαριασμός e-SEO με τον οποίο συγχρονίζει ο server. Ο κωδικός μένει πάντα
             `type=password` (χωρίς «εμφάνιση»): η καταγραφή χρήσης κρύβει μόνο τέτοια πεδία. -->
        <q-card-section v-if="account?.source === 'account' && !editingAccount" class="row items-center q-gutter-sm">
          <q-icon name="verified_user" color="positive" size="24px" />
          <div class="col" style="min-width: 200px">
            <div class="text-body2">Συνδεδεμένο ως <b>{{ account.username }}</b></div>
            <div v-if="account.loggedInAt" class="text-caption text-grey-7">
              Τελευταία σύνδεση {{ formatDateTime(account.loggedInAt) }} — ανανεώνεται μόνο του.
            </div>
          </div>
          <q-btn flat no-caps color="primary" icon="edit" label="Αλλαγή" @click="startAccountEdit" />
          <q-btn flat no-caps color="negative" icon="logout" label="Αποσύνδεση" :loading="accountBusy === 'logout'" @click="logoutAccount" />
        </q-card-section>
        <q-card-section v-else>
          <div class="text-body2 q-mb-xs">{{ account?.source === 'account' ? 'Αλλαγή λογαριασμού e-SEO' : 'Σύνδεση στο e-SEO' }}</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Ο λογαριασμός ενός στελέχους στο eseo.seo.gr, με πρόσβαση στο Τοπικό. Ο κωδικός μένει κρυπτογραφημένος στον
            server, ώστε ο συγχρονισμός να ξανασυνδέεται μόνος του — δεν εμφανίζεται ποτέ ξανά.
            <template v-if="account?.source === 'env'"> Τώρα συγχρονίζει με το παλιό token του <code>.env</code>.</template>
          </div>
          <form class="row items-start q-gutter-sm" autocomplete="off" @submit.prevent="loginAccount">
            <q-input
              v-model="accountForm.username"
              dense outlined label="Όνομα χρήστη" class="eseo-field"
              autocomplete="off" :maxlength="200"
            />
            <q-input
              v-model="accountForm.password"
              dense outlined label="Κωδικός" class="eseo-field"
              type="password" autocomplete="new-password" :maxlength="500"
            />
            <q-btn
              type="submit" unelevated color="primary" icon="login" label="Σύνδεση" class="q-mt-xs"
              :loading="accountBusy === 'login'"
              :disable="!accountForm.username.trim() || !accountForm.password || !offline.online"
            />
            <q-btn v-if="editingAccount" flat no-caps label="Άκυρο" class="q-mt-xs" @click="cancelAccountEdit" />
          </form>
        </q-card-section>
        <q-card-section v-if="account?.lastError" class="bg-red-1 text-red-10 text-body2">
          <q-icon name="error" class="q-mr-xs" />{{ account.lastError }}
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
          Ο συγχρονισμός είναι ανενεργός μέχρι να συνδεθείς στο e-SEO παραπάνω.
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
import { useTopikoReload } from '../composables/useLiveChanges';
import { ApiError, del, post, get, put } from '../lib/api';
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

interface EseoAccount {
  /** Λογαριασμός από εδώ, παλιό token στο `.env`, ή τίποτα. */
  source: 'account' | 'env' | null;
  username: string | null;
  loggedInAt: string | null;
  lastError: string | null;
}

interface IntegrationsStatus {
  eseo: {
    configured: boolean;
    account: EseoAccount;
    topikoCode: string | null;
    cron: string;
    enabled: boolean;
    webhookConfigured: boolean;
  };
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
// Ζωντανά: ο συγχρονισμός που ξεκίνησε άλλος (ή το cron) και οι ρυθμίσεις.
useTopikoReload(['integrations'], reload);

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

// ── Λογαριασμός e-SEO ──
const account = computed(() => data.value?.eseo.account ?? null);
const editingAccount = ref(false);
const accountForm = ref({ username: '', password: '' });
const accountBusy = ref<'login' | 'logout' | null>(null);

function startAccountEdit(): void {
  accountForm.value = { username: account.value?.username ?? '', password: '' };
  editingAccount.value = true;
}
function cancelAccountEdit(): void {
  accountForm.value = { username: '', password: '' };
  editingAccount.value = false;
}

async function loginAccount(): Promise<void> {
  const username = accountForm.value.username.trim();
  if (!username || !accountForm.value.password) return;
  accountBusy.value = 'login';
  try {
    // Ο server ρωτά το Keycloak πριν αποθηκεύσει — λάθος κωδικός δεν σώζεται.
    await put('/integrations/eseo/account', { username, password: accountForm.value.password }, { timeout: 30_000 });
    $q.notify({ type: 'positive', message: `Συνδέθηκες στο e-SEO ως ${username}.` });
    cancelAccountEdit();
    await reload();
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία σύνδεσης στο e-SEO.' });
  } finally {
    accountForm.value.password = '';
    accountBusy.value = null;
  }
}

function logoutAccount(): void {
  $q.dialog({
    title: 'Αποσύνδεση από το e-SEO',
    message: 'Σβήνονται όνομα, κωδικός και token από τον server· ο συγχρονισμός μελών σταματά μέχρι να συνδεθείς ξανά.',
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { color: 'negative', label: 'Αποσύνδεση', unelevated: true },
  }).onOk(async () => {
    accountBusy.value = 'logout';
    try {
      await del('/integrations/eseo/account');
      await reload();
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία αποσύνδεσης.' });
    } finally {
      accountBusy.value = null;
    }
  });
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
.eseo-code,
.eseo-field {
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
