<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <q-space />
      <q-btn
        v-if="canSetup"
        flat
        no-caps
        color="klados"
        icon="manage_accounts"
        label="Συγχρονισμός προσβάσεων"
        class="q-mr-sm"
        :loading="syncing"
        :disable="!data.configured || !kits.length"
        @click="syncAccess"
      >
        <q-tooltip>Άμεσος συγχρονισμός προσβάσεων. Γίνεται και αυτόματα περιοδικά — εδώ μόνο αν το θέλεις τώρα.</q-tooltip>
      </q-btn>
      <q-btn
        v-if="canSetup"
        color="klados"
        unelevated
        no-caps
        icon="add_link"
        label="Σύνδεση φαρμακείου"
        :disable="!data.configured"
        @click="openLink"
      />
    </div>

    <!-- Το OuchTracker δεν έχει ρυθμιστεί -->
    <q-banner v-if="!loading && !data.configured" class="bg-orange-1 text-orange-9 q-mb-md" rounded>
      <template #avatar><q-icon name="cloud_off" color="orange-9" /></template>
      Το OuchTracker δεν έχει ρυθμιστεί σε αυτόν τον διακομιστή. Τα quick-actions και ο δανεισμός
      θα ενεργοποιηθούν μόλις συνδεθεί.
    </q-banner>

    <div v-if="loading" class="row q-col-gutter-md">
      <div v-for="n in 3" :key="n" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered><q-card-section><q-skeleton type="text" width="60%" /><q-skeleton type="text" width="40%" /></q-card-section></q-card>
      </div>
    </div>

    <!-- Κενή κατάσταση -->
    <div v-else-if="!kits.length" class="column items-center q-pa-xl text-grey-6">
      <q-icon name="local_pharmacy" size="48px" class="q-mb-sm" />
      <div>Δεν υπάρχουν φαρμακεία εδώ ακόμη.</div>
      <q-btn
        v-if="canSetup && data.configured"
        flat no-caps color="klados" class="q-mt-sm"
        icon="add_link" label="Σύνδεση φαρμακείου" @click="openLink"
      />
    </div>

    <div v-else class="row q-col-gutter-md">
      <div v-for="kit in kits" :key="kit.id" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered class="full-height column">
          <q-card-section class="q-pb-xs">
            <div class="row items-center no-wrap">
              <q-icon name="local_pharmacy" class="q-mr-sm" :style="{ color: 'var(--klados-ink, var(--q-primary))' }" />
              <div class="text-subtitle1 text-weight-medium ellipsis">{{ kit.name }}</div>
              <q-space />
              <!-- Quick-view λήξεων: ένας αριθμός (ληγμένα + λήγουν σύντομα),
                   κόκκινος αν υπάρχει ληγμένο· στο hover η ανάλυση. -->
              <q-chip
                v-if="kit.expiry.expired + kit.expiry.expiringSoon > 0"
                dense
                size="sm"
                class="q-ml-sm"
                text-color="white"
                :color="kit.expiry.expired > 0 ? 'negative' : 'warning'"
                :icon="kit.expiry.expired > 0 ? 'event_busy' : 'schedule'"
              >
                {{ kit.expiry.expired + kit.expiry.expiringSoon }}
                <q-tooltip class="text-body2">
                  <div v-if="kit.expiry.expired > 0">
                    <q-icon name="event_busy" size="16px" class="q-mr-xs" />{{ kit.expiry.expired }} ληγμένα
                  </div>
                  <div v-if="kit.expiry.expiringSoon > 0">
                    <q-icon name="schedule" size="16px" class="q-mr-xs" />{{ kit.expiry.expiringSoon }} λήγουν σύντομα (≤30 ημ.)
                  </div>
                </q-tooltip>
              </q-chip>
            </div>
            <!-- Σχέση με την εμβέλεια -->
            <div class="q-mt-xs">
              <q-chip
                v-if="kit.relation === 'BORROWED'"
                dense square size="sm" color="blue-1" text-color="blue-9" icon="south_west"
              >
                Δανεισμένο από {{ kit.owner.label }}
              </q-chip>
              <template v-else-if="kit.loan">
                <q-chip dense square size="sm" color="amber-2" text-color="amber-10" icon="north_east">
                  Δανεισμένο σε {{ kit.loan.toLabel }}
                </q-chip>
                <q-chip v-if="kit.loan.overdue" dense square size="sm" color="negative" text-color="white" icon="schedule">
                  Έληξε
                </q-chip>
              </template>
              <q-chip v-else dense square size="sm" color="green-1" text-color="green-9" icon="check_circle">
                Διαθέσιμο
              </q-chip>
            </div>
            <div v-if="kit.loan?.dueAt" class="text-caption text-grey-7 q-mt-xs">
              Έως {{ formatDate(kit.loan.dueAt) }}
            </div>
          </q-card-section>

          <q-space />

          <q-card-actions align="right" class="q-px-sm q-pb-sm">
            <q-btn
              flat no-caps dense color="klados"
              icon="open_in_new" label="Άνοιγμα"
              :disable="!ouchBase"
              @click="openInOuch(kit)"
            >
              <q-tooltip v-if="!ouchBase">Δεν έχει οριστεί διεύθυνση OuchTracker.</q-tooltip>
            </q-btn>

            <template v-if="kit.relation === 'OWNED'">
              <template v-if="canManage">
                <q-btn
                  v-if="!kit.loan"
                  flat no-caps dense color="klados"
                  icon="swap_horiz" label="Δανεισμός"
                  :disable="!data.configured"
                  @click="openLend(kit)"
                />
                <q-btn
                  v-else
                  flat no-caps dense color="positive"
                  icon="assignment_returned" label="Επιστροφή"
                  :loading="busyId === kit.id"
                  @click="returnKit(kit)"
                />
              </template>
              <q-btn v-if="canSetup" flat dense round icon="more_vert">
                <q-menu>
                  <q-list dense style="min-width: 160px">
                    <q-item v-close-popup clickable :disable="!!kit.loan" @click="unlink(kit)">
                      <q-item-section avatar><q-icon name="link_off" /></q-item-section>
                      <q-item-section>Αποσύνδεση</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </template>
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Διάλογος σύνδεσης φαρμακείου -->
    <q-dialog v-model="linkDialog">
      <q-card style="min-width: 320px; max-width: 420px">
        <q-card-section class="text-h6">Σύνδεση φαρμακείου</q-card-section>
        <q-card-section class="q-pt-none">
          <q-select
            v-model="linkKitId"
            :options="availableOptions"
            emit-value map-options
            outlined dense
            label="Kit στο OuchTracker"
            :loading="availableLoading"
            @update:model-value="onPickKit"
          />
          <q-input v-model="linkName" outlined dense class="q-mt-sm" label="Όνομα φαρμακείου" />
          <div v-if="!availableLoading && !availableOptions.length" class="text-caption text-grey-6 q-mt-sm">
            Δεν υπάρχουν διαθέσιμα Kit — είτε δεν υπάρχουν στο OuchTracker, είτε έχουν ήδη συνδεθεί.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Άκυρο" v-close-popup />
          <q-btn
            unelevated no-caps color="klados" label="Σύνδεση"
            :disable="!linkKitId || !linkName.trim()"
            :loading="submitting"
            @click="submitLink"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Διάλογος δανεισμού -->
    <q-dialog v-model="lendDialog">
      <q-card style="min-width: 320px; max-width: 420px">
        <q-card-section class="text-h6">Δανεισμός φαρμακείου</q-card-section>
        <q-card-section class="q-pt-none">
          <div class="text-body2 q-mb-sm">{{ lendKit?.name }}</div>
          <q-select
            v-model="lendTarget"
            :options="lendTargets"
            emit-value map-options
            outlined dense
            label="Σε ποιον δανείζεται"
          />
          <DateField
            v-model="lendDue"
            class="q-mt-sm"
            label="Έως (προαιρετικό)"
            hint="Στη λήξη επιστρέφεται αυτόματα."
          />
          <q-input v-model="lendNote" outlined dense class="q-mt-md" label="Σημείωση (προαιρετικό)" type="textarea" autogrow />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Άκυρο" v-close-popup />
          <q-btn
            unelevated no-caps color="klados" label="Δανεισμός"
            :disable="lendTarget === null"
            :loading="submitting"
            @click="submitLend"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { KLADOI_IN_ORDER, KLADOS_LABEL, type KladosType } from '@trifylli/shared';
import { useKladosScope } from '../composables/useKladosScope';
import { useAuthStore } from '../stores/auth';
import { get, post, del } from '../lib/api';
import { formatDate } from '../lib/format';
import { OUCHTRACKER_URL } from '../lib/runtime-config';
import DateField from '../components/DateField.vue';

const TOPIKO = '__TOPIKO__';

interface KitView {
  id: string;
  name: string;
  ouchtrackerKitId: string;
  relation: 'OWNED' | 'BORROWED';
  owner: { kladosType: KladosType | null; label: string };
  loan: {
    id: string;
    toKladosType: KladosType | null;
    toLabel: string;
    borrowedAt: string;
    dueAt: string | null;
    overdue: boolean;
  } | null;
  /** Quick-view λήξεων ειδών του kit. */
  expiry: { expired: number; expiringSoon: number };
}
interface ListResponse { configured: boolean; kits: KitView[] }

const $q = useQuasar();
const { klados, inKlados } = useKladosScope();
const auth = useAuthStore();

const ouchBase = OUCHTRACKER_URL.replace(/\/$/, '');
const loading = ref(true);
const submitting = ref(false);
const busyId = ref<string | null>(null);
const syncing = ref(false);
const data = ref<ListResponse>({ configured: false, kits: [] });
const kits = computed(() => data.value.kits);

const canManage = computed(() =>
  klados.value ? auth.can('farmakeio:write', klados.value) : auth.isSuperAdmin,
);
// Στήσιμο (σύνδεση/αποσύνδεση/συγχρονισμός) — μόνο ο υπερδιαχειριστής. Οι
// διαχειριστές κλάδου μπορούν μόνο να δανείζουν/επιστρέφουν τα φαρμακεία τους.
const canSetup = computed(() => auth.isSuperAdmin);

function scopeParams() {
  return klados.value ? { klados: klados.value } : {};
}

async function load() {
  loading.value = true;
  try {
    data.value = await get<ListResponse>('/pharmacies', { params: scopeParams() });
  } catch {
    data.value = { configured: false, kits: [] };
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(klados, load);

function openInOuch(kit: KitView) {
  if (!ouchBase) return;
  window.open(`${ouchBase}/kit/${kit.ouchtrackerKitId}`, '_blank', 'noopener');
}

// ── Σύνδεση ──
const linkDialog = ref(false);
const availableLoading = ref(false);
const availableOptions = ref<{ label: string; value: string; name: string }[]>([]);
const linkKitId = ref<string | null>(null);
const linkName = ref('');

async function openLink() {
  linkDialog.value = true;
  linkKitId.value = null;
  linkName.value = '';
  availableLoading.value = true;
  try {
    const kitsAvail = await get<{ id: string; name: string; location: string | null }[]>(
      '/pharmacies/available-kits',
      { params: scopeParams() },
    );
    availableOptions.value = kitsAvail.map((k) => ({
      value: k.id,
      name: k.name,
      label: k.location ? `${k.name} · ${k.location}` : k.name,
    }));
  } catch {
    availableOptions.value = [];
  } finally {
    availableLoading.value = false;
  }
}

function onPickKit(id: string) {
  const picked = availableOptions.value.find((o) => o.value === id);
  if (picked && !linkName.value.trim()) linkName.value = picked.name;
}

async function submitLink() {
  if (!linkKitId.value || !linkName.value.trim()) return;
  submitting.value = true;
  try {
    await post('/pharmacies', {
      name: linkName.value.trim(),
      ouchtrackerKitId: linkKitId.value,
      ...(klados.value ? { kladosType: klados.value } : {}),
    });
    linkDialog.value = false;
    $q.notify({ type: 'positive', message: 'Το φαρμακείο συνδέθηκε.' });
    await load();
  } catch (e) {
    notifyError(e, 'Η σύνδεση απέτυχε.');
  } finally {
    submitting.value = false;
  }
}

// ── Δανεισμός ──
const lendDialog = ref(false);
const lendKit = ref<KitView | null>(null);
const lendTarget = ref<string | null>(null);
const lendDue = ref('');
const lendNote = ref('');

const lendTargets = computed(() => {
  const owner = lendKit.value?.owner.kladosType ?? null;
  const opts: { label: string; value: string }[] = [];
  // Όλοι οι κλάδοι (όχι μόνο όσους βλέπει ο χρήστης) ώστε ένας κλάδος να μπορεί
  // να δανείσει σε οποιονδήποτε άλλο κλάδο ή στο Τοπικό.
  for (const k of KLADOI_IN_ORDER) {
    if (k !== owner) opts.push({ label: KLADOS_LABEL[k], value: k });
  }
  if (owner !== null) opts.push({ label: 'Τοπικό', value: TOPIKO });
  return opts;
});

function openLend(kit: KitView) {
  lendKit.value = kit;
  lendTarget.value = null;
  lendDue.value = '';
  lendNote.value = '';
  lendDialog.value = true;
}

async function submitLend() {
  if (!lendKit.value || lendTarget.value === null) return;
  submitting.value = true;
  try {
    await post(`/pharmacies/${lendKit.value.id}/lend`, {
      ...(lendTarget.value === TOPIKO ? {} : { toKladosType: lendTarget.value }),
      ...(lendDue.value ? { dueAt: new Date(lendDue.value).toISOString() } : {}),
      ...(lendNote.value.trim() ? { note: lendNote.value.trim() } : {}),
    });
    lendDialog.value = false;
    $q.notify({ type: 'positive', message: 'Το φαρμακείο δανείστηκε.' });
    await load();
  } catch (e) {
    notifyError(e, 'Ο δανεισμός απέτυχε.');
  } finally {
    submitting.value = false;
  }
}

async function returnKit(kit: KitView) {
  busyId.value = kit.id;
  try {
    await post(`/pharmacies/${kit.id}/return`, {});
    $q.notify({ type: 'positive', message: 'Το φαρμακείο επιστράφηκε.' });
    await load();
  } catch (e) {
    notifyError(e, 'Η επιστροφή απέτυχε.');
  } finally {
    busyId.value = null;
  }
}

function unlink(kit: KitView) {
  $q.dialog({
    title: 'Αποσύνδεση φαρμακείου',
    message: `Να αποσυνδεθεί το «${kit.name}»; Τα δεδομένα στο OuchTracker δεν θίγονται.`,
    cancel: true,
    ok: { label: 'Αποσύνδεση', color: 'negative', noCaps: true, flat: true },
  }).onOk(() => {
    void (async () => {
      try {
        await del(`/pharmacies/${kit.id}`);
        $q.notify({ type: 'positive', message: 'Αποσυνδέθηκε.' });
        await load();
      } catch (e) {
        notifyError(e, 'Η αποσύνδεση απέτυχε.');
      }
    })();
  });
}

async function syncAccess() {
  syncing.value = true;
  try {
    const r = await post<{ synced: number; skipped: number; people: number }>(
      '/pharmacies/sync-access',
      {},
      { params: scopeParams() },
    );
    const extra = r.skipped ? `, ${r.skipped} δανεισμένα παραλείφθηκαν` : '';
    $q.notify({
      type: 'positive',
      message: `Συγχρονίστηκαν ${r.synced} φαρμακεία με ${r.people} άτομα${extra}.`,
    });
  } catch (e) {
    notifyError(e, 'Ο συγχρονισμός απέτυχε.');
  } finally {
    syncing.value = false;
  }
}

function notifyError(e: unknown, fallback: string) {
  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  $q.notify({ type: 'negative', message: Array.isArray(msg) ? msg[0] : (msg ?? fallback) });
}
</script>
