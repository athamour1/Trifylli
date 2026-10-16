<template>
  <!--
    Η δράση ζωντανά, για κινητό: τι γίνεται τώρα (και πόσο μένει), τι ακολουθεί,
    ποιος έχει την ευθύνη. «Καθυστερούμε» μετακινεί τις επόμενες ώρες για όλους —
    οι προγραμματισμένες ώρες μένουν (για το ντοσιέ και την αξιολόγηση).
  -->
  <div class="drasi-live">
    <div v-if="!day" class="text-center text-grey-7 q-pa-lg">
      <q-icon name="event" size="40px" class="block q-mx-auto q-mb-sm" />
      {{ outside }}
    </div>

    <template v-else>
      <div class="row items-center q-mb-sm">
        <div class="text-caption text-grey-7 col">Σήμερα · {{ formatDate(day.date) }} · τώρα {{ hm(now) }}</div>
        <q-badge v-if="totalDelay" :color="totalDelay > 0 ? 'orange-8' : 'positive'" :label="`${totalDelay > 0 ? '+' : '−'}${Math.abs(totalDelay)}΄ στο πρόγραμμα`" />
      </div>

      <!-- Τώρα -->
      <q-card flat class="live-now q-mb-md" :class="{ 'live-now--idle': !live.current }">
        <q-card-section>
          <div class="text-overline text-grey-7">{{ live.current ? 'Τώρα' : liveLabel }}</div>
          <template v-if="live.current">
            <div class="text-h5 text-weight-medium q-mt-xs">{{ live.current.item.title }}</div>
            <div class="row items-center q-gutter-sm q-mt-sm text-body2">
              <span><q-icon name="schedule" size="18px" class="q-mr-xs" />{{ hm(live.current.start) }}–{{ hm(live.current.end) }}</span>
              <span class="text-weight-medium">μένουν {{ formatDuration(live.remainingMin) }}</span>
              <span v-if="live.current.delayMin" class="text-orange-9">({{ delayText(live.current.delayMin) }})</span>
            </div>
            <div v-if="live.current.item.location" class="text-body2 q-mt-xs"><q-icon name="place" size="18px" class="q-mr-xs" />{{ live.current.item.location }}</div>
            <div v-if="live.current.item.responsibles.length" class="text-body2 q-mt-xs">
              <q-icon name="assignment_ind" size="18px" class="q-mr-xs" />{{ names(live.current.item.responsibles) }}
            </div>
            <q-linear-progress :value="progress" color="klados" track-color="transparent" rounded class="q-mt-md" size="6px" />
          </template>
          <div v-else-if="live.next[0]" class="text-body1 q-mt-xs">
            Επόμενο: <b>{{ live.next[0].item.title }}</b> στις {{ hm(live.next[0].start) }}
          </div>
        </q-card-section>
        <q-card-actions v-if="live.current" align="right" class="q-pt-none">
          <q-btn flat dense no-caps color="klados" icon="description" label="Προγραμματικό" :to="{ name: 'drasi-programmatiko', params: { id: drasiId, itemId: live.current.id } }" />
        </q-card-actions>
      </q-card>

      <!-- Καθυστέρηση -->
      <div v-if="canWrite && delayTarget" class="row items-center q-gutter-xs q-mb-md">
        <span class="text-caption text-grey-7 q-mr-xs">Καθυστερούμε — όλα από «{{ delayTarget.item.title }}» και μετά:</span>
        <q-btn v-for="minutes in [5, 10, 15, 30]" :key="minutes" unelevated dense no-caps size="sm" color="orange-8" :label="`+${minutes}΄`" :loading="busy === minutes" @click="delay(minutes)" />
        <q-btn flat dense no-caps size="sm" color="positive" label="κερδίσαμε 10΄" :loading="busy === -10" @click="delay(-10)" />
      </div>

      <!-- Μετά -->
      <div v-if="live.next.length" class="text-subtitle2 q-mb-xs">Μετά</div>
      <q-list v-if="live.next.length" separator class="live-next">
        <q-item v-for="entry in live.next.slice(0, 6)" :key="entry.id" clickable :to="{ name: 'drasi-programmatiko', params: { id: drasiId, itemId: entry.id } }">
          <q-item-section side class="live-next__time">
            <div class="text-weight-medium">{{ hm(entry.start) }}</div>
            <div v-if="entry.delayMin" class="text-caption text-orange-9">{{ delayText(entry.delayMin) }}</div>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ entry.item.title }}</q-item-label>
            <q-item-label caption>
              {{ formatDuration(entry.item.durationMin) }}<template v-if="entry.item.responsibles.length"> · {{ names(entry.item.responsibles) }}</template>
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>

      <!-- Οι καθυστερήσεις της ημέρας -->
      <div v-if="day.delays.length" class="q-mt-md">
        <div class="text-caption text-grey-7 q-mb-xs">Καθυστερήσεις σήμερα</div>
        <q-chip
          v-for="d in day.delays"
          :key="d.id"
          dense
          :removable="canWrite"
          :color="d.minutes > 0 ? 'orange-1' : 'green-1'"
          :text-color="d.minutes > 0 ? 'orange-10' : 'green-10'"
          @remove="undo(d.id)"
        >
          {{ delayText(d.minutes) }} από «{{ titleOf(d.itemId) }}»<template v-if="d.by"> · {{ d.by.firstName }}</template>
        </q-chip>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { DrasiScheduleView } from '@trifylli/shared';
import { del, post } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';
import { liveDay } from '../../lib/schedule-live';

const props = defineProps<{ drasiId: string; view: DrasiScheduleView; canWrite: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const $q = useQuasar();
const now = ref(new Date());
const timer = setInterval(() => (now.value = new Date()), 20_000);
onBeforeUnmount(() => clearInterval(timer));

/** «YYYY-MM-DD» στην ώρα της συσκευής (όχι UTC: στις 00:30 είναι ήδη η επόμενη μέρα). */
const localDay = (date: Date): string => date.toLocaleDateString('en-CA');
const day = computed(() => props.view.days.find((d) => d.date === localDay(now.value)) ?? null);
const live = computed(() => liveDay(day.value?.items ?? [], now.value));
const totalDelay = computed(() => (day.value?.delays ?? []).reduce((sum, d) => sum + d.minutes, 0));

/** Η δράση δεν τρέχει σήμερα: πότε αρχίζει ή ότι τελείωσε. */
const outside = computed(() => {
  const today = localDay(now.value);
  const first = props.view.days.find((d) => d.items.length);
  const last = [...props.view.days].reverse().find((d) => d.items.length);
  if (!first) return 'Το ωρολόγιο είναι άδειο.';
  if (first.date > today) return `Η δράση αρχίζει ${formatDate(first.date)} στις ${hm(new Date(first.items[0]!.startsAt))}.`;
  if (last && last.date < today) return 'Η δράση τελείωσε.';
  return 'Σήμερα δεν υπάρχει πρόγραμμα.';
});

const liveLabel = computed(() => {
  switch (live.value.state) {
    case 'before':
      return 'Δεν ξεκινήσαμε ακόμα';
    case 'after':
      return 'Τελείωσε το πρόγραμμα της ημέρας';
    default:
      return 'Διάλειμμα';
  }
});

const progress = computed(() => {
  const current = live.value.current;
  if (!current) return 0;
  const total = current.end.getTime() - current.start.getTime();
  return total > 0 ? Math.min(1, Math.max(0, (now.value.getTime() - current.start.getTime()) / total)) : 0;
});

/**
 * Η καθυστέρηση μετρά από το επόμενο στοιχείο: το τωρινό κρατά όσο παραπάνω
 * (βλ. `liveDay`). Στο τελευταίο της ημέρας, από το ίδιο.
 */
const delayTarget = computed(() => live.value.next[0] ?? live.value.current ?? null);

function hm(date: Date): string {
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function delayText(minutes: number): string {
  return `${minutes > 0 ? '+' : '−'}${Math.abs(minutes)}΄`;
}
function names(people: { firstName: string; lastName: string }[]): string {
  return people.map((person) => `${person.firstName} ${person.lastName.charAt(0)}.`).join(', ');
}
function titleOf(itemId: string): string {
  return day.value?.items.find((item) => item.id === itemId)?.title ?? '—';
}

const busy = ref<number | null>(null);
async function delay(minutes: number): Promise<void> {
  const target = delayTarget.value;
  if (!target) return;
  busy.value = minutes;
  try {
    await post(`/draseis/${props.drasiId}/schedule/delays`, { itemId: target.id, minutes });
    emit('changed');
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν δηλώθηκε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    busy.value = null;
  }
}

async function undo(delayId: string): Promise<void> {
  try {
    await del(`/draseis/${props.drasiId}/schedule/delays/${delayId}`);
    emit('changed');
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν αναιρέθηκε — δοκίμασε ξανά με δίκτυο.' });
  }
}
</script>

<style scoped lang="scss">
.live-now {
  border-radius: 16px;
  background: color-mix(in srgb, var(--klados-ink) 12%, var(--surface));
}
.live-now--idle {
  background: var(--tint-soft);
}
.live-next {
  border-radius: 12px;
  background: var(--tint-soft);
}
.live-next__time {
  min-width: 64px;
  align-items: flex-start;
}
</style>
