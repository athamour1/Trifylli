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
            <SegmentedToggle v-model="basic.type" unelevated toggle-color="klados" toggle-text-color="klados-on" :options="typeOptions" />
          </div>
          <!-- Οι μονοήμερες δεν έχουν ποτέ σκηνές· η επιλογή υπάρχει μόνο για τις υπόλοιπες. -->
          <div v-if="basic.type !== 'MONOIMERI'" class="col-12">
            <q-toggle v-model="basic.hasSkines" color="klados" label="Η δράση έχει σκηνές" />
              <div class="text-caption text-grey-7">Χωρίς σκηνές η κατάταξη σε σκηνές κρύβεται από τις Ομάδες και την Εκτύπωση. Ό,τι υπάρχει δεν σβήνεται — επιστρέφει αν το ξανανοίξεις.</div>
          </div>
          <div class="col-7 col-sm-4 col-md-3"><DateField v-model="basic.dateStart" :label="basic.type === 'MONOIMERI' ? 'Ημερομηνία' : 'Έναρξη'" /></div>
          <div class="col-5 col-sm-2 col-md-2"><TimeField v-model="basic.timeStart" label="Ώρα" hint="Αρχή του προγράμματος" /></div>
          <div v-if="basic.type !== 'MONOIMERI'" class="col-7 col-sm-4 col-md-3"><DateField v-model="basic.dateEnd" label="Λήξη" /></div>
          <div class="col-5 col-sm-2 col-md-2"><TimeField v-model="basic.timeEnd" label="Ώρα λήξης" /></div>
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

    <!-- ── Κόστη ── -->
    <q-card flat bordered>
      <q-card-section class="text-subtitle2 q-pb-xs">Προεπιλογές κόστους</q-card-section>
      <q-card-section class="q-pt-none">
        <div class="text-caption text-grey-7 q-mb-sm">Ισχύουν για όλους τους συμμετέχοντες — και για όσους υπάρχουν ήδη — εκτός όσων έχουν δικό τους ποσό. Τη μειωμένη την παίρνουν όσοι σημειώσεις έτσι (π.χ. αδέρφια).</div>
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
      </q-card-actions>
    </q-card>

    <!--
      ── Επικίνδυνη ζώνη ──
      Όπως στα repos: ό,τι δεν γυρίζει πίσω εύκολα, μαζεμένο σε ένα κόκκινο
      πλαίσιο στο τέλος, μακριά από τα κουμπιά αποθήκευσης.
    -->
    <q-card flat class="danger-zone">
      <q-card-section class="row items-center no-wrap q-pb-sm">
        <q-icon name="warning" color="negative" size="22px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-medium text-negative">Επικίνδυνη ζώνη</div>
      </q-card-section>

      <div class="danger-zone__list">
        <div class="danger-zone__row">
          <div class="danger-zone__text">
            <div class="text-weight-medium">Αρχειοθέτηση</div>
            <div class="text-caption text-grey-7">Φεύγει από λίστες και ημερολόγιο. Τα δεδομένα της, ταμείο και ιστορικό, μένουν όπως είναι.</div>
          </div>
          <q-btn outline no-caps color="negative" icon="archive" label="Αρχειοθέτηση" class="danger-zone__btn" @click="confirmArchive" />
        </div>

        <div class="danger-zone__row">
          <div class="danger-zone__text">
            <div class="text-weight-medium">Οριστική διαγραφή</div>
            <div class="text-caption text-grey-7">
              Σβήνει τη δράση μαζί με πρόγραμμα, μύθο, συμμετέχοντες, ομάδες, έντυπα και συμβούλια της. Δεν αναιρείται.
            </div>
            <div v-if="deletion.blockers.length" class="danger-zone__blockers q-mt-sm">
              <div class="text-caption text-weight-medium">Δεν γίνεται όσο υπάρχουν:</div>
              <ul class="q-my-xs q-pl-md">
                <li v-for="b in deletion.blockers" :key="b" class="text-caption">{{ b }}</li>
              </ul>
              <div class="text-caption">Αρχειοθέτησέ τη — τα χρήματα και το υλικό θέλουν το ιστορικό τους.</div>
            </div>
          </div>
          <q-btn
            unelevated no-caps color="negative" icon="delete_forever" label="Διαγραφή δράσης"
            class="danger-zone__btn"
            :disable="deletion.loading || deletion.blockers.length > 0"
            :loading="deletion.loading"
            @click="openDelete"
          />
        </div>
      </div>
    </q-card>

    <!-- Επιβεβαίωση με τον τίτλο: ένα πάτημα δεν φτάνει για κάτι που δεν γυρίζει. -->
    <q-dialog v-model="deletion.open" persistent>
      <!-- Τα πεδία ακολουθούν το χρώμα του κλάδου (app.scss)· εδώ θέλουμε κόκκινο. -->
      <q-card style="width: 460px; max-width: 100%; --klados-color: var(--q-negative); --klados-ink: var(--q-negative)">
        <q-card-section class="row items-center no-wrap">
          <q-avatar icon="delete_forever" color="negative" text-color="white" size="40px" class="q-mr-md" />
          <div class="text-h6">Διαγραφή δράσης</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <p class="q-mb-sm">
            Η <b>«{{ data.title }}»</b> θα σβηστεί οριστικά, μαζί με ό,τι περιέχει. Αυτό <b>δεν αναιρείται</b>.
          </p>
          <div class="text-caption text-grey-7 q-mb-xs">Γράψε τον τίτλο της δράσης για επιβεβαίωση:</div>
          <q-input
            v-model="deletion.typed"
            outlined dense autofocus color="negative"
            :placeholder="data.title"
            @keyup.enter="titleMatches && remove()"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps label="Άκυρο" :disable="deletion.busy" />
          <q-btn
            unelevated no-caps color="negative" icon="delete_forever" label="Το καταλαβαίνω, διαγραφή"
            :disable="!titleMatches"
            :loading="deletion.busy"
            @click="remove"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import {
  DRASI_STATUS_LABEL,
  DRASI_TYPE_LABEL,
  KLADOI_IN_ORDER,
  KLADOS_LABEL,
  type DrasiGuestTopikoView,
  type DrasiRoleView,
  type DrasiStatus,
  type DrasiType,
  type KladosType,
} from '@trifylli/shared';
import DateField from '../DateField.vue';
import MarkdownField from '../MarkdownField.vue';
import TimeField from '../TimeField.vue';
import GuestTopikaEditor from './GuestTopikaEditor.vue';
import type { GuestTopikoForm } from './types';
import { ApiError, del, get, patch, post, put } from '../../lib/api';
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
  hasSkines: boolean;
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
const basic = reactive({ title: '', type: 'MONOIMERI' as DrasiType, dateStart: '', timeStart: '09:00', dateEnd: '', timeEnd: '17:00', location: '', description: '', hasSkines: true });
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
      // Στη μονοήμερη δεν στέλνουμε τίποτα: η ρύθμιση μένει όπως ήταν, για αν ξαναγίνει πολυήμερη.
      ...(basic.type !== 'MONOIMERI' ? { hasSkines: basic.hasSkines } : {}),
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
    // Κλείσιμο / άνοιγμα από το δικό τους endpoint (κανόνας: και ο αρχηγός της δράσης).
    if (next === 'KLEISTI' || status.value === 'KLEISTI') await put(`/draseis/${drasiId.value}/closed`, { closed: next === 'KLEISTI' });
    else await patch(`/draseis/${drasiId.value}`, { status: next });
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
      await router.push(draseisRoute.value);
    } catch (err) {
      notifyError(err, 'Αποτυχία.');
    }
  });
}

/** Πού γυρίζουμε όταν η δράση φύγει: οι δράσεις του διοργανωτή, ή του Τοπικού. */
const draseisRoute = computed(() =>
  organiser.value ? { name: 'klados-draseis', params: { klados: organiser.value } } : { name: 'draseis' },
);

// ── Οριστική διαγραφή ──
const deletion = reactive({ open: false, typed: '', busy: false, loading: false, blockers: [] as string[] });
const titleMatches = computed(() => deletion.typed.trim() === props.data.title.trim());
async function loadBlockers(): Promise<void> {
  deletion.loading = true;
  try {
    deletion.blockers = (await get<{ blockers: string[] }>(`/draseis/${drasiId.value}/deletion`)).blockers;
  } catch {
    // Αν δεν φορτώσει, ο server ελέγχει ξανά στη διαγραφή — το κουμπί μένει ενεργό.
    deletion.blockers = [];
  } finally {
    deletion.loading = false;
  }
}
onMounted(loadBlockers);
function openDelete(): void {
  deletion.typed = '';
  deletion.open = true;
}
async function remove(): Promise<void> {
  if (!titleMatches.value) return;
  deletion.busy = true;
  try {
    await post(`/draseis/${drasiId.value}/delete`, { confirmTitle: deletion.typed });
    deletion.open = false;
    $q.notify({ type: 'positive', icon: 'delete_forever', message: `Η «${props.data.title}» διαγράφηκε.` });
    await router.push(draseisRoute.value);
  } catch (err) {
    notifyError(err, 'Η δράση δεν διαγράφηκε.');
    await loadBlockers();
  } finally {
    deletion.busy = false;
  }
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
    hasSkines: d.hasSkines,
  });
  kladoi.value = d.kladoi;
  guests.value = d.guestTopika.map((g) => ({ topikoCode: g.topikoCode, topikoName: g.topikoName, kladoi: g.kladoi, contactName: g.contactName ?? '', contactPhone: g.contactPhone ?? '' }));
  Object.assign(costs, { costPerPerson: toNum(d.costPerPerson), costReduced: toNum(d.costReduced), costStelexos: toNum(d.costStelexos), transportCost: toNum(d.transportCost) });
}
watch(() => props.data, fill, { immediate: true });


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

<style scoped lang="scss">
.danger-zone {
  border: 1px solid color-mix(in srgb, var(--q-negative) 55%, transparent);
  border-radius: 16px;
  overflow: hidden;
}
.danger-zone__list {
  margin: 0 12px 12px;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
}
.danger-zone__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 14px 16px;
  & + & {
    border-top: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  }
}
.danger-zone__text {
  flex: 1 1 280px;
  min-width: 0;
}
.danger-zone__btn {
  flex: none;
}
.danger-zone__blockers {
  padding: 8px 12px;
  border-radius: 10px;
  color: var(--q-negative);
  background: color-mix(in srgb, var(--q-negative) 9%, transparent);
}
</style>
