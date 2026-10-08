<template>
  <q-page padding>
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
              <SegmentedToggle
                v-model="form.type"
                unelevated
                toggle-color="klados"
                toggle-text-color="klados-on"
                :options="typeOptions"
              />
            </div>
            <div v-if="form.type !== 'MONOIMERI'" class="col-12">
              <q-toggle v-model="form.hasSkines" color="klados" label="Η δράση έχει σκηνές" />
              <div class="text-caption text-grey-7">Χωρίς σκηνές η κατάταξη σε σκηνές κρύβεται από τις Ομάδες και την Εκτύπωση. Ό,τι υπάρχει δεν σβήνεται — επιστρέφει αν το ξανανοίξεις.</div>
            </div>

            <div class="col-7 col-sm-4 col-md-3">
              <DateField v-model="form.dateStart" :label="form.type === 'MONOIMERI' ? 'Ημερομηνία' : 'Έναρξη'" />
            </div>
            <div class="col-5 col-sm-2 col-md-2">
              <TimeField v-model="form.timeStart" label="Ώρα" hint="Από εδώ ξεκινά το πρόγραμμα" />
            </div>
            <div v-if="form.type !== 'MONOIMERI'" class="col-7 col-sm-4 col-md-3">
              <DateField v-model="form.dateEnd" label="Λήξη" />
            </div>
            <div class="col-5 col-sm-2 col-md-2">
              <TimeField v-model="form.timeEnd" label="Ώρα λήξης" />
            </div>
            <div class="col-12 col-md-2">
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
          <GuestTopikaEditor v-model="guests" />

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
          <DrasiRolesEditor
            section="arxigeio"
            v-model="roles"
            v-model:enabled="enabledServices"
            :stelexi-options="stelexiOptions"
            :organiser="form.organiser"
            :exclude-drasi-id="drasiId ?? undefined"
          />

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
          <DrasiRolesEditor
            section="ypiresies"
            v-model="roles"
            v-model:enabled="enabledServices"
            :stelexi-options="stelexiOptions"
            :organiser="form.organiser"
            :exclude-drasi-id="drasiId ?? undefined"
          />

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
  DRASI_TYPE_LABEL,
  DRASI_YPIRESIA_KINDS,
  DrasiRoleKind,
  KLADOI_IN_ORDER,
  KLADOS_LABEL,
  type DrasiStatus,
  type DrasiType,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import DateField from '../components/DateField.vue';
import PageState from '../components/PageState.vue';
import TimeField from '../components/TimeField.vue';
import DrasiRolesEditor from '../components/drasi/DrasiRolesEditor.vue';
import GuestTopikaEditor from '../components/drasi/GuestTopikaEditor.vue';
import { emptyRoles, type GuestTopikoForm, type RolesMap } from '../components/drasi/types';
import { useKladosScope } from '../composables/useKladosScope';
import { ApiError, get, patch, post, put } from '../lib/api';
import { toISODate } from '../lib/format';
import { useAuthStore } from '../stores/auth';

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
  hasSkines: boolean;
}

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { klados: routeKlados, inKlados } = useKladosScope();

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
  /** Η ώρα έναρξης — από εδώ ξεκινά το ωρολόγιο της πρώτης ημέρας. */
  timeStart: '09:00',
  dateEnd: '',
  timeEnd: '17:00',
  location: '',
  /** Πολυήμερες/κατασκηνώσεις: έχει σκηνές; (οι μονοήμερες ποτέ) */
  hasSkines: true,
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
  if (!form.timeStart) return 'Διάλεξε ώρα έναρξης.';
  if (form.type !== 'MONOIMERI' && !form.dateEnd) return 'Διάλεξε ημερομηνία λήξης.';
  if (form.dateEnd && form.dateEnd < form.dateStart) return 'Η λήξη είναι πριν την έναρξη.';
  if (form.dateEnd === form.dateStart && form.timeEnd && form.timeEnd <= form.timeStart) return 'Η ώρα λήξης είναι πριν την έναρξη.';
  return null;
});

// ── Βήμα 2 ──
const kladoi = ref<KladosType[]>(routeKlados.value ? [routeKlados.value] : []);
const guests = ref<GuestTopikoForm[]>([]);

/** Ο διοργανωτής συμμετέχει εξ ορισμού — δεν ξετσεκάρεται. */
const kladosOptions = computed(() =>
  KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k, disable: k === form.organiser })),
);
// ── Βήματα 3-4 ──
const roles = ref<RolesMap>(emptyRoles(Object.values(DrasiRoleKind)));
const enabledServices = ref<DrasiRoleKind[]>([]);
const stelexi = ref<MemberSummary[]>([]);

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

// ── Αποθήκευση ανά βήμα ──

/** Τοπική ημερομηνία + «HH:mm» → ISO. Η ώρα έναρξης είναι η αρχή του ωρολογίου. */
function at(date: string, time: string): string {
  return new Date(`${date}T${time || '12:00'}:00`).toISOString();
}

/** «HH:mm» τοπικής ώρας ενός ISO instant. */
function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function saveStep1(): Promise<boolean> {
  touched.value = true;
  if (!form.title.trim() || dateError.value) return false;

  const payload = {
    title: form.title.trim(),
    type: form.type,
    dateStart: at(form.dateStart, form.timeStart),
    dateEnd: at(form.type === 'MONOIMERI' ? form.dateStart : form.dateEnd, form.timeEnd || form.timeStart),
    location: form.location.trim() || undefined,
    ...(form.type !== 'MONOIMERI' ? { hasSkines: form.hasSkines } : {}),
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
  for (const kind of DRASI_ARXIGEIO_KINDS) for (const userId of roles.value[kind]) payload.push({ kind, userId });
  for (const kind of DRASI_YPIRESIA_KINDS) {
    if (!enabledServices.value.includes(kind)) continue;
    for (const userId of roles.value[kind]) payload.push({ kind, userId });
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
    await router.push(inKlados.value ? { name: 'klados-draseis' } : { name: 'draseis' });
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
    form.timeStart = hm(d.dateStart);
    form.dateEnd = toISODate(new Date(d.dateEnd));
    form.timeEnd = hm(d.dateEnd);
    form.location = d.location ?? '';
    form.hasSkines = d.hasSkines;
    form.organiser = d.klados?.type ?? null;
    kladoi.value = d.kladoi;
    guests.value = d.guestTopika.map((g) => ({
      topikoCode: g.topikoCode,
      topikoName: g.topikoName,
      kladoi: g.kladoi,
      contactName: g.contactName ?? '',
      contactPhone: g.contactPhone ?? '',
    }));
    const next = emptyRoles(Object.values(DrasiRoleKind));
    for (const kind of Object.values(DrasiRoleKind)) {
      next[kind] = d.roles.filter((r) => r.kind === kind).map((r) => r.user.id);
    }
    roles.value = next;
    enabledServices.value = DRASI_YPIRESIA_KINDS.filter((kind) => next[kind].length > 0);

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
