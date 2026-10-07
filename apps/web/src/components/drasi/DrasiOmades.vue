<template>
  <div>
    <!-- Ένα είδος ανά υποκαρτέλα: η υποομάδα κάθε κλάδου που συμμετέχει, και οι σκηνές. -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn-toggle
        v-model="kind"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="kindOptions"
      />
      <q-space />
      <template v-if="canWrite">
        <q-btn flat color="klados" icon="auto_awesome" label="Αυτόματη κατανομή" :disable="!unassigned.length" @click="openAuto" />
        <q-btn color="klados" text-color="klados-on" unelevated icon="add" :label="`Νέα ${DRASI_GROUP_KIND_LABEL[kind].toLowerCase()}`" @click="openCreate" />
      </template>
    </div>

    <q-inner-loading :showing="loading" />

    <div class="row q-col-gutter-md">
      <!-- Ομάδες -->
      <div class="col-12 col-md-9">
        <div v-if="!currentGroups.length" class="text-center text-grey-6 q-pa-lg">
          <q-icon name="groups_3" size="40px" class="block q-mb-sm" />
          Καμία {{ DRASI_GROUP_KIND_LABEL[kind].toLowerCase() }} ακόμη.
        </div>
        <div v-else class="row q-col-gutter-md">
          <div v-for="g in currentGroups" :key="g.id" class="col-12 col-sm-6 col-lg-4">
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
                <div v-if="!g.members.length" class="text-caption text-grey-6">Χωρίς μέλη.</div>
                <div class="row q-gutter-xs">
                  <q-chip
                    v-for="m in g.members"
                    :key="m.participantId"
                    dense
                    :removable="canWrite"
                    :icon="g.leaderParticipantId === m.participantId ? 'star' : undefined"
                    :color="g.leaderParticipantId === m.participantId ? 'amber-2' : undefined"
                    @remove="removeMember(g, m)"
                  >
                    {{ m.user.lastName }} {{ m.user.firstName }}
                    <q-tooltip v-if="age(m)">{{ age(m) }} ετών</q-tooltip>
                  </q-chip>
                </div>
              </q-card-section>
              <q-card-actions v-if="canWrite" class="q-pt-none column items-stretch q-gutter-xs">
                <q-select
                  :model-value="null"
                  :options="unassignedOptions"
                  label="Προσθήκη μέλους"
                  outlined
                  dense
                  options-dense
                  emit-value
                  map-options
                  color="klados"
                  :disable="!unassigned.length"
                  @update:model-value="(pid: string) => addMember(g, pid)"
                />
                <q-select
                  v-if="g.members.length && kind !== 'SKINI'"
                  :model-value="g.leaderParticipantId"
                  :options="g.members.map((m) => ({ label: `${m.user.lastName} ${m.user.firstName}`, value: m.participantId }))"
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
                  <span v-if="m.user.kladosType">{{ KLADOS_LABEL[m.user.kladosType] }}</span>
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
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Νέα {{ DRASI_GROUP_KIND_LABEL[kind].toLowerCase() }}</q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="createForm.name" label="Όνομα *" outlined dense autofocus color="klados" @keyup.enter="submitCreate" />
          <q-select
            v-if="kind !== 'SKINI'"
            v-model="createForm.kladosType"
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
          <q-btn color="klados" text-color="klados-on" label="Δημιουργία" :disable="!createForm.name.trim()" :loading="saving" @click="submitCreate" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Αυτόματη κατανομή ── -->
    <q-dialog v-model="autoDialog">
      <q-card style="min-width: min(380px, 94vw)">
        <q-card-section class="text-subtitle1 text-weight-medium q-pb-none">Αυτόματη κατανομή</q-card-section>
        <q-card-section class="text-caption text-grey-7">
          Οι {{ unassigned.length }} αταξινόμητοι μοιράζονται με ανάμειξη ηλικιών.
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
  DRASI_GROUP_KIND_BY_KLADOS,
  DRASI_GROUP_KIND_LABEL,
  DRASI_GROUP_KIND_PLURAL,
  KLADOS_LABEL,
  KLADOS_META,
  sortKladoi,
  type DrasiGroupKind,
  type DrasiGroupMemberView,
  type DrasiGroupView,
  type DrasiGroupsView,
  type KladosType,
} from '@trifylli/shared';
import { ApiError, del, get, patch, post, put } from '../../lib/api';
import { kladosVars } from '../../lib/klados-theme';

const props = defineProps<{
  drasiId: string;
  kladoi: KladosType[];
  /** Ο διοργανωτής — η υποομάδα του ανοίγει πρώτη. */
  organiser: KladosType | null;
  canWrite: boolean;
}>();

const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const data = ref<DrasiGroupsView | null>(null);

/** Τα είδη που έχουν νόημα εδώ: η υποομάδα κάθε κλάδου που συμμετέχει + σκηνές. */
const kinds = computed<DrasiGroupKind[]>(() => {
  const fromKladoi = sortKladoi(props.kladoi).map((k) => DRASI_GROUP_KIND_BY_KLADOS[k]);
  return [...new Set<DrasiGroupKind>([...fromKladoi, 'SKINI'])];
});
const kind = ref<DrasiGroupKind>(props.organiser ? DRASI_GROUP_KIND_BY_KLADOS[props.organiser] : (kinds.value[0] ?? 'SKINI'));
watch(kinds, (list) => {
  if (!list.includes(kind.value)) kind.value = list[0] ?? 'SKINI';
});
const kindOptions = computed(() => kinds.value.map((k) => ({ label: DRASI_GROUP_KIND_PLURAL[k], value: k })));
const leaderLabel = computed(() => (kind.value === 'ENOMOTIA' ? 'Ενωμοτάρχης' : 'Ομαδάρχης'));

/** Οι κλάδοι που αντιστοιχούν στο τρέχον είδος (για νέα ομάδα / αυτόματη κατανομή). */
const kladoiForKind = computed(() => sortKladoi(props.kladoi).filter((k) => DRASI_GROUP_KIND_BY_KLADOS[k] === kind.value));
const kladosOptions = computed(() => kladoiForKind.value.map((k) => ({ label: KLADOS_LABEL[k], value: k })));

const currentGroups = computed(() => (data.value?.groups ?? []).filter((g) => g.kind === kind.value));

/** Αταξινόμητοι για το είδος: παιδιά (όχι στελέχη) που δεν είναι σε καμία ομάδα του είδους. */
const unassigned = computed<DrasiGroupMemberView[]>(() => {
  if (!data.value) return [];
  const placed = new Set(currentGroups.value.flatMap((g) => g.members.map((m) => m.participantId)));
  return data.value.participants.filter((p) => {
    if (placed.has(p.participantId) || p.user.kind === 'STELEXOS') return false;
    // Για υποομάδες κλάδου: μόνο τα παιδιά των κλάδων αυτού του είδους (οι φιλοξενούμενοι χωρίς κλάδο παντού).
    if (kind.value !== 'SKINI' && p.user.kladosType && !kladoiForKind.value.includes(p.user.kladosType)) return false;
    return true;
  });
});
const unassignedOptions = computed(() =>
  unassigned.value.map((m) => ({ label: `${m.user.lastName} ${m.user.firstName}`, value: m.participantId })),
);

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
const createForm = reactive({ name: '', kladosType: null as KladosType | null });
function openCreate(): void {
  createForm.name = `${DRASI_GROUP_KIND_LABEL[kind.value]} ${currentGroups.value.length + 1}`;
  createForm.kladosType = kladoiForKind.value[0] ?? null;
  createDialog.value = true;
}
async function submitCreate(): Promise<void> {
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/groups`, {
      kind: kind.value,
      name: createForm.name.trim(),
      ...(kind.value !== 'SKINI' && createForm.kladosType ? { kladosType: createForm.kladosType } : {}),
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
  autoForm.count = Math.max(1, Math.ceil(unassigned.value.length / 6));
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
