<template>
  <q-page padding>
    <div class="page-title">
      {{ drasiId ? 'Στήσιμο δράσης' : 'Νέα δράση' }}{{ inKlados ? ` — ${kladosLabel}` : '' }}
    </div>
    <div class="text-caption text-grey-7 q-mb-md">
      Τέσσερα βήματα — τα δύο τελευταία παραλείπονται. Τίποτα δεν κλειδώνει: ό,τι
      συμπληρώσεις εδώ αλλάζει και μετά, από την ίδια τη δράση.
    </div>

    <PageState :loading="resuming" :error="loadError" @retry="resume">
      <q-stepper
        v-model="step"
        color="klados"
        animated
        flat
        bordered
        keep-alive
        :vertical="$q.screen.lt.md"
        done-icon="check"
        active-icon="edit"
        class="wizard"
      >
        <!-- ── 1. Τι είναι ── -->
        <q-step :name="1" title="Τι είναι" caption="τίτλος, τύπος, ημερομηνίες" icon="flag" :done="step > 1">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-8">
              <q-input
                v-model="form.title"
                label="Τίτλος"
                outlined
                dense
                autofocus
                maxlength="200"
                :error="touched && !form.title.trim()"
                error-message="Η δράση θέλει έναν τίτλο."
              />
            </div>
            <div v-if="auth.isSuperAdmin" class="col-12 col-md-4">
              <q-select
                v-model="form.organiser"
                :options="organiserOptions"
                label="Ποιος διοργανώνει"
                outlined
                dense
                emit-value
                map-options
                :disable="!!drasiId"
                :hint="drasiId ? 'Ο διοργανωτής δεν αλλάζει μετά τη δημιουργία.' : undefined"
              />
            </div>

            <div class="col-12">
              <div class="text-caption text-grey-7 q-mb-xs">Τύπος</div>
              <q-btn-toggle
                v-model="form.type"
                unelevated
                toggle-color="klados"
                toggle-text-color="klados-on"
                :options="typeOptions"
              />
            </div>

            <div class="col-12 col-sm-6 col-md-4">
              <DateField v-model="form.dateStart" :label="form.type === 'MONOIMERI' ? 'Ημερομηνία' : 'Έναρξη'" />
            </div>
            <div v-if="form.type !== 'MONOIMERI'" class="col-12 col-sm-6 col-md-4">
              <DateField v-model="form.dateEnd" label="Λήξη" />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="form.location" label="Τόπος" outlined dense maxlength="200" />
            </div>
            <div v-if="touched && dateError" class="col-12 text-negative text-caption">{{ dateError }}</div>
          </div>

          <q-stepper-navigation class="row q-gutter-sm">
            <q-btn
              color="klados"
              text-color="klados-on"
              unelevated
              label="Συνέχεια"
              icon-right="arrow_forward"
              :loading="saving"
              @click="next"
            />
            <q-btn flat color="klados" label="Αποθήκευση & έξοδος" :loading="saving" @click="saveAndExit" />
          </q-stepper-navigation>
        </q-step>

        <!-- ── 2. Ποιοι έρχονται ── -->
        <q-step :name="2" title="Ποιοι έρχονται" caption="κλάδοι & άλλα Τοπικά" icon="groups" :done="step > 2">
          <div class="text-subtitle2 q-mb-xs">Δικοί μας κλάδοι</div>
          <q-option-group
            v-model="kladoi"
            type="checkbox"
            color="klados"
            inline
            :options="kladosOptions"
          />

          <q-separator class="q-my-md" />

          <div class="text-subtitle2 q-mb-xs">Άλλα Τοπικά</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Με τον κωδικό του Τοπικού στο e-SEO παίρνουμε το επίσημο όνομα. Αν το e-SEO δεν
            απαντά, γράψε το όνομα με το χέρι.
          </div>

          <q-list v-if="guests.length" bordered separator class="rounded-borders q-mb-md">
            <q-item v-for="g in guests" :key="g.topikoCode">
              <q-item-section>
                <q-item-label>
                  {{ g.topikoName }}
                  <span class="text-grey-6 text-caption">· e-SEO {{ g.topikoCode }}</span>
                </q-item-label>
                <q-item-label caption>
                  <span v-if="g.kladoi.length">{{ g.kladoi.map((k) => KLADOS_LABEL[k]).join(', ') }}</span>
                  <span v-else>χωρίς δήλωση κλάδων</span>
                  <span v-if="g.contactName"> · {{ g.contactName }}</span>
                  <span v-if="g.contactPhone"> · {{ g.contactPhone }}</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat dense round icon="close" @click="removeGuest(g.topikoCode)">
                  <q-tooltip>Αφαίρεση</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>

          <q-card flat bordered class="q-pa-md">
            <div class="row q-col-gutter-sm items-start">
              <div class="col-6 col-sm-3">
                <q-input
                  v-model="guestDraft.code"
                  label="Κωδικός e-SEO"
                  outlined
                  dense
                  inputmode="numeric"
                  maxlength="10"
                  :loading="lookingUp"
                  @keyup.enter="lookupGuest"
                >
                  <template #append>
                    <q-btn flat dense round icon="search" :disable="!guestDraft.code" @click="lookupGuest">
                      <q-tooltip>Αναζήτηση στο e-SEO</q-tooltip>
                    </q-btn>
                  </template>
                </q-input>
              </div>
              <div class="col-12 col-sm-5">
                <q-input
                  v-model="guestDraft.name"
                  label="Όνομα Τοπικού"
                  outlined
                  dense
                  maxlength="120"
                  :hint="guestDraft.parentName ? `Τομέας: ${guestDraft.parentName}` : lookupHint"
                />
              </div>
              <div class="col-6 col-sm-2">
                <q-input v-model="guestDraft.contactName" label="Επαφή" outlined dense maxlength="120" />
              </div>
              <div class="col-6 col-sm-2">
                <q-input v-model="guestDraft.contactPhone" label="Τηλέφωνο" outlined dense maxlength="40" />
              </div>
              <div class="col-12">
                <div class="text-caption text-grey-7">Ποιοι κλάδοι τους έρχονται</div>
                <q-option-group
                  v-model="guestDraft.kladoi"
                  type="checkbox"
                  color="klados"
                  inline
                  :options="allKladosOptions"
                />
              </div>
              <div class="col-12">
                <q-btn
                  outline
                  color="klados"
                  icon="add"
                  label="Προσθήκη Τοπικού"
                  :disable="!guestDraft.code.trim() || !guestDraft.name.trim()"
                  @click="addGuest"
                />
              </div>
            </div>
          </q-card>

          <q-stepper-navigation class="row q-gutter-sm">
            <q-btn
              color="klados"
              text-color="klados-on"
              unelevated
              label="Συνέχεια"
              icon-right="arrow_forward"
              :loading="saving"
              @click="next"
            />
            <q-btn flat color="klados" label="Αποθήκευση & έξοδος" :loading="saving" @click="saveAndExit" />
            <q-space />
            <q-btn flat label="Πίσω" @click="step = 1" />
          </q-stepper-navigation>
        </q-step>

        <!-- ── 3. Αρχηγείο ── -->
        <q-step :name="3" title="Αρχηγείο" caption="ποιος έχει τι" icon="military_tech" :done="step > 3">
          <div class="row items-center q-mb-sm">
            <div class="text-caption text-grey-7 col">
              Περισσότερα από ένα άτομα ανά ευθύνη επιτρέπονται.
              <span v-if="templateSource"> Από «{{ templateSource.title }}».</span>
            </div>
            <q-btn
              flat
              dense
              color="klados"
              icon="history"
              label="Ίδια όπως την προηγούμενη"
              :loading="templating"
              @click="applyTemplate('arxigeio')"
            />
          </div>

          <div class="row q-col-gutter-md">
            <div v-for="kind in DRASI_ARXIGEIO_KINDS" :key="kind" class="col-12 col-md-6">
              <StelexosPicker v-model="roles[kind]" :label="DRASI_ROLE_LABEL[kind]" :options="stelexiOptions" />
            </div>
          </div>

          <q-stepper-navigation class="row q-gutter-sm">
            <q-btn
              color="klados"
              text-color="klados-on"
              unelevated
              label="Συνέχεια"
              icon-right="arrow_forward"
              :loading="saving"
              @click="next"
            />
            <q-btn flat color="klados" label="Παράλειψη" :loading="saving" @click="skip" />
            <q-btn flat color="klados" label="Αποθήκευση & έξοδος" :loading="saving" @click="saveAndExit" />
            <q-space />
            <q-btn flat label="Πίσω" @click="step = 2" />
          </q-stepper-navigation>
        </q-step>

        <!-- ── 4. Υπηρεσίες ── -->
        <q-step :name="4" title="Υπηρεσίες" caption="προαιρετικό" icon="cleaning_services">
          <div class="row items-center q-mb-sm">
            <div class="text-caption text-grey-7 col">
              Διάλεξε μόνο όσες ισχύουν σε αυτή τη δράση — και ποιο στέλεχος την έχει.
            </div>
            <q-btn
              flat
              dense
              color="klados"
              icon="history"
              label="Ίδια όπως την προηγούμενη"
              :loading="templating"
              @click="applyTemplate('ypiresies')"
            />
          </div>

          <q-list bordered separator class="rounded-borders">
            <q-item v-for="kind in DRASI_YPIRESIA_KINDS" :key="kind" class="q-py-sm">
              <q-item-section side top>
                <q-toggle v-model="enabledServices" :val="kind" color="klados" />
              </q-item-section>
              <q-item-section>
                <q-item-label :class="enabledServices.includes(kind) ? '' : 'text-grey-6'">
                  {{ DRASI_ROLE_LABEL[kind] }}
                </q-item-label>
                <StelexosPicker
                  v-if="enabledServices.includes(kind)"
                  v-model="roles[kind]"
                  label="Υπεύθυνο στέλεχος"
                  :options="stelexiOptions"
                  class="q-mt-xs"
                />
              </q-item-section>
            </q-item>
          </q-list>

          <q-stepper-navigation class="row q-gutter-sm">
            <q-btn
              color="klados"
              text-color="klados-on"
              unelevated
              label="Ολοκλήρωση"
              icon-right="check"
              :loading="saving"
              @click="finish"
            />
            <q-btn flat color="klados" label="Αποθήκευση & έξοδος" :loading="saving" @click="saveAndExit" />
            <q-space />
            <q-btn flat label="Πίσω" @click="step = 3" />
          </q-stepper-navigation>
        </q-step>
      </q-stepper>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_TYPE_LABEL,
  DRASI_YPIRESIA_KINDS,
  DrasiRoleKind,
  KLADOI_IN_ORDER,
  KLADOS_LABEL,
  type DrasiRolesTemplate,
  type DrasiStatus,
  type DrasiType,
  type EseoUnitInfo,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import DateField from '../components/DateField.vue';
import PageState from '../components/PageState.vue';
import StelexosPicker from '../components/StelexosPicker.vue';
import { useKladosScope } from '../composables/useKladosScope';
import { ApiError, get, patch, post, put } from '../lib/api';
import { toISODate } from '../lib/format';
import { useAuthStore } from '../stores/auth';

interface GuestTopiko {
  topikoCode: string;
  topikoName: string;
  kladoi: KladosType[];
  contactName: string;
  contactPhone: string;
}

interface DrasiForWizard {
  id: string;
  title: string;
  type: DrasiType;
  status: DrasiStatus;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  klados: { type: KladosType } | null;
  kladoi: KladosType[];
  guestTopika: {
    topikoCode: string;
    topikoName: string;
    kladoi: KladosType[];
    contactName: string | null;
    contactPhone: string | null;
  }[];
  roles: { kind: DrasiRoleKind; user: { id: string } }[];
}

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { klados: routeKlados, inKlados, label: kladosLabel } = useKladosScope();

const drasiId = ref<string | null>(typeof route.query.id === 'string' ? route.query.id : null);
const step = ref(1);
const saving = ref(false);
const touched = ref(false);
const resuming = ref(false);
const loadError = ref<string | null>(null);

// ── Βήμα 1 ──
const form = reactive({
  title: '',
  type: 'MONOIMERI' as DrasiType,
  dateStart: '',
  dateEnd: '',
  location: '',
  /** Ο κλάδος που διοργανώνει· `null` = το Τοπικό (μόνο ο υπερδιαχειριστής). */
  organiser: routeKlados.value as KladosType | null,
});

const typeOptions = (Object.keys(DRASI_TYPE_LABEL) as DrasiType[]).map((value) => ({
  label: DRASI_TYPE_LABEL[value],
  value,
}));

const organiserOptions = computed(() => [
  ...auth.kladoi.map((k) => ({ label: k.label, value: k.type as KladosType | null })),
  { label: 'Το Τοπικό (όλοι οι κλάδοι)', value: null },
]);

// Μονοήμερη: μία ημερομηνία. Η λήξη ακολουθεί την έναρξη χωρίς να το σκεφτεί κανείς.
watch(
  () => [form.type, form.dateStart] as const,
  ([type, start]) => {
    if (type === 'MONOIMERI') form.dateEnd = start;
    else if (!form.dateEnd || form.dateEnd < start) form.dateEnd = start;
  },
);

const dateError = computed(() => {
  if (!form.dateStart) return 'Διάλεξε ημερομηνία.';
  if (form.type !== 'MONOIMERI' && !form.dateEnd) return 'Διάλεξε ημερομηνία λήξης.';
  if (form.dateEnd && form.dateEnd < form.dateStart) return 'Η λήξη είναι πριν την έναρξη.';
  return null;
});

// ── Βήμα 2 ──
const kladoi = ref<KladosType[]>(routeKlados.value ? [routeKlados.value] : []);
const guests = ref<GuestTopiko[]>([]);

/** Ο διοργανωτής συμμετέχει εξ ορισμού — δεν ξετσεκάρεται. */
const kladosOptions = computed(() =>
  KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k, disable: k === form.organiser })),
);
const allKladosOptions = KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k }));

const guestDraft = reactive({
  code: '',
  name: '',
  parentName: '',
  kladoi: [] as KladosType[],
  contactName: '',
  contactPhone: '',
});
const lookingUp = ref(false);
const lookupHint = ref<string | undefined>(undefined);

async function lookupGuest(): Promise<void> {
  const code = guestDraft.code.trim();
  if (!/^\d{1,10}$/.test(code)) {
    lookupHint.value = 'Ο κωδικός e-SEO είναι αριθμός.';
    return;
  }
  lookingUp.value = true;
  lookupHint.value = undefined;
  guestDraft.parentName = '';
  try {
    const unit = await get<EseoUnitInfo>(`/draseis/eseo-topiko/${code}`);
    guestDraft.name = unit.name;
    guestDraft.parentName = unit.parentName ?? '';
    if (unit.type && unit.type !== 'LOCAL') lookupHint.value = 'Προσοχή: ο κωδικός δεν είναι Τοπικό Τμήμα.';
  } catch (err) {
    lookupHint.value =
      err instanceof ApiError && err.status === 404
        ? 'Δεν βρέθηκε στο e-SEO — γράψε το όνομα με το χέρι.'
        : 'Το e-SEO δεν απαντά — γράψε το όνομα με το χέρι.';
  } finally {
    lookingUp.value = false;
  }
}

function addGuest(): void {
  const code = guestDraft.code.trim();
  if (!/^\d{1,10}$/.test(code)) {
    lookupHint.value = 'Ο κωδικός e-SEO είναι αριθμός.';
    return;
  }
  const entry: GuestTopiko = {
    topikoCode: code,
    topikoName: guestDraft.name.trim(),
    kladoi: [...guestDraft.kladoi],
    contactName: guestDraft.contactName.trim(),
    contactPhone: guestDraft.contactPhone.trim(),
  };
  guests.value = [...guests.value.filter((g) => g.topikoCode !== code), entry];
  Object.assign(guestDraft, { code: '', name: '', parentName: '', kladoi: [], contactName: '', contactPhone: '' });
  lookupHint.value = undefined;
}

function removeGuest(code: string): void {
  guests.value = guests.value.filter((g) => g.topikoCode !== code);
}

// ── Βήματα 3-4 ──
const roles = reactive(
  Object.fromEntries(Object.values(DrasiRoleKind).map((k) => [k, [] as string[]])) as Record<DrasiRoleKind, string[]>,
);
const enabledServices = ref<DrasiRoleKind[]>([]);
const stelexi = ref<MemberSummary[]>([]);
const templating = ref(false);
const templateSource = ref<DrasiRolesTemplate['source']>(null);

const stelexiOptions = computed(() =>
  stelexi.value.map((s) => ({
    label: `${s.lastName} ${s.firstName}`.trim(),
    value: s.id,
    caption: s.leaderTitle ?? (s.isSOS ? 'Στέλεχος SOS' : ''),
  })),
);

async function loadStelexi(): Promise<void> {
  try {
    const page = await get<Paginated<MemberSummary>>('/meloi', {
      params: { kind: 'STELEXOS', pageSize: 500 },
    });
    stelexi.value = page.items;
  } catch {
    // Χωρίς λίστα στελεχών τα βήματα 3-4 μένουν άδεια — ο χρήστης τα συμπληρώνει αργότερα.
  }
}

async function applyTemplate(group: 'arxigeio' | 'ypiresies'): Promise<void> {
  templating.value = true;
  try {
    const template = await get<DrasiRolesTemplate>('/draseis/roles-template', {
      params: {
        ...(form.organiser ? { klados: form.organiser } : {}),
        ...(drasiId.value ? { exclude: drasiId.value } : {}),
      },
    });
    if (!template.source) {
      $q.notify({ type: 'info', message: 'Δεν υπάρχει προηγούμενη δράση με αρχηγείο για αυτόν τον φορέα.' });
      return;
    }
    const kinds = group === 'arxigeio' ? DRASI_ARXIGEIO_KINDS : DRASI_YPIRESIA_KINDS;
    for (const kind of kinds) {
      roles[kind] = template.roles.filter((r) => r.kind === kind).map((r) => r.userId);
    }
    if (group === 'ypiresies') {
      enabledServices.value = DRASI_YPIRESIA_KINDS.filter((kind) => roles[kind].length > 0);
    }
    templateSource.value = template.source;
  } catch (err) {
    notifyError(err, 'Αποτυχία ανάκτησης προηγούμενης δράσης.');
  } finally {
    templating.value = false;
  }
}

// ── Αποθήκευση ανά βήμα ──

/** Μεσημέρι τοπικής ώρας: η ημέρα μένει ίδια σε κάθε ζώνη ώρας. */
function atNoon(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

async function saveStep1(): Promise<boolean> {
  touched.value = true;
  if (!form.title.trim() || dateError.value) return false;

  const payload = {
    title: form.title.trim(),
    type: form.type,
    dateStart: atNoon(form.dateStart),
    dateEnd: atNoon(form.type === 'MONOIMERI' ? form.dateStart : form.dateEnd),
    location: form.location.trim() || undefined,
  };

  if (drasiId.value) {
    await patch(`/draseis/${drasiId.value}`, payload);
  } else {
    const created = await post<{ id: string }>('/draseis', {
      ...payload,
      kladosType: form.organiser ?? undefined,
      draft: true,
    });
    drasiId.value = created.id;
    if (form.organiser && !kladoi.value.includes(form.organiser)) kladoi.value = [form.organiser, ...kladoi.value];
    // Το URL κρατά το id: ανανέωση ή κλείσιμο της καρτέλας δεν χάνει το προσχέδιο.
    await router.replace({ query: { ...route.query, id: created.id } });
  }
  return true;
}

async function saveStep2(): Promise<boolean> {
  if (!drasiId.value) return false;
  await put(`/draseis/${drasiId.value}/kladoi`, { kladoi: kladoi.value });
  await put(`/draseis/${drasiId.value}/guest-topika`, {
    items: guests.value.map((g) => ({
      topikoCode: g.topikoCode,
      topikoName: g.topikoName,
      kladoi: g.kladoi,
      contactName: g.contactName || undefined,
      contactPhone: g.contactPhone || undefined,
    })),
  });
  return true;
}

/** Αρχηγείο + υπηρεσίες μαζί: το API αντικαθιστά το σύνολο. */
async function saveRoles(): Promise<boolean> {
  if (!drasiId.value) return false;
  const payload: { kind: DrasiRoleKind; userId: string }[] = [];
  for (const kind of DRASI_ARXIGEIO_KINDS) for (const userId of roles[kind]) payload.push({ kind, userId });
  for (const kind of DRASI_YPIRESIA_KINDS) {
    if (!enabledServices.value.includes(kind)) continue;
    for (const userId of roles[kind]) payload.push({ kind, userId });
  }
  await put(`/draseis/${drasiId.value}/roles`, { roles: payload });
  return true;
}

async function saveCurrent(): Promise<boolean> {
  if (step.value === 1) return saveStep1();
  if (step.value === 2) return saveStep2();
  return saveRoles();
}

async function run(action: () => Promise<void>, failure: string): Promise<void> {
  saving.value = true;
  try {
    await action();
  } catch (err) {
    notifyError(err, failure);
  } finally {
    saving.value = false;
  }
}

function next(): void {
  void run(async () => {
    if (await saveCurrent()) step.value += 1;
  }, 'Αποτυχία αποθήκευσης.');
}

function skip(): void {
  void run(async () => {
    if (await saveRoles()) step.value += 1;
  }, 'Αποτυχία αποθήκευσης.');
}

function saveAndExit(): void {
  void run(async () => {
    if (!(await saveCurrent())) return;
    $q.notify({ type: 'positive', message: 'Η δράση αποθηκεύτηκε ως προσχέδιο.' });
    await router.push(inKlados.value ? { name: 'klados-draseis' } : { name: 'dashboard' });
  }, 'Αποτυχία αποθήκευσης.');
}

function finish(): void {
  void run(async () => {
    if (!(await saveRoles()) || !drasiId.value) return;
    await patch(`/draseis/${drasiId.value}`, { status: 'ENERGI' });
    $q.notify({ type: 'positive', message: 'Η δράση είναι έτοιμη.' });
    await router.push({ name: 'drasi', params: { id: drasiId.value } });
  }, 'Αποτυχία ολοκλήρωσης.');
}

// ── Συνέχεια προσχεδίου ──

async function resume(): Promise<void> {
  if (!drasiId.value) return;
  resuming.value = true;
  loadError.value = null;
  try {
    const d = await get<DrasiForWizard>(`/draseis/${drasiId.value}`);
    form.title = d.title;
    form.type = d.type;
    form.dateStart = toISODate(new Date(d.dateStart));
    form.dateEnd = toISODate(new Date(d.dateEnd));
    form.location = d.location ?? '';
    form.organiser = d.klados?.type ?? null;
    kladoi.value = d.kladoi;
    guests.value = d.guestTopika.map((g) => ({
      topikoCode: g.topikoCode,
      topikoName: g.topikoName,
      kladoi: g.kladoi,
      contactName: g.contactName ?? '',
      contactPhone: g.contactPhone ?? '',
    }));
    for (const kind of Object.values(DrasiRoleKind)) {
      roles[kind] = d.roles.filter((r) => r.kind === kind).map((r) => r.user.id);
    }
    enabledServices.value = DRASI_YPIRESIA_KINDS.filter((kind) => roles[kind].length > 0);

    // Ξεκινάμε από το πρώτο βήμα που δεν έχει συμπληρωθεί.
    const hasRoles = d.roles.length > 0;
    const hasWho = d.kladoi.length > 1 || d.guestTopika.length > 0;
    step.value = hasRoles ? 4 : hasWho ? 3 : 2;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    resuming.value = false;
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}

onMounted(() => {
  void loadStelexi();
  void resume();
});
</script>

<style scoped>
.wizard :deep(.q-stepper__tab--active),
.wizard :deep(.q-stepper__tab--done) {
  color: var(--klados-ink);
}
</style>
