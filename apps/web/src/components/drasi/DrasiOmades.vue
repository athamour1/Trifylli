<template>
  <div>
    <!-- Ένα είδος ανά υποκαρτέλα: η υποομάδα κάθε κλάδου που συμμετέχει. Οι σκηνές
         ζουν στη δική τους ενότητα (mode="skines"), οπότε εκεί δεν υπάρχει επιλογή. -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <SegmentedToggle
        v-if="kindOptions.length > 1"
        v-model="kind"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="kindOptions"
      />
      <q-space />
      <template v-if="canWrite">
        <!-- Οι επιτροπές φτιάχνονται γύρω από προγραμματικά, όχι με κλήρωση ηλικιών. -->
        <q-btn v-if="kind !== 'EPITROPI'" flat color="klados" icon="auto_awesome" label="Αυτόματη κατανομή" :disable="!unassignedKids.length" @click="openAuto" />
        <q-btn color="klados" text-color="klados-on" unelevated icon="add" :label="`Νέα ${kindLower(kind)}`" @click="openCreate" />
      </template>
    </div>

    <q-inner-loading :showing="loading" />

    <div class="row q-col-gutter-md">
      <!-- Ομάδες -->
      <div class="col-12 col-md-9">
        <div v-if="!currentGroups.length" class="text-center text-grey-6 q-pa-lg">
          <q-icon :name="kind === 'SKINI' ? 'night_shelter' : 'groups_3'" size="40px" class="block q-mb-sm" />
          Καμία {{ kindLower(kind) }} ακόμη.
        </div>
        <div v-else class="row q-col-gutter-md">
          <!-- Τρεις στήλες μόνο σε πολύ πλατιές οθόνες: η στήλη περιεχομένου έχει ήδη
               δεξιά της τους αταξινόμητους και αριστερά το συρτάρι ενοτήτων, και με
               τρεις κάρτες στα 1440px τα ονόματα δεν χωρούσαν. -->
          <div v-for="g in currentGroups" :key="g.id" class="col-12 col-sm-6 col-xl-4">
            <q-card flat bordered class="full-height column">
              <q-card-section class="q-pb-xs">
                <div class="row items-center no-wrap">
                  <q-chip v-if="g.kladosType" dense :style="kladosVars(g.kladosType)" class="bg-klados text-klados-on q-mr-xs" :icon="KLADOS_META[g.kladosType].icon" />
                  <div class="text-subtitle1 text-weight-medium ellipsis col">{{ g.name }}</div>
                  <q-badge outline color="grey-7" :label="`${g.members.length}`" />
                  <q-btn v-if="canWrite" flat dense round size="sm" icon="more_vert">
                    <q-menu>
                      <q-list dense style="min-width: 180px">
                        <q-item clickable v-close-popup @click="rename(g)"><q-item-section>Μετονομασία</q-item-section></q-item>
                        <q-item clickable v-close-popup @click="remove(g)"><q-item-section class="text-negative">Διαγραφή</q-item-section></q-item>
                      </q-list>
                    </q-menu>
                  </q-btn>
                </div>
              </q-card-section>
              <q-card-section class="q-pt-none col">
                <!-- Επιτροπή: ποιο προγραμματικό ετοιμάζει. -->
                <router-link
                  v-if="kind === 'EPITROPI' && g.scheduleItem"
                  :to="{ name: 'drasi-programmatiko', params: { id: drasiId, itemId: g.scheduleItem.id } }"
                  class="row items-center no-wrap q-mb-sm text-klados text-caption text-weight-medium epitropi-link"
                >
                  <q-icon name="description" size="16px" class="q-mr-xs" />
                  <span class="ellipsis">{{ g.scheduleItem.title }} · {{ formatDayShort(g.scheduleItem.date) }}</span>
                </router-link>
                <div v-else-if="kind === 'EPITROPI'" class="text-caption text-grey-6 q-mb-sm">Χωρίς προγραμματικό.</div>
                <!-- ΟΕ: το υπεύθυνο στέλεχος — δεν είναι μέλος, φαίνεται χωριστά. -->
                <div v-if="kind === 'OE' && g.leaderParticipantId" class="row items-center no-wrap q-mb-sm text-caption">
                  <q-icon name="badge" size="16px" color="klados" class="q-mr-xs" />
                  <span class="text-grey-7 q-mr-xs">Υπεύθυνο:</span>
                  <span class="text-weight-medium ellipsis">{{ participantName(g.leaderParticipantId) }}</span>
                </div>
                <div v-if="!g.members.length" class="text-caption text-grey-6">Χωρίς μέλη.</div>
                <div class="row q-gutter-xs">
                  <q-chip
                    v-for="m in g.members"
                    :key="m.participantId"
                    dense
                    :removable="canWrite"
:icon="g.leaderParticipantId === m.participantId ? 'star' : m.user.kind === 'STELEXOS' ? 'badge' : undefined"
                    :color="g.leaderParticipantId === m.participantId ? 'klados' : undefined"
                    :text-color="g.leaderParticipantId === m.participantId ? 'klados-on' : undefined"
                    class="omada-chip"
                    @remove="removeMember(g, m)"
                  >
                    {{ m.user.lastName }} {{ m.user.firstName }}
                    <q-tooltip v-if="age(m)">{{ age(m) }} ετών</q-tooltip>
                  </q-chip>
                </div>
              </q-card-section>
              <q-card-actions v-if="canWrite" class="q-pt-none column items-stretch omada-actions">
                <!-- Μόνο όσο υπάρχουν αταξινόμητοι — αλλιώς δεν έχει τι να προσθέσει. -->
                <q-select
                  v-if="unassigned.length"
                  :model-value="null"
                  :options="unassignedOptions"
                  label="Προσθήκη μέλους"
                  outlined
                  dense
                  options-dense
                  emit-value
                  map-options
                  color="klados"
                  @update:model-value="(pid: string) => addMember(g, pid)"
                />
                <q-select
                  v-if="leaderLabel && leaderOptions(g).length"
                  :model-value="g.leaderParticipantId"
                  :options="leaderOptions(g)"
                  :label="leaderLabel"
                  outlined
                  dense
                  options-dense
                  emit-value
                  map-options
                  clearable
                  color="klados"
                  @update:model-value="(pid: string | null) => setLeader(g, pid)"
                />
                <q-select
                  v-if="kind === 'EPITROPI'"
                  :model-value="g.scheduleItem?.id ?? null"
                  :options="programmeOptions(g)"
                  label="Προγραμματικό"
                  outlined
                  dense
                  options-dense
                  emit-value
                  map-options
                  clearable
                  color="klados"
                  @update:model-value="(sid: string | null) => setProgramme(g, sid)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Αταξινόμητοι -->
      <div class="col-12 col-md-3">
        <q-card flat bordered>
          <q-card-section class="q-pb-xs">
            <div class="text-subtitle2">Αταξινόμητοι <q-badge :color="unassigned.length ? 'orange-7' : 'positive'" :label="`${unassigned.length}`" /></div>
          </q-card-section>
          <q-list dense>
            <q-item v-for="m in unassigned" :key="m.participantId">
              <q-item-section>
                <q-item-label>{{ m.user.lastName }} {{ m.user.firstName }}</q-item-label>
                <q-item-label caption>
                  <span v-if="m.user.kind === 'STELEXOS'">Στέλεχος</span>
                  <span v-else-if="m.user.kladosType">{{ KLADOS_LABEL[m.user.kladosType] }}</span>
                  <span v-if="age(m)"> · {{ age(m) }} ετών</span>
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-if="!unassigned.length"><q-item-section class="text-caption text-positive">Όλοι έχουν τοποθετηθεί.</q-item-section></q-item>
          </q-list>
        </q-card>
      </div>
    </div>

    <!-- ── Νέα ομάδα ── -->
    <q-dialog v-model="createDialog">
      <q-card style="min-width: min(380px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Νέα {{ kindLower(kind) }}</q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="createForm.name" label="Όνομα *" outlined dense autofocus color="klados" @keyup.enter="submitCreate" />
          <q-select
            v-if="kind !== 'SKINI' && kladosOptions.length > 1"
            v-model="createForm.kladosType"
            :options="kladosOptions"
            label="Κλάδος"
            outlined
            dense
            emit-value
            map-options
            color="klados"
          />
          <q-select
            v-if="kind === 'EPITROPI'"
            v-model="createForm.scheduleItemId"
            :options="programmeOptions(null)"
            label="Προγραμματικό που ετοιμάζει"
            outlined
            dense
            options-dense
            emit-value
            map-options
            clearable
            color="klados"
            hint="Από το ωρολόγιο της δράσης. Αλλάζει και μετά."
            @update:model-value="onPickProgramme"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Δημιουργία" :disable="!createForm.name.trim()" :loading="saving" @click="submitCreate" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Αυτόματη κατανομή ── -->
    <q-dialog v-model="autoDialog">
      <q-card style="min-width: min(380px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Αυτόματη κατανομή</q-card-section>
        <q-card-section class="text-caption text-grey-7">
          Τα {{ unassignedKids.length }} αταξινόμητα παιδιά μοιράζονται με ανάμειξη ηλικιών.<span v-if="unassignedKids.length < unassigned.length"> Τα στελέχη μπαίνουν με το χέρι.</span>
          <span v-if="currentGroups.length"> Γεμίζουν οι υπάρχουσες ομάδες, οι μικρότερες πρώτα.</span>
        </q-card-section>
        <q-card-section v-if="!currentGroups.length" class="q-pt-none q-gutter-sm">
          <q-input v-model.number="autoForm.count" type="number" label="Πόσες ομάδες" outlined dense :min="1" :max="40" color="klados" />
          <q-select
            v-if="kind !== 'SKINI'"
            v-model="autoForm.kladosType"
            :options="kladosOptions"
            label="Κλάδος"
            outlined
            dense
            emit-value
            map-options
            color="klados"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Κατανομή" :loading="saving" @click="submitAuto" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_GROUP_KINDS_BY_KLADOS,
  DRASI_GROUP_KIND_FULL,
  DRASI_GROUP_KIND_LABEL,
  DRASI_GROUP_KIND_PLURAL,
  DRASI_GROUP_LEADER_LABEL,
  KLADOS_LABEL,
  KLADOS_META,
  sortKladoi,
  type DrasiGroupKind,
  type DrasiGroupMemberView,
  type DrasiGroupView,
  type DrasiGroupsView,
  type DrasiScheduleView,
  type KladosType,
} from '@trifylli/shared';
import { ApiError, del, get, patch, post, put } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { kladosVars } from '../../lib/klados-theme';

const props = defineProps<{
  drasiId: string;
  kladoi: KladosType[];
  /** Ο διοργανωτής — η υποομάδα του ανοίγει πρώτη. */
  organiser: KladosType | null;
  /** `groups` = οι υποομάδες των κλάδων· `skines` = μόνο οι σκηνές (δική τους ενότητα). */
  mode: 'groups' | 'skines';
  canWrite: boolean;
}>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const data = ref<DrasiGroupsView | null>(null);

/**
 * Τα είδη που έχουν νόημα εδώ: οι υποομάδες κάθε κλάδου που συμμετέχει (οι
 * Μεγάλοι Οδηγοί έχουν δύο: επιτροπές και ΟΕ) + σκηνές, όπου η δράση έχει.
 */
const kinds = computed<DrasiGroupKind[]>(() =>
  props.mode === 'skines' ? ['SKINI'] : [...new Set(sortKladoi(props.kladoi).flatMap((k) => DRASI_GROUP_KINDS_BY_KLADOS[k]))],
);
const kind = ref<DrasiGroupKind>(
  props.mode === 'skines'
    ? 'SKINI'
    : (props.organiser ? DRASI_GROUP_KINDS_BY_KLADOS[props.organiser][0] : undefined) ?? kinds.value[0] ?? 'SKINI',
);
watch(kinds, (list) => {
  if (!list.includes(kind.value)) kind.value = list[0] ?? 'SKINI';
});
const kindOptions = computed(() => kinds.value.map((k) => ({ label: DRASI_GROUP_KIND_PLURAL[k], value: k, title: DRASI_GROUP_KIND_FULL[k] })));
/** `null` ⇒ το είδος δεν έχει υπεύθυνο (επιτροπές, σκηνές). */
/** «νέα ενωμοτία», αλλά «νέα ΟΕ» — η συντομογραφία μένει κεφαλαία. */
function kindLower(k: DrasiGroupKind): string {
  return k === 'OE' ? DRASI_GROUP_KIND_LABEL[k] : DRASI_GROUP_KIND_LABEL[k].toLowerCase();
}
const leaderLabel = computed(() => DRASI_GROUP_LEADER_LABEL[kind.value]);

/** Οι κλάδοι που αντιστοιχούν στο τρέχον είδος (για νέα ομάδα / αυτόματη κατανομή). */
const kladoiForKind = computed(() => sortKladoi(props.kladoi).filter((k) => DRASI_GROUP_KINDS_BY_KLADOS[k].includes(kind.value)));
const kladosOptions = computed(() => kladoiForKind.value.map((k) => ({ label: KLADOS_LABEL[k], value: k })));

const currentGroups = computed(() => (data.value?.groups ?? []).filter((g) => g.kind === kind.value));

/**
 * Αταξινόμητοι για το είδος: όσοι δεν είναι σε καμία ομάδα του. Παιδιά παντού·
 * στις επιτροπές και στελέχη (ετοιμάζουν κι αυτά προγραμματικά), και στις σκηνές
 * (κι αυτά κάπου κοιμούνται).
 */
const unassigned = computed<DrasiGroupMemberView[]>(() => {
  if (!data.value) return [];
  const placed = new Set(currentGroups.value.flatMap((g) => g.members.map((m) => m.participantId)));
  return data.value.participants.filter((p) => {
    if (placed.has(p.participantId)) return false;
    if (p.user.kind === 'STELEXOS') return kind.value === 'EPITROPI' || kind.value === 'SKINI';
    // Για υποομάδες κλάδου: μόνο τα παιδιά των κλάδων αυτού του είδους (οι φιλοξενούμενοι χωρίς κλάδο παντού).
    if (kind.value !== 'SKINI' && p.user.kladosType && !kladoiForKind.value.includes(p.user.kladosType)) return false;
    return true;
  });
});
/** Η αυτόματη κατανομή μοιράζει μόνο παιδιά· τα στελέχη μπαίνουν με το χέρι (συνήθως στη δική τους σκηνή). */
const unassignedKids = computed(() => unassigned.value.filter((p) => p.user.kind !== 'STELEXOS'));
const unassignedOptions = computed(() =>
  unassigned.value.map((m) => ({ label: `${m.user.lastName} ${m.user.firstName}`, value: m.participantId })),
);

const stelexi = computed(() => (data.value?.participants ?? []).filter((p) => p.user.kind === 'STELEXOS'));

function participantName(participantId: string): string {
  const p = data.value?.participants.find((x) => x.participantId === participantId);
  return p ? `${p.user.lastName} ${p.user.firstName}` : '—';
}

/** Ποιοι μπορούν να είναι υπεύθυνοι: στις ΟΕ τα στελέχη της δράσης, αλλού τα μέλη της ομάδας. */
function leaderOptions(g: DrasiGroupView): { label: string; value: string }[] {
  const pool = kind.value === 'OE' ? stelexi.value : g.members;
  return pool.map((m) => ({ label: `${m.user.lastName} ${m.user.firstName}`, value: m.participantId }));
}

// ── Επιτροπές ↔ προγραμματικά ──
const schedule = ref<DrasiScheduleView | null>(null);
async function loadSchedule(): Promise<void> {
  if (!kinds.value.includes('EPITROPI') || schedule.value) return;
  try {
    schedule.value = await get<DrasiScheduleView>(`/draseis/${props.drasiId}/schedule`);
  } catch {
    // Χωρίς ωρολόγιο οι επιτροπές απλώς δεν συνδέονται· δεν μπλοκάρει την ενότητα.
  }
}
watch(kinds, () => void loadSchedule(), { immediate: true });

function formatDayShort(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y ? `${d}/${m}` : iso;
}

/** Τα προγραμματικά της δράσης· όσα έχει ήδη άλλη επιτροπή εμφανίζονται απενεργοποιημένα. */
function programmeOptions(self: DrasiGroupView | null): { label: string; value: string; disable: boolean }[] {
  const taken = new Map(
    (data.value?.groups ?? [])
      .filter((x) => x.kind === 'EPITROPI' && x.scheduleItem && x.id !== self?.id)
      .map((x) => [x.scheduleItem!.id, x.name]),
  );
  return (schedule.value?.days ?? []).flatMap((day) =>
    day.items
      // Ό,τι ετοιμάζεται από ανθρώπους: δραστηριότητες, τελετές, «άλλο» — όχι γεύματα/ξεκούραση/μετακινήσεις/υπηρεσίες.
      .filter((it) => it.kind === 'DRASTIRIOTITA' || it.kind === 'TELETI' || it.kind === 'ALLO')
      .map((it) => ({
        label: `${formatDayShort(day.date)} ${formatTime(it.startsAt)} · ${it.title}${taken.has(it.id) ? ` (${taken.get(it.id)})` : ''}`,
        value: it.id,
        disable: taken.has(it.id),
      })),
  );
}

async function setProgramme(g: DrasiGroupView, scheduleItemId: string | null): Promise<void> {
  try {
    await patch(`/draseis/${props.drasiId}/groups/${g.id}`, { scheduleItemId });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

function age(m: DrasiGroupMemberView): number | null {
  if (!m.user.birthDate) return null;
  const b = new Date(m.user.birthDate);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) years -= 1;
  return years;
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    data.value = await get<DrasiGroupsView>(`/draseis/${props.drasiId}/groups`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης ομάδων.');
  } finally {
    loading.value = false;
  }
}
onMounted(reload);

// ── Μέλη ──
async function addMember(g: DrasiGroupView, participantId: string): Promise<void> {
  if (!participantId) return;
  await setMembers(g, [...g.members.map((m) => m.participantId), participantId]);
}
async function removeMember(g: DrasiGroupView, m: DrasiGroupMemberView): Promise<void> {
  await setMembers(g, g.members.filter((x) => x.participantId !== m.participantId).map((x) => x.participantId));
}
async function setMembers(g: DrasiGroupView, participantIds: string[]): Promise<void> {
  try {
    await put(`/draseis/${props.drasiId}/groups/${g.id}/members`, { participantIds });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}
async function setLeader(g: DrasiGroupView, participantId: string | null): Promise<void> {
  try {
    await patch(`/draseis/${props.drasiId}/groups/${g.id}`, { leaderParticipantId: participantId });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Ομάδες ──
const createDialog = ref(false);
const createForm = reactive({ name: '', kladosType: null as KladosType | null, scheduleItemId: null as string | null });
/** Το όνομα ακολουθεί το προγραμματικό, όσο ο χρήστης δεν το έχει αλλάξει. */
let autoName = '';
function openCreate(): void {
  autoName = `${DRASI_GROUP_KIND_LABEL[kind.value]} ${currentGroups.value.length + 1}`;
  createForm.name = autoName;
  createForm.kladosType = kladoiForKind.value[0] ?? null;
  createForm.scheduleItemId = null;
  createDialog.value = true;
}
function onPickProgramme(id: string | null): void {
  const item = schedule.value?.days.flatMap((d) => d.items).find((it) => it.id === id);
  if (item && (createForm.name === autoName || !createForm.name.trim())) {
    autoName = `Επιτροπή: ${item.title}`;
    createForm.name = autoName;
  }
}
async function submitCreate(): Promise<void> {
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/groups`, {
      kind: kind.value,
      name: createForm.name.trim(),
      ...(kind.value !== 'SKINI' && createForm.kladosType ? { kladosType: createForm.kladosType } : {}),
      ...(kind.value === 'EPITROPI' && createForm.scheduleItemId ? { scheduleItemId: createForm.scheduleItemId } : {}),
    });
    createDialog.value = false;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία δημιουργίας.');
  } finally {
    saving.value = false;
  }
}
function rename(g: DrasiGroupView): void {
  $q.dialog({
    title: 'Μετονομασία',
    prompt: { model: g.name, type: 'text', isValid: (v: string) => v.trim().length > 0 },
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Αποθήκευση', color: 'primary' },
  }).onOk(async (name: string) => {
    try {
      await patch(`/draseis/${props.drasiId}/groups/${g.id}`, { name: name.trim() });
      await reload();
    } catch (err) {
      notifyError(err, 'Αποτυχία.');
    }
  });
}
function remove(g: DrasiGroupView): void {
  $q.dialog({
    title: 'Διαγραφή ομάδας',
    message: `Η «${g.name}» θα διαγραφεί· τα μέλη της γίνονται αταξινόμητα. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/groups/${g.id}`);
      await reload();
    } catch (err) {
      notifyError(err, 'Αποτυχία.');
    }
  });
}

// ── Αυτόματη κατανομή ──
const autoDialog = ref(false);
const autoForm = reactive({ count: 3, kladosType: null as KladosType | null });
function openAuto(): void {
  autoForm.count = Math.max(1, Math.ceil(unassignedKids.value.length / 6));
  autoForm.kladosType = kladoiForKind.value[0] ?? null;
  autoDialog.value = true;
}
async function submitAuto(): Promise<void> {
  saving.value = true;
  try {
    const r = await post<{ created: number; assigned: number }>(`/draseis/${props.drasiId}/groups/auto`, {
      kind: kind.value,
      ...(kind.value !== 'SKINI' && autoForm.kladosType ? { kladosType: autoForm.kladosType } : {}),
      ...(autoForm.count ? { count: autoForm.count } : {}),
    });
    autoDialog.value = false;
    $q.notify({ type: 'positive', message: `${r.assigned} παιδιά τοποθετήθηκαν${r.created ? ` σε ${r.created} νέες ομάδες` : ''}.` });
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία κατανομής.');
  } finally {
    saving.value = false;
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}

defineExpose({ reload });
</script>

<style scoped>
/* Μεγάλα ονόματα: το chip κόβεται με αποσιωπητικά αντί να ξεφεύγει από την κάρτα. */
.omada-chip {
  max-width: 100%;
}
.omada-chip :deep(.q-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Κάθετο κενό ανάμεσα στα δύο select χωρίς τα αρνητικά περιθώρια του q-gutter,
   που μέσα σε στήλη έσπρωχναν το πεδίο έξω από την κάρτα. */
.omada-actions {
  gap: 6px;
}
.omada-actions > .q-field {
  min-width: 0;
}
.epitropi-link {
  text-decoration: none;
  min-width: 0;
}
.epitropi-link:hover span {
  text-decoration: underline;
}
</style>
