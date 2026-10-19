<template>
  <q-card v-if="canStart || current" flat bordered class="q-mb-md">
    <q-card-section class="row items-center q-pb-xs">
      <q-icon name="groups" size="20px" class="q-mr-sm text-klados" />
      <div class="text-subtitle2 col">Καταμέτρηση</div>
      <q-btn v-if="canStart && !starting && !current" flat dense no-caps color="klados" icon="add" label="Νέα" @click="starting = true" />
    </q-card-section>

    <!-- Νέα: τίτλος και ανά τι μετράμε -->
    <q-card-section v-if="starting" class="q-pt-xs">
      <div class="row q-col-gutter-sm items-center">
        <div class="col-12 col-sm-6">
          <q-input v-model="title" dense outlined autofocus color="klados" label="Τι μετράμε" placeholder="π.χ. Αναχώρηση από Μέγαρα" :maxlength="120" />
        </div>
        <div class="col-8 col-sm-4">
          <q-select v-if="kindOptions.length" v-model="kind" :options="kindOptions" dense outlined emit-value map-options color="klados" label="Ανά" />
          <div v-else class="text-caption text-grey-7">Η δράση δεν έχει ομάδες για καταμέτρηση.</div>
        </div>
        <div class="col-4 col-sm-2 row no-wrap justify-end">
          <q-btn flat dense no-caps label="Άκυρο" @click="starting = false" />
          <q-btn unelevated dense no-caps color="klados" label="Έναρξη" class="q-px-sm" :disable="!title.trim() || !kind" :loading="busy" @click="start" />
        </div>
      </div>
    </q-card-section>

    <!-- Η τρέχουσα: σύνολο, ποιοι λείπουν, και κάθε ομάδα -->
    <template v-if="current">
      <q-card-section class="q-pt-xs">
        <div class="row items-center no-wrap">
          <div class="col">
            <div class="text-weight-medium">{{ current.title }}</div>
            <div class="text-caption text-grey-7">
              {{ DRASI_GROUP_KIND_PLURAL[current.groupKind] }} · {{ current.by ? `${current.by.firstName} ${current.by.lastName.charAt(0)}.` : '' }} · {{ formatDateTime(current.at) }}
            </div>
          </div>
          <div class="text-h5 text-weight-bold q-ml-sm" :class="totals.absent ? 'text-negative' : totals.checkedGroups === totals.groups ? 'text-positive' : ''">
            {{ totals.present }}/{{ totals.members }}
          </div>
        </div>
        <div class="text-caption q-mt-xs">
          {{ totals.checkedGroups }}/{{ totals.groups }} ομάδες μετρήθηκαν
          <span v-if="current.closedAt"> · έκλεισε</span>
        </div>
        <div v-if="missing.length" class="headcount-missing q-mt-sm">
          <q-icon name="warning" color="negative" size="18px" class="q-mr-xs" />
          Λείπουν: {{ missing.map((m) => `${m.firstName} ${m.lastName}`).join(', ') }}
        </div>
      </q-card-section>

      <q-list dense separator>
        <q-item v-for="group in current.groups" :key="group.id" clickable :disable="!!current.closedAt" @click="openGroup(group)">
          <q-item-section avatar>
            <q-icon :name="groupIcon(group).icon" :color="groupIcon(group).color" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ group.name }}</q-item-label>
            <q-item-label caption>{{ groupCaption(group) }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge v-if="pending.has(group.id)" color="orange-8" label="στην ουρά" />
            <span v-else class="text-caption">{{ group.members.length }}</span>
          </q-item-section>
        </q-item>
      </q-list>

      <q-card-actions v-if="canStart" align="right">
        <q-btn flat dense no-caps color="negative" icon="delete_outline" label="Διαγραφή" @click="remove" />
        <q-space />
        <q-btn v-if="!current.closedAt" flat dense no-caps icon="flag" label="Τέλος" @click="close(true)" />
        <template v-else>
          <q-btn flat dense no-caps icon="restart_alt" label="Ξανά ανοιχτή" @click="close(false)" />
          <q-btn flat dense no-caps color="klados" icon="add" label="Νέα" @click="starting = true" />
        </template>
      </q-card-actions>
    </template>

    <!-- Μέτρηση μιας ομάδας: όλοι παρόντες εκτός όσων πατήσεις -->
    <q-dialog v-model="groupDialog" :maximized="$q.screen.lt.sm">
      <q-card v-if="editing" style="width: min(440px, 96vw)">
        <q-card-section class="row items-center no-wrap q-py-sm">
          <div class="col">
            <div class="text-subtitle1">{{ editing.name }}</div>
            <div class="text-caption text-grey-7">Πάτα όποιον λείπει.</div>
          </div>
          <q-btn v-close-popup flat round dense icon="close" aria-label="Κλείσιμο" />
        </q-card-section>
        <q-separator />
        <q-list>
          <q-item v-for="member in editing.members" :key="member.id" clickable @click="toggleAbsent(member.id)">
            <q-item-section avatar>
              <q-icon :name="absent.has(member.id) ? 'person_off' : 'check_circle'" :color="absent.has(member.id) ? 'negative' : 'positive'" />
            </q-item-section>
            <q-item-section>
              <q-item-label :class="{ 'text-negative': absent.has(member.id) }">{{ member.lastName }} {{ member.firstName }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <span class="text-caption" :class="absent.has(member.id) ? 'text-negative' : 'text-grey-7'">{{ absent.has(member.id) ? 'λείπει' : 'εδώ' }}</span>
            </q-item-section>
          </q-item>
        </q-list>
        <q-card-actions align="right">
          <q-btn v-if="absent.size" flat dense no-caps label="Όλοι εδώ" @click="absent = new Set()" />
          <q-btn unelevated no-caps :color="absent.size ? 'negative' : 'positive'" :label="absent.size ? `Λείπουν ${absent.size}` : 'Όλοι εδώ'" class="q-px-md" @click="saveGroup" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_GROUP_KIND_PLURAL,
  type DrasiGroupKind,
  type DrasiHeadcountGroupView,
  type DrasiHeadcountView,
} from '@trifylli/shared';
import { useAsyncData } from '../../composables/useAsyncData';
import { useLiveReload } from '../../composables/useLiveChanges';
import { del, get, post } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useOfflineStore } from '../../stores/offline';

/**
 * Η καταμέτρηση της δράσης: ο Αρχηγός ξεκινά («Αναχώρηση από Μέγαρα») ανά
 * ενωμοτία ή σκηνή, και κάθε στέλεχος μετρά μια ομάδα — «όλοι εδώ» ή ποιοι
 * λείπουν. Δουλεύει και χωρίς σήμα: η μέτρηση μπαίνει στην ουρά της συσκευής
 * και φεύγει μόλις πιάσει.
 */
const props = defineProps<{
  drasiId: string;
  canStart: boolean;
  /** Ανά τι μπορεί να μετρήσει η δράση (shared `drasiHeadcountKinds`): οι ομάδες των κλάδων της, σκηνές αν έχει. */
  kinds: DrasiGroupKind[];
}>();

const $q = useQuasar();
const offline = useOfflineStore();
const { data, reload } = useAsyncData(() => get<DrasiHeadcountView[]>(`/draseis/${props.drasiId}/headcounts`), {
  cacheKey: `drasi-headcounts:${props.drasiId}`,
});
useLiveReload(['headcounts', 'groups'], reload);

/** Μετρήσεις αυτής της συσκευής που δεν έχουν φτάσει ακόμα (ουρά χωρίς σήμα). */
const pending = ref(new Map<string, { absentIds: string[]; at: string }>());

const current = computed(() => {
  const latest = data.value?.[0] ?? null;
  if (!latest) return null;
  // Οι δικές μας μετρήσεις της ουράς φαίνονται κιόλας, με την ώρα τους.
  const groups = latest.groups.map((group) => {
    const local = pending.value.get(group.id);
    if (!local || (group.check && group.check.at >= local.at)) return group;
    return { ...group, check: { absentIds: local.absentIds, by: null, at: local.at } };
  });
  return { ...latest, groups };
});

const totals = computed(() => {
  const groups = current.value?.groups ?? [];
  let present = 0;
  let absent = 0;
  let checkedGroups = 0;
  for (const group of groups) {
    if (!group.check) continue;
    checkedGroups += 1;
    const missing = group.members.filter((m) => group.check!.absentIds.includes(m.id)).length;
    absent += missing;
    present += group.members.length - missing;
  }
  return { present, absent, checkedGroups, groups: groups.length, members: groups.reduce((sum, g) => sum + g.members.length, 0) };
});

const missing = computed(() =>
  (current.value?.groups ?? []).flatMap((group) => group.members.filter((member) => group.check?.absentIds.includes(member.id))),
);

const kindOptions = computed(() => props.kinds.map((value) => ({ label: DRASI_GROUP_KIND_PLURAL[value], value })));

function groupIcon(group: DrasiHeadcountGroupView): { icon: string; color: string } {
  if (!group.check) return { icon: 'radio_button_unchecked', color: 'grey-6' };
  return group.check.absentIds.length ? { icon: 'error', color: 'negative' } : { icon: 'check_circle', color: 'positive' };
}

function groupCaption(group: DrasiHeadcountGroupView): string {
  if (!group.check) return 'δεν μετρήθηκε ακόμα';
  const who = group.check.by ? `${group.check.by.firstName} ${group.check.by.lastName.charAt(0)}.` : 'εσύ';
  const when = new Date(group.check.at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const missingCount = group.check.absentIds.length;
  return `${missingCount ? `λείπ${missingCount === 1 ? 'ει 1' : `ουν ${missingCount}`}` : 'όλοι εδώ'} · ${who} · ${when}`;
}

// ── Νέα καταμέτρηση ──
const starting = ref(false);
const title = ref('');
const kind = ref<DrasiGroupKind | null>(props.kinds[0] ?? null);
const busy = ref(false);
// Άλλαξαν οι κλάδοι ή οι σκηνές της δράσης: η επιλογή μένει μόνο αν ισχύει ακόμα.
watch(
  () => props.kinds,
  (kinds) => {
    if (!kind.value || !kinds.includes(kind.value)) kind.value = kinds[0] ?? null;
  },
);

async function start(): Promise<void> {
  busy.value = true;
  try {
    await post(`/draseis/${props.drasiId}/headcounts`, { title: title.value.trim(), groupKind: kind.value });
    starting.value = false;
    title.value = '';
    pending.value = new Map();
    await reload();
  } catch (error) {
    $q.notify({ type: 'negative', message: error instanceof Error ? error.message : 'Δεν ξεκίνησε.' });
  } finally {
    busy.value = false;
  }
}

function remove(): void {
  const headcount = current.value;
  if (!headcount) return;
  $q.dialog({
    title: 'Διαγραφή καταμέτρησης',
    message: `Να σβηστεί η καταμέτρηση «${headcount.title}»; Χάνονται και οι μετρήσεις των ομάδων.`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/headcounts/${headcount.id}`);
      pending.value = new Map();
      await reload();
    } catch {
      $q.notify({ type: 'negative', message: 'Δεν σβήστηκε — δοκίμασε ξανά με δίκτυο.' });
    }
  });
}

async function close(closed: boolean): Promise<void> {
  if (!current.value) return;
  try {
    await post(`/draseis/${props.drasiId}/headcounts/${current.value.id}/close`, { closed });
    await reload();
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν έγινε — δοκίμασε ξανά με δίκτυο.' });
  }
}

// ── Μέτρηση ομάδας ──
const groupDialog = ref(false);
const editing = ref<DrasiHeadcountGroupView | null>(null);
const absent = ref(new Set<string>());

function openGroup(group: DrasiHeadcountGroupView): void {
  editing.value = group;
  absent.value = new Set(group.check?.absentIds ?? []);
  groupDialog.value = true;
}

function toggleAbsent(id: string): void {
  const next = new Set(absent.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  absent.value = next;
}

/** Στέλνεται τώρα — ή μπαίνει στην ουρά και φεύγει μόλις πιάσει σήμα (η νεότερη κερδίζει). */
async function saveGroup(): Promise<void> {
  const headcount = current.value;
  const group = editing.value;
  if (!headcount || !group) return;
  const body = { absentIds: [...absent.value], checkedAt: new Date().toISOString() };
  groupDialog.value = false;
  try {
    const result = await offline.submit('PUT', `/draseis/${props.drasiId}/headcounts/${headcount.id}/groups/${group.id}`, body, { replace: true });
    if (result.queued) {
      pending.value = new Map(pending.value).set(group.id, { absentIds: body.absentIds, at: body.checkedAt });
      $q.notify({ type: 'warning', message: 'Χωρίς σήμα — η μέτρηση θα σταλεί μόλις συνδεθείς.' });
    } else {
      const next = new Map(pending.value);
      next.delete(group.id);
      pending.value = next;
      await reload();
    }
  } catch {
    $q.notify({ type: 'negative', message: 'Η μέτρηση δεν στάλθηκε.' });
  }
}
</script>

<style scoped lang="scss">
.headcount-missing {
  padding: 6px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, #e53935 12%, transparent);
  font-size: 13px;
}
</style>
