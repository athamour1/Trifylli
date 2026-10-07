<template>
  <!--
    Οι ρυθμίσεις της δράσης: ό,τι όρισε το wizard, και ό,τι άλλο παραμετροποιείται,
    σε μία σελίδα με ανεξάρτητες ενότητες. Κάθε ενότητα αποθηκεύεται μόνη της.
  -->
  <div class="q-gutter-md">
    <!-- ── Βασικά ── -->
    <q-card flat bordered>
      <q-card-section class="text-subtitle2 q-pb-xs">Βασικά</q-card-section>
      <q-card-section class="q-pt-none">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-8"><q-input v-model="basic.title" label="Τίτλος" outlined dense maxlength="200" color="klados" /></div>
          <div class="col-12 col-md-4">
            <q-input :model-value="organiser ? KLADOS_LABEL[organiser] : 'Το Τοπικό'" label="Ποιος διοργανώνει" outlined dense readonly hint="Δεν αλλάζει μετά τη δημιουργία." />
          </div>
          <div class="col-12">
            <q-btn-toggle v-model="basic.type" unelevated toggle-color="klados" toggle-text-color="klados-on" :options="typeOptions" />
          </div>
          <div class="col-8 col-sm-4 col-md-3"><DateField v-model="basic.dateStart" :label="basic.type === 'MONOIMERI' ? 'Ημερομηνία' : 'Έναρξη'" /></div>
          <div class="col-4 col-sm-2 col-md-2"><TimeField v-model="basic.timeStart" label="Ώρα" hint="Αρχή του προγράμματος" /></div>
          <div v-if="basic.type !== 'MONOIMERI'" class="col-8 col-sm-4 col-md-3"><DateField v-model="basic.dateEnd" label="Λήξη" /></div>
          <div class="col-4 col-sm-2 col-md-2"><TimeField v-model="basic.timeEnd" label="Ώρα λήξης" /></div>
          <div class="col-12 col-md-4"><q-input v-model="basic.location" label="Τόπος" outlined dense maxlength="200" color="klados" /></div>
          <div class="col-12"><MarkdownField v-model="basic.description" label="Περιγραφή" placeholder="Λίγα λόγια για τη δράση — φαίνονται στο ντοσιέ." :min-height="80" /></div>
          <div v-if="basicError" class="col-12 text-negative text-caption">{{ basicError }}</div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn color="klados" text-color="klados-on" unelevated label="Αποθήκευση" :loading="busy === 'basic'" @click="saveBasic" />
      </q-card-actions>
    </q-card>

    <!-- ── Ποιοι έρχονται ── -->
    <q-card flat bordered>
      <q-card-section class="text-subtitle2 q-pb-xs">Ποιοι έρχονται</q-card-section>
      <q-card-section class="q-pt-none">
        <div class="text-caption text-grey-7">Δικοί μας κλάδοι</div>
        <q-option-group v-model="kladoi" type="checkbox" color="klados" inline :options="kladosOptions" />
        <q-separator class="q-my-md" />
        <div class="text-caption text-grey-7 q-mb-xs">Άλλα Τοπικά</div>
        <GuestTopikaEditor v-model="guests" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn color="klados" text-color="klados-on" unelevated label="Αποθήκευση" :loading="busy === 'who'" @click="saveWho" />
      </q-card-actions>
    </q-card>

    <!-- ── Αρχηγείο & υπηρεσίες ── -->
    <q-card flat bordered>
      <q-card-section class="text-subtitle2 q-pb-xs">Αρχηγείο</q-card-section>
      <q-card-section class="q-pt-none">
        <DrasiRolesEditor section="arxigeio" v-model="roles" v-model:enabled="enabledServices" :stelexi-options="stelexiOptions" :organiser="organiser" :exclude-drasi-id="drasiId" />
      </q-card-section>
      <q-card-section class="text-subtitle2 q-pb-xs">Υπηρεσίες</q-card-section>
      <q-card-section class="q-pt-none">
        <DrasiRolesEditor section="ypiresies" v-model="roles" v-model:enabled="enabledServices" :stelexi-options="stelexiOptions" :organiser="organiser" :exclude-drasi-id="drasiId" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn color="klados" text-color="klados-on" unelevated label="Αποθήκευση" :loading="busy === 'roles'" @click="saveRoles" />
      </q-card-actions>
    </q-card>

    <!-- ── Κόστη ── -->
    <q-card flat bordered>
      <q-card-section class="text-subtitle2 q-pb-xs">Προεπιλογές κόστους</q-card-section>
      <q-card-section class="q-pt-none">
        <div class="text-caption text-grey-7 q-mb-sm">Ισχύουν για όποιον προστίθεται από εδώ και πέρα· οι υπάρχοντες συμμετέχοντες αλλάζουν ένας-ένας.</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6 col-md-3"><q-input v-model.number="costs.costPerPerson" type="number" label="Πλήρης συμμετοχή €" outlined dense step="0.01" :min="0" color="klados" /></div>
          <div class="col-6 col-md-3"><q-input v-model.number="costs.costReduced" type="number" label="Μειωμένη συμμετοχή €" outlined dense step="0.01" :min="0" color="klados" /></div>
          <div class="col-6 col-md-3"><q-input v-model.number="costs.costStelexos" type="number" label="Συμμετοχή στελέχους €" outlined dense step="0.01" :min="0" color="klados" /></div>
          <div class="col-6 col-md-3"><q-input v-model.number="costs.transportCost" type="number" label="Μεταφορικά ανά άτομο €" outlined dense step="0.01" :min="0" color="klados" /></div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn color="klados" text-color="klados-on" unelevated label="Αποθήκευση" :loading="busy === 'costs'" @click="saveCosts" />
      </q-card-actions>
    </q-card>

    <!-- ── Κατάσταση ── -->
    <q-card flat bordered>
      <q-card-section class="text-subtitle2 q-pb-xs">Κατάσταση</q-card-section>
      <q-card-section class="q-pt-none">
        <div class="row items-center q-gutter-sm">
          <q-badge :color="status === 'ENERGI' ? 'positive' : status === 'KLEISTI' ? 'grey-8' : 'orange-7'" :label="DRASI_STATUS_LABEL[status]" />
          <span class="text-caption text-grey-7">
            <template v-if="status === 'PROSXEDIO'">Δεν μετράει σε ημερολόγιο και στατιστικά μέχρι να ενεργοποιηθεί.</template>
            <template v-else-if="status === 'KLEISTI'">Τα οικονομικά είναι κλειδωμένα.</template>
            <template v-else>Ενεργή — εμφανίζεται στο ημερολόγιο.</template>
          </span>
        </div>
      </q-card-section>
      <q-card-actions align="right" class="q-gutter-sm">
        <q-btn v-if="status === 'PROSXEDIO'" color="klados" text-color="klados-on" unelevated icon="check" label="Ενεργοποίηση" :loading="busy === 'status'" @click="setStatus('ENERGI')" />
        <q-btn v-if="status === 'ENERGI'" flat color="negative" icon="lock" label="Κλείσιμο δράσης" :loading="busy === 'status'" @click="confirmClose" />
        <q-btn v-if="status === 'KLEISTI'" flat color="klados" icon="lock_open" label="Άνοιγμα ξανά" :loading="busy === 'status'" @click="setStatus('ENERGI')" />
        <q-btn flat color="negative" icon="archive" label="Αρχειοθέτηση" @click="confirmArchive" />
      </q-card-actions>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import {
  DRASI_STATUS_LABEL,
  DRASI_TYPE_LABEL,
  DRASI_YPIRESIA_KINDS,
  DrasiRoleKind,
  KLADOI_IN_ORDER,
  KLADOS_LABEL,
  type DrasiGuestTopikoView,
  type DrasiRoleView,
  type DrasiStatus,
  type DrasiType,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import DateField from '../DateField.vue';
import MarkdownField from '../MarkdownField.vue';
import TimeField from '../TimeField.vue';
import DrasiRolesEditor from './DrasiRolesEditor.vue';
import GuestTopikaEditor from './GuestTopikaEditor.vue';
import { emptyRoles, type GuestTopikoForm, type RolesMap } from './types';
import { ApiError, del, get, patch, put } from '../../lib/api';
import { toISODate } from '../../lib/format';

export interface DrasiSettingsData {
  id: string;
  title: string;
  type: DrasiType;
  status: DrasiStatus;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  description: string | null;
  klados: { type: KladosType } | null;
  kladoi: KladosType[];
  guestTopika: DrasiGuestTopikoView[];
  roles: DrasiRoleView[];
  costPerPerson: string | number | null;
  costReduced: string | number | null;
  costStelexos: string | number | null;
  transportCost: string | number | null;
}

const props = defineProps<{ data: DrasiSettingsData }>();
const emit = defineEmits<{ changed: [] }>();

const $q = useQuasar();
const router = useRouter();
const busy = ref<string | null>(null);
const drasiId = computed(() => props.data.id);
const organiser = computed(() => props.data.klados?.type ?? null);
const status = computed(() => props.data.status);

const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const at = (date: string, time: string): string => new Date(`${date}T${time || '12:00'}:00`).toISOString();
const toNum = (v: string | number | null): number | null => (v === null || v === '' ? null : Number(v));

// ── Βασικά ──
const typeOptions = (Object.keys(DRASI_TYPE_LABEL) as DrasiType[]).map((value) => ({ label: DRASI_TYPE_LABEL[value], value }));
const basic = reactive({ title: '', type: 'MONOIMERI' as DrasiType, dateStart: '', timeStart: '09:00', dateEnd: '', timeEnd: '17:00', location: '', description: '' });
const basicError = computed(() => {
  if (!basic.title.trim()) return 'Η δράση θέλει τίτλο.';
  if (!basic.dateStart || !basic.timeStart) return 'Διάλεξε ημερομηνία και ώρα έναρξης.';
  if (basic.type !== 'MONOIMERI' && !basic.dateEnd) return 'Διάλεξε ημερομηνία λήξης.';
  if (basic.dateEnd && basic.dateEnd < basic.dateStart) return 'Η λήξη είναι πριν την έναρξη.';
  return null;
});
watch(
  () => [basic.type, basic.dateStart] as const,
  ([type, start]) => {
    if (type === 'MONOIMERI') basic.dateEnd = start;
    else if (!basic.dateEnd || basic.dateEnd < start) basic.dateEnd = start;
  },
);
async function saveBasic(): Promise<void> {
  if (basicError.value) {
    $q.notify({ type: 'warning', message: basicError.value });
    return;
  }
  await run('basic', async () => {
    await patch(`/draseis/${drasiId.value}`, {
      title: basic.title.trim(),
      type: basic.type,
      dateStart: at(basic.dateStart, basic.timeStart),
      dateEnd: at(basic.type === 'MONOIMERI' ? basic.dateStart : basic.dateEnd, basic.timeEnd || basic.timeStart),
      location: basic.location.trim() || undefined,
      description: basic.description.trim() || undefined,
    });
  });
}

// ── Ποιοι έρχονται ──
const kladoi = ref<KladosType[]>([]);
const guests = ref<GuestTopikoForm[]>([]);
const kladosOptions = computed(() => KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k, disable: k === organiser.value })));
async function saveWho(): Promise<void> {
  await run('who', async () => {
    await put(`/draseis/${drasiId.value}/kladoi`, { kladoi: kladoi.value });
    await put(`/draseis/${drasiId.value}/guest-topika`, {
      items: guests.value.map((g) => ({ topikoCode: g.topikoCode, topikoName: g.topikoName, kladoi: g.kladoi, contactName: g.contactName || undefined, contactPhone: g.contactPhone || undefined })),
    });
  });
}

// ── Αρχηγείο & υπηρεσίες ──
const roles = ref<RolesMap>(emptyRoles(Object.values(DrasiRoleKind)));
const enabledServices = ref<DrasiRoleKind[]>([]);
const stelexi = ref<MemberSummary[]>([]);
const stelexiOptions = computed(() => stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })));
async function saveRoles(): Promise<void> {
  await run('roles', async () => {
    const payload: { kind: DrasiRoleKind; userId: string }[] = [];
    for (const kind of Object.values(DrasiRoleKind)) {
      if (DRASI_YPIRESIA_KINDS.includes(kind) && !enabledServices.value.includes(kind)) continue;
      for (const userId of roles.value[kind]) payload.push({ kind, userId });
    }
    await put(`/draseis/${drasiId.value}/roles`, { roles: payload });
  });
}

// ── Κόστη ──
const costs = reactive({ costPerPerson: null as number | null, costReduced: null as number | null, costStelexos: null as number | null, transportCost: null as number | null });
async function saveCosts(): Promise<void> {
  const clean = (v: number | null) => (v === null || (v as unknown) === '' ? undefined : v);
  await run('costs', async () => {
    await patch(`/draseis/${drasiId.value}`, {
      costPerPerson: clean(costs.costPerPerson),
      costReduced: clean(costs.costReduced),
      costStelexos: clean(costs.costStelexos),
      transportCost: clean(costs.transportCost),
    });
  });
}

// ── Κατάσταση ──
async function setStatus(next: DrasiStatus): Promise<void> {
  await run('status', async () => {
    await patch(`/draseis/${drasiId.value}`, { status: next });
  });
}
function confirmClose(): void {
  $q.dialog({
    title: 'Κλείσιμο δράσης',
    message: 'Το ταμείο κλειδώνει: καμία κίνηση, πληρωμή ή λογαριασμός δεν αλλάζει μετά. Συνέχεια;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Κλείσιμο', color: 'negative' },
    persistent: true,
  }).onOk(() => void setStatus('KLEISTI'));
}
function confirmArchive(): void {
  $q.dialog({
    title: 'Αρχειοθέτηση δράσης',
    message: `Η «${props.data.title}» θα φύγει από τις λίστες και το ημερολόγιο. Τα δεδομένα της μένουν. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Αρχειοθέτηση', color: 'negative' },
    persistent: true,
  }).onOk(async () => {
    try {
      await del(`/draseis/${drasiId.value}`);
      $q.notify({ type: 'positive', message: 'Η δράση αρχειοθετήθηκε.' });
      await router.push(organiser.value ? { name: 'klados-draseis', params: { klados: organiser.value } } : { name: 'dashboard' });
    } catch (err) {
      notifyError(err, 'Αποτυχία.');
    }
  });
}

// ── Φόρτωση από τα δεδομένα της δράσης ──
function fill(d: DrasiSettingsData): void {
  Object.assign(basic, {
    title: d.title,
    type: d.type,
    dateStart: toISODate(new Date(d.dateStart)),
    timeStart: hm(d.dateStart),
    dateEnd: toISODate(new Date(d.dateEnd)),
    timeEnd: hm(d.dateEnd),
    location: d.location ?? '',
    description: d.description ?? '',
  });
  kladoi.value = d.kladoi;
  guests.value = d.guestTopika.map((g) => ({ topikoCode: g.topikoCode, topikoName: g.topikoName, kladoi: g.kladoi, contactName: g.contactName ?? '', contactPhone: g.contactPhone ?? '' }));
  const next = emptyRoles(Object.values(DrasiRoleKind));
  for (const r of d.roles) next[r.kind].push(r.user.id);
  roles.value = next;
  enabledServices.value = DRASI_YPIRESIA_KINDS.filter((k) => next[k].length > 0);
  Object.assign(costs, { costPerPerson: toNum(d.costPerPerson), costReduced: toNum(d.costReduced), costStelexos: toNum(d.costStelexos), transportCost: toNum(d.transportCost) });
}
watch(() => props.data, fill, { immediate: true });

onMounted(async () => {
  try {
    stelexi.value = (await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } })).items;
  } catch {
    // Χωρίς στελέχη οι pickers μένουν άδειοι.
  }
});

async function run(what: string, action: () => Promise<void>): Promise<void> {
  busy.value = what;
  try {
    await action();
    emit('changed');
    $q.notify({ type: 'positive', message: 'Αποθηκεύτηκε.' });
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    busy.value = null;
  }
}
function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>
