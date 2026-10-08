<template>
  <q-page padding>
    <!-- Δύο λίστες: όσοι διαχειρίζονται (λίγοι, φτιάχνονται με το χέρι) και τα
         στελέχη των κλάδων (πολλά, ενεργοποιούνται μαζικά από το e-SEO). -->
    <q-tabs v-model="tab" dense align="left" no-caps class="q-mb-md" active-color="primary" indicator-color="primary" narrow-indicator>
      <q-tab name="admins" icon="admin_panel_settings" label="Διαχείριση" />
      <q-tab name="stelexi" icon="groups" label="Στελέχη" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated keep-alive class="bg-transparent">
    <q-tab-panel name="stelexi" class="q-pa-none">
      <StelexiAccess />
    </q-tab-panel>

    <q-tab-panel name="admins" class="q-pa-none">
    <div class="tf-toolbar q-mb-md">
      <div class="text-caption text-grey-7" style="flex: 1 1 260px">
        Οι λογαριασμοί διαχείρισης: υπερδιαχειριστές και διαχειριστές κλάδου. Τα στελέχη ενεργοποιούνται από την
        καρτέλα «Στελέχη».
      </div>
      <q-btn color="primary" icon="person_add" label="Νέος λογαριασμός" class="q-ml-auto" @click="openCreate" />
    </div>

    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <q-banner v-if="data?.kladoiWithoutAdmin.length" dense class="bg-orange-1 text-orange-10 q-mb-md">
        <template #avatar><q-icon name="warning" /></template>
        Χωρίς διαχειριστή:
        {{ data.kladoiWithoutAdmin.map((k) => KLADOS_LABEL[k]).join(', ') }}
      </q-banner>

      <q-list bordered separator class="rounded-borders">
        <q-item v-for="account in data?.accounts" :key="account.id">
          <q-item-section avatar>
            <q-avatar
              v-if="account.role === 'SUPER_ADMIN'"
              color="primary"
              text-color="white"
              size="38px"
              icon="shield"
            />
            <q-avatar
              v-else
              size="38px"
              :style="{
                backgroundColor: kladosColor(account.adminKlados),
                color: readableOn(kladosColor(account.adminKlados)),
              }"
              :icon="kladosIcon(account.adminKlados)"
            />
          </q-item-section>

          <!-- Ρόλος και κατάσταση κάτω από το όνομα: στο κινητό δεν χωρούν δίπλα. -->
          <q-item-section style="min-width: 0">
            <q-item-label class="ellipsis">{{ account.lastName }} {{ account.firstName }}</q-item-label>
            <q-item-label caption class="ellipsis">{{ account.email }}</q-item-label>
            <div class="row items-center no-wrap q-gutter-xs q-mt-xs" style="min-width: 0">
              <q-badge
                :color="account.role === 'SUPER_ADMIN' ? 'primary' : 'secondary'"
                :label="account.roleLabel"
                class="ellipsis"
                style="max-width: 100%"
              />
              <!-- «Ενεργοποιημένος» σημαίνει ότι έχει συνδεθεί τουλάχιστον μία
                   φορά μέσω Authentik· μέχρι τότε ο λογαριασμός περιμένει. -->
              <q-icon
                :name="account.activated ? 'verified' : 'hourglass_empty'"
                :color="account.activated ? 'positive' : 'grey-5'"
                size="18px"
              >
                <q-tooltip>
                  {{
                    account.activated
                      ? `Τελευταία σύνδεση: ${formatDateTime(account.lastLoginAt)}`
                      : 'Δεν έχει συνδεθεί ακόμη'
                  }}
                </q-tooltip>
              </q-icon>
            </div>
          </q-item-section>

          <q-item-section side>
            <!-- Κινητό: οι τρεις ενέργειες σε ένα μενού. -->
            <q-btn v-if="$q.screen.lt.sm" flat round dense icon="more_vert">
              <q-menu auto-close>
                <q-list style="min-width: 220px">
                  <q-item clickable :disable="!account.email" @click="confirmInvite(account)">
                    <q-item-section avatar><q-icon name="forward_to_inbox" /></q-item-section>
                    <q-item-section>{{ account.activated ? 'Επαναφορά κωδικού' : 'Αποστολή πρόσκλησης' }}</q-item-section>
                  </q-item>
                  <q-item clickable @click="openEdit(account)">
                    <q-item-section avatar><q-icon name="edit" /></q-item-section>
                    <q-item-section>Επεξεργασία</q-item-section>
                  </q-item>
                  <q-item clickable class="text-negative" :disable="account.id === auth.user?.id" @click="confirmRevoke(account)">
                    <q-item-section avatar><q-icon name="person_remove" /></q-item-section>
                    <q-item-section>Ανάκληση πρόσβασης</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
            <div v-else class="row items-center no-wrap q-gutter-xs">
              <q-btn
                dense
                flat
                round
                icon="forward_to_inbox"
                :loading="inviting === account.id"
                :disable="!account.email"
                @click="confirmInvite(account)"
              >
                <q-tooltip>
                  {{
                    account.activated
                      ? 'Αποστολή συνδέσμου επαναφοράς κωδικού'
                      : 'Αποστολή πρόσκλησης — συνδέσμου ορισμού κωδικού'
                  }}
                </q-tooltip>
              </q-btn>
              <q-btn dense flat round icon="edit" @click="openEdit(account)">
                <q-tooltip>Επεξεργασία</q-tooltip>
              </q-btn>
              <q-btn
                dense
                flat
                round
                icon="person_remove"
                color="negative"
                :disable="account.id === auth.user?.id"
                @click="confirmRevoke(account)"
              >
                <q-tooltip>
                  {{ account.id === auth.user?.id ? 'Δεν αφαιρείτε τον εαυτό σας' : 'Ανάκληση πρόσβασης' }}
                </q-tooltip>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>
    </q-tab-panel>
    </q-tab-panels>

    <q-dialog v-model="dialog">
      <q-card style="min-width: 360px">
        <q-card-section class="text-h6">
          {{ editing ? 'Επεξεργασία λογαριασμού' : 'Νέος λογαριασμός' }}
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model="form.firstName" label="Όνομα *" outlined dense />
            </div>
            <div class="col-6">
              <q-input v-model="form.lastName" label="Επώνυμο *" outlined dense />
            </div>
          </div>

          <q-input
            v-model="form.email"
            type="email"
            label="Email *"
            outlined
            dense
            :hint="
              editing
                ? undefined
                : 'Με αυτό θα συνδεθεί μέσω Authentik. Αν υπάρχει ήδη στο μητρώο, προάγεται το ίδιο άτομο.'
            "
          />

          <q-select
            v-model="form.role"
            :options="roleOptions"
            label="Ρόλος *"
            outlined
            dense
            emit-value
            map-options
          />

          <q-select
            v-if="form.role === 'KLADOS_ADMIN'"
            v-model="form.adminKlados"
            :options="kladosOptions"
            label="Κλάδος *"
            outlined
            dense
            emit-value
            map-options
            :hint="kladosHint"
          />
        </q-card-section>

        <q-card-section v-if="formError" class="bg-red-1 text-negative">
          {{ formError }}
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="primary" :label="editing ? 'Αποθήκευση' : 'Δημιουργία'" :loading="saving" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  ACCOUNT_ROLE_LABEL,
  KLADOS_LABEL,
  KLADOS_META,
  toOptions,
  type AccountCreated,
  type AccountRole,
  type AccountSummary,
  type KladosType,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import StelexiAccess from '../components/StelexiAccess.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { readableOn } from '../lib/color';
import { ApiError, del, get, patch, post } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuthStore } from '../stores/auth';

interface AccountsResponse {
  accounts: AccountSummary[];
  kladoiWithoutAdmin: KladosType[];
}

interface AssignableKlados {
  type: KladosType;
  label: string;
  admins: { id: string; firstName: string; lastName: string; email: string | null }[];
}

const $q = useQuasar();
const auth = useAuthStore();

const route = useRoute();
const router = useRouter();
/** Η καρτέλα ζει στο URL (`?tab=stelexi`), ώστε να ανοίγει απευθείας από σύνδεσμο. */
const tab = ref<'admins' | 'stelexi'>(route.query.tab === 'stelexi' ? 'stelexi' : 'admins');
watch(tab, (value) => void router.replace({ query: { ...route.query, tab: value === 'admins' ? undefined : value } }));

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<AccountsResponse>('/accounts'),
  { cacheKey: 'accounts' },
);

const assignable = ref<AssignableKlados[]>([]);
const dialog = ref(false);
const editing = ref<AccountSummary | null>(null);
const saving = ref(false);
const formError = ref<string | null>(null);
/** Το id του λογαριασμού που στέλνει αυτή τη στιγμή email — για το spinner. */
const inviting = ref<string | null>(null);

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  role: 'KLADOS_ADMIN' as AccountRole,
  adminKlados: null as KladosType | null,
});

const roleOptions = toOptions(ACCOUNT_ROLE_LABEL);
const kladosOptions = computed(() =>
  (assignable.value.length ? assignable.value : []).map((k) => ({ label: k.label, value: k.type })),
);

/** Δείχνει αν ο κλάδος έχει ήδη διαχειριστή — δεν το εμποδίζουμε, το λέμε. */
const kladosHint = computed(() => {
  const current = assignable.value.find((k) => k.type === form.adminKlados);
  if (!current?.admins.length) return undefined;
  const others = current.admins.filter((a) => a.id !== editing.value?.id);
  return others.length
    ? `Έχει ήδη: ${others.map((a) => `${a.lastName} ${a.firstName}`).join(', ')}`
    : undefined;
});

async function loadAssignable(): Promise<void> {
  try {
    assignable.value = await get<AssignableKlados[]>('/accounts/kladoi');
  } catch {
    assignable.value = [];
  }
}

function openCreate(): void {
  editing.value = null;
  formError.value = null;
  Object.assign(form, {
    firstName: '',
    lastName: '',
    email: '',
    role: 'KLADOS_ADMIN' as AccountRole,
    adminKlados: data.value?.kladoiWithoutAdmin[0] ?? null,
  });
  void loadAssignable();
  dialog.value = true;
}

function openEdit(account: AccountSummary): void {
  editing.value = account;
  formError.value = null;
  Object.assign(form, {
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email ?? '',
    role: account.role,
    adminKlados: account.adminKlados,
  });
  void loadAssignable();
  dialog.value = true;
}

async function save(): Promise<void> {
  saving.value = true;
  formError.value = null;

  const payload = {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    role: form.role,
    ...(form.role === 'KLADOS_ADMIN' && form.adminKlados ? { adminKlados: form.adminKlados } : {}),
  };

  try {
    // Η δημιουργία στέλνει και email ορισμού κωδικού. Αν δεν φύγει, ο
    // λογαριασμός έχει ήδη γίνει — το λέμε καθαρά αντί να δείξουμε «επιτυχία»
    // και να περιμένει ο νέος διαχειριστής ένα email που δεν ήρθε ποτέ.
    let created: AccountCreated | null = null;
    if (editing.value) await patch(`/accounts/${editing.value.id}`, payload);
    else created = await post<AccountCreated>('/accounts', payload);

    dialog.value = false;
    await reload();

    if (!created) {
      $q.notify({ type: 'positive', message: 'Ο λογαριασμός ενημερώθηκε.' });
    } else if (created.invited) {
      $q.notify({
        type: 'positive',
        message: `Ο λογαριασμός δημιουργήθηκε — στάλθηκε email ορισμού κωδικού στο ${created.account.email}.`,
      });
    } else {
      $q.notify({
        type: 'warning',
        timeout: 0,
        actions: [{ label: 'OK', color: 'white' }],
        message: `Ο λογαριασμός δημιουργήθηκε, αλλά δεν στάλθηκε email: ${created.inviteError}`,
      });
    }
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.';
  } finally {
    saving.value = false;
  }
}

function confirmInvite(account: AccountSummary): void {
  $q.dialog({
    title: account.activated ? 'Επαναφορά κωδικού' : 'Αποστολή πρόσκλησης',
    message:
      `Θα σταλεί email στο ${account.email} με σύνδεσμο ορισμού κωδικού. ` +
      'Ο κωδικός ορίζεται από τον ίδιο τον χρήστη — εμείς δεν τον βλέπουμε ποτέ. Συνέχεια;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Αποστολή', color: 'primary' },
  }).onOk(() => void invite(account));
}

async function invite(account: AccountSummary): Promise<void> {
  inviting.value = account.id;
  try {
    await post(`/accounts/${account.id}/invite`, {});
    $q.notify({ type: 'positive', message: `Στάλθηκε email στο ${account.email}.` });
  } catch (err) {
    $q.notify({
      type: 'negative',
      timeout: 0,
      actions: [{ label: 'OK', color: 'white' }],
      message: err instanceof ApiError ? err.message : 'Αποτυχία αποστολής email.',
    });
  } finally {
    inviting.value = null;
  }
}

function confirmRevoke(account: AccountSummary): void {
  $q.dialog({
    title: 'Ανάκληση πρόσβασης',
    message:
      `Ο/Η ${account.firstName} ${account.lastName} δεν θα μπορεί πλέον να συνδεθεί. ` +
      'Παραμένει στο μητρώο με όλο το ιστορικό του. Συνέχεια;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Ανάκληση', color: 'negative' },
  }).onOk(() => void revoke(account.id));
}

async function revoke(id: string): Promise<void> {
  try {
    await del(`/accounts/${id}`);
    await reload();
    $q.notify({ type: 'positive', message: 'Η πρόσβαση ανακλήθηκε.' });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία ανάκλησης.',
    });
  }
}

function kladosColor(klados: KladosType | null): string {
  return klados ? KLADOS_META[klados].color : '#9e9e9e';
}

function kladosIcon(klados: KladosType | null): string {
  return klados ? KLADOS_META[klados].icon : 'person';
}
</script>
