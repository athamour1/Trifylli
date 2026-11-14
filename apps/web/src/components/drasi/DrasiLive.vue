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
            <div v-if="live.current.item.snack" class="q-mt-sm">
              <q-chip dense color="orange-7" text-color="white" :icon="snackIcon(live.current.item.snack)" :label="`${DRASI_SNACK_LABEL[live.current.item.snack]} τώρα`" class="q-ml-none" />
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

      <!--
        Πού είμαστε: 0 στη μέση, δεξιά = πίσω από το πρόγραμμα, αριστερά = μπροστά.
        Η τιμή είναι η μετατόπιση του επόμενου στοιχείου· στο άφημα δηλώνεται η διαφορά.
      -->
      <div v-if="canWrite && delayTarget" class="live-shift q-mb-md">
        <div class="row items-center no-wrap">
          <span class="text-caption text-grey-7 col ellipsis">Από «{{ delayTarget.item.title }}» και μετά</span>
          <span class="text-body2 text-weight-medium" :class="shift > 0 ? 'text-orange-9' : shift < 0 ? 'text-positive' : 'text-grey-7'">{{ shiftText(shift) }}</span>
        </div>
        <q-slider
          v-model="shift"
          :min="shiftMin"
          :max="shiftMax"
          :step="5"
          snap
          :markers="30"
          :marker-labels="shiftMarkers"
          :color="shift > 0 ? 'orange-8' : shift < 0 ? 'positive' : 'grey-6'"
          selection-color="transparent"
          class="q-px-md"
          :disable="busy"
          aria-label="Καθυστέρηση προγράμματος σε λεπτά"
          @change="commitShift"
        />
      </div>

      <!-- Μετά -->
      <div v-if="live.next.length" class="text-subtitle2 q-mb-xs">Μετά</div>
      <q-list v-if="live.next.length" separator class="live-next">
        <q-item v-for="entry in live.next" :key="entry.id" clickable :to="{ name: 'drasi-programmatiko', params: { id: drasiId, itemId: entry.id } }">
          <q-item-section side class="live-next__time">
            <div class="text-weight-medium">{{ hm(entry.start) }}</div>
            <div v-if="entry.delayMin" class="text-caption" :class="entry.delayMin > 0 ? 'text-orange-9' : 'text-positive'">{{ delayText(entry.delayMin) }}</div>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ entry.item.title }}</q-item-label>
            <q-item-label caption>
              {{ formatDuration(entry.item.durationMin) }}<template v-if="entry.item.responsibles.length"> · {{ names(entry.item.responsibles) }}</template>
            </q-item-label>
          </q-item-section>
          <q-item-section v-if="entry.item.snack" side>
            <q-badge color="orange-7"><q-icon :name="snackIcon(entry.item.snack)" size="14px" class="q-mr-xs" />{{ DRASI_SNACK_LABEL[entry.item.snack] }}</q-badge>
          </q-item-section>
        </q-item>
      </q-list>
      <div v-if="dayEnd" class="text-caption text-grey-7 text-center q-mt-sm">Τέλος ημέρας στις {{ hm(dayEnd) }}</div>

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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { DRASI_SNACK_LABEL, type DrasiScheduleView, type DrasiSnack } from '@trifylli/shared';
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

function snackIcon(snack: DrasiSnack): string {
  return snack === 'DEKATIANO' || snack === 'APOGEVMATINO' ? 'bakery_dining' : 'restaurant';
}

/** Πότε κλείνει η ημέρα (με την καθυστέρηση). */
const dayEnd = computed(() => (live.value.next.at(-1) ?? live.value.current)?.end ?? null);

/** Η μετατόπιση του επόμενου στοιχείου — αυτή δείχνει το slider. */
const targetShift = computed(() => delayTarget.value?.delayMin ?? 0);
/** Ό,τι έχει δεχτεί ο server — μπροστά από το `targetShift` ώσπου να ξαναφορτώσει το ωρολόγιο. */
const committed = ref(targetShift.value);
const shift = ref(targetShift.value);
watch(targetShift, (value) => {
  committed.value = value;
  shift.value = value;
});
/** Συμμετρικό γύρω από το 0, με χώρο πάνω από όση καθυστέρηση έχουμε ήδη. */
const shiftSpan = computed(() => Math.max(60, Math.ceil((Math.abs(committed.value) + 30) / 30) * 30));
/** Το API δέχεται ως ±240΄ ανά δήλωση. */
const shiftMin = computed(() => Math.max(-shiftSpan.value, committed.value - 240));
const shiftMax = computed(() => Math.min(shiftSpan.value, committed.value + 240));
const shiftMarkers = computed(() => [shiftMin.value, 0, shiftMax.value].filter((_, i) => i !== 1 || (shiftMin.value < 0 && shiftMax.value > 0)).map((value) => ({ value, label: value ? delayText(value) : '0' })));
function shiftText(minutes: number): string {
  if (!minutes) return 'στην ώρα μας';
  return minutes > 0 ? `${minutes}΄ πίσω` : `${-minutes}΄ μπροστά`;
}

const busy = ref(false);
async function commitShift(value: number): Promise<void> {
  const target = delayTarget.value;
  const minutes = value - committed.value;
  if (!target || !minutes) return;
  busy.value = true;
  try {
    await post(`/draseis/${props.drasiId}/schedule/delays`, { itemId: target.id, minutes });
    committed.value = value;
    emit('changed');
  } catch {
    shift.value = committed.value;
    $q.notify({ type: 'negative', message: 'Δεν δηλώθηκε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    busy.value = false;
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
