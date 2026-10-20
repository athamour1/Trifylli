<template>
  <!--
    Τα προγραμματικά σε kanban: κάθε στοιχείο του ωρολογίου (εκτός από τα γεύματα,
    που τα ετοιμάζει το διατροφολόγιο) είναι μια κάρτα σε μία από τρεις στήλες —
    To Do, In Progress, Done. Τις μετακινούν ο Αρχηγός και το Πρόγραμμα: με
    σύρσιμο, ή από το μενού της κάρτας (κινητό, πληκτρολόγιο). Οι υπόλοιποι βλέπουν.
    Η κάρτα ανοίγει το προγραμματικό της, μέσα στη δράση.
  -->
  <div>
    <div class="text-caption text-grey-7 q-mb-md">
      Η προετοιμασία κάθε στοιχείου του ωρολογίου.
      <template v-if="canWrite">Σύρε μια κάρτα σε άλλη στήλη — ή άλλαξέ τη από το μενού της.</template>
      <template v-else>Τις κάρτες τις μετακινούν ο Αρχηγός και το Πρόγραμμα.</template>
    </div>

    <q-inner-loading :showing="loading && !view" />

    <div v-if="view && !total" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="view_kanban" size="40px" class="block q-mx-auto q-mb-sm" />
      Το ωρολόγιο δεν έχει ακόμη στοιχεία για προετοιμασία.
    </div>

    <div v-else-if="view" ref="board" class="kanban">
      <section
        v-for="status in KANBAN_STATUSES"
        :key="status"
        class="kanban__column"
        :class="{ 'kanban__column--over': dragId && overStatus === status, 'kanban__column--peer': !dragId && peers.columns.has(status) }"
        :style="peerStyle(peers.columns.get(status))"
        :aria-label="DRASI_SCHEDULE_STATUS_LABEL[status]"
        @dragover.prevent="onDragOver(status, $event)"
        @dragleave="onDragLeave(status, $event)"
        @drop.prevent="onDrop(status)"
      >
        <header class="kanban__head">
          <q-icon :name="STATUS_ICON[status]" :color="STATUS_COLOR[status]" size="18px" />
          <span class="text-weight-medium">{{ DRASI_SCHEDULE_STATUS_LABEL[status] }}</span>
          <q-badge rounded color="grey-4" text-color="grey-9" :label="String(columns[status].length)" />
          <!-- Κάποιος άλλος σέρνει μια κάρτα πάνω από αυτή τη στήλη. -->
          <CollabPresence v-if="peers.columns.has(status)" :peers="peers.columns.get(status)!" compact class="q-ml-auto" />
        </header>

        <div class="kanban__cards">
          <q-card
            v-for="card in columns[status]"
            :key="card.id"
            :data-flip="card.id"
            flat
            bordered
            class="kanban__card"
            :class="{
              'kanban__card--draggable': canWrite,
              'kanban__card--dragging': dragId === card.id,
              'kanban__card--held': peers.cards.has(card.id),
              'kanban__card--done': status === 'DONE',
            }"
            :style="peerStyle(peers.cards.get(card.id))"
            :draggable="canWrite"
            @dragstart="onDragStart(card.id, $event)"
            @dragend="onDragEnd"
          >
            <q-item clickable class="kanban__item" @click="open(card.id)">
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ card.title }}</q-item-label>
                <q-item-label caption>
                  <template v-if="multiDay">{{ dayLabel(card.date) }} · </template>{{ hm(card.startsAt) }}–{{ hm(card.endsAt) }}
                </q-item-label>
                <!-- Ποιος την κουνάει τώρα, πριν ακόμα την αφήσει σε άλλη στήλη. -->
                <div v-if="peers.cards.has(card.id)" class="kanban__holder row items-center no-wrap q-mt-xs">
                  <CollabPresence :peers="peers.cards.get(card.id)!" compact />
                  <span class="text-caption q-ml-xs ellipsis">{{ holderText(peers.cards.get(card.id)!) }}</span>
                </div>
                <q-item-label v-if="card.responsibles.length" caption class="ellipsis">
                  <q-icon name="person" size="14px" class="q-mr-xs" />{{ names(card) }}
                </q-item-label>
                <div class="row items-center q-gutter-xs q-mt-xs">
                  <q-chip v-if="card.kind !== 'DRASTIRIOTITA'" dense size="sm" square :icon="KIND_ICON[card.kind]" class="kanban__chip">
                    {{ DRASI_SCHEDULE_KIND_LABEL[card.kind] }}
                  </q-chip>
                  <q-chip v-if="!card.description" dense size="sm" square icon="edit_note" class="kanban__chip text-orange-9">
                    Χωρίς προγραμματικό
                  </q-chip>
                  <q-chip v-if="card.yliko.length" dense size="sm" square icon="backpack" class="kanban__chip">
                    {{ packedOf(card) }}/{{ card.yliko.length }}
                    <q-tooltip>Υλικό στο σακίδιο</q-tooltip>
                  </q-chip>
                </div>
              </q-item-section>
              <q-item-section v-if="canWrite" side top>
                <q-btn flat round dense size="sm" icon="more_vert" :aria-label="`Μετακίνηση: ${card.title}`" @click.stop>
                  <q-menu auto-close>
                    <q-list dense>
                      <q-item-label header class="q-pb-xs">Μετακίνηση σε</q-item-label>
                      <q-item v-for="s in KANBAN_STATUSES" :key="s" clickable :disable="s === status" @click="move(card.id, s)">
                        <q-item-section avatar><q-icon :name="STATUS_ICON[s]" :color="STATUS_COLOR[s]" /></q-item-section>
                        <q-item-section>{{ DRASI_SCHEDULE_STATUS_LABEL[s] }}</q-item-section>
                      </q-item>
                    </q-list>
                  </q-menu>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-card>

          <div v-if="!columns[status].length" class="kanban__empty text-caption text-grey-6">
            {{ dragId ? 'Άφησέ τη εδώ' : 'Καμία κάρτα' }}
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import {
  DRASI_SCHEDULE_KIND_LABEL,
  DRASI_SCHEDULE_STATUS_LABEL,
  type CollabPresenceUser,
  type DrasiScheduleItemView,
  type DrasiScheduleStatus,
  type DrasiScheduleView,
} from '@trifylli/shared';
import { ApiError, get, patch } from '../../lib/api';
import { flip } from '../../lib/flip';
import { KANBAN_STATUSES, kanbanColumns, kanbanFocus, kanbanPeers, moveCard } from '../../lib/programmatika';
import { useLiveReload, useRoomFocus } from '../../composables/useLiveChanges';
import CollabPresence from '../CollabPresence.vue';
import { SCHEDULE_KIND_ICON as KIND_ICON } from './types';

const props = defineProps<{ drasiId: string; canWrite: boolean }>();
const $q = useQuasar();
const router = useRouter();

const STATUS_ICON: Record<DrasiScheduleStatus, string> = {
  TODO: 'radio_button_unchecked',
  IN_PROGRESS: 'pending',
  DONE: 'check_circle',
};
const STATUS_COLOR: Record<DrasiScheduleStatus, string> = {
  TODO: 'grey-6',
  IN_PROGRESS: 'orange-8',
  DONE: 'positive',
};

const loading = ref(false);
const view = ref<DrasiScheduleView | null>(null);
const board = ref<HTMLElement | null>(null);
const columns = computed(() => (view.value ? kanbanColumns(view.value) : { TODO: [], IN_PROGRESS: [], DONE: [] }));
const total = computed(() => KANBAN_STATUSES.reduce((n, s) => n + columns.value[s].length, 0));
/** Σε πολυήμερη η κάρτα λέει και την ημέρα. */
const multiDay = computed(() => (view.value?.days.length ?? 0) > 1);

async function reload(): Promise<void> {
  loading.value = true;
  try {
    const next = await get<DrasiScheduleView>(`/draseis/${props.drasiId}/schedule`);
    // Ό,τι μετακίνησαν οι άλλοι γλιστρά στη νέα του στήλη, αντί να «πηδήξει».
    await flip(board.value, () => {
      view.value = next;
    });
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης.');
  } finally {
    loading.value = false;
  }
}
onMounted(reload);
// Ζωντανά: ό,τι μετακινούν ή αλλάζουν οι άλλοι στο ωρολόγιο, χωρίς ανανέωση της σελίδας.
useLiveReload(['schedule'], reload);

function open(itemId: string): void {
  void router.push({ name: 'drasi-programmatika-item', params: { id: props.drasiId, itemId } });
}

/** Η κάρτα αλλάζει στήλη αμέσως· αν ο server αρνηθεί, γυρίζει πίσω. */
async function move(itemId: string, status: DrasiScheduleStatus): Promise<void> {
  const current = view.value;
  if (!current) return;
  const before = current.days.flatMap((d) => d.items).find((i) => i.id === itemId)?.status;
  if (!before || before === status) return;
  await flip(board.value, () => moveCard(current, itemId, status));
  try {
    await patch(`/draseis/${props.drasiId}/schedule/${itemId}`, { status });
  } catch (err) {
    await flip(board.value, () => moveCard(current, itemId, before));
    notifyError(err, 'Αποτυχία μετακίνησης.');
  }
}

// ── Ποιος σέρνει τι: η παρουσία του δωματίου της δράσης ──
const { peerFocus, setFocus } = useRoomFocus();
const peers = computed(() => kanbanPeers(peerFocus.value));
/** Το χρώμα του (πρώτου) άλλου — η ίδια απόχρωση με τον κέρσορά του στα κείμενα. */
const peerStyle = (users: CollabPresenceUser[] | undefined): Record<string, string> =>
  users?.length ? { '--peer': users[0]!.color } : {};
const holderText = (users: CollabPresenceUser[]): string => `Σε μετακίνηση · ${users.map((u) => u.name).join(', ')}`;

// ── Σύρσιμο: μόνο για όσους μετακινούν ──
const dragId = ref<string | null>(null);
const overStatus = ref<DrasiScheduleStatus | null>(null);
function onDragStart(id: string, ev: DragEvent): void {
  if (!props.canWrite) return;
  dragId.value = id;
  setFocus(kanbanFocus(id, null));
  ev.dataTransfer?.setData('text/plain', id);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}
function onDragOver(status: DrasiScheduleStatus, ev: DragEvent): void {
  if (!dragId.value) return;
  // Το dragover έρχεται συνέχεια· οι άλλοι μαθαίνουν μόνο την αλλαγή στήλης.
  if (overStatus.value !== status) setFocus(kanbanFocus(dragId.value, status));
  overStatus.value = status;
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
}
function onDragLeave(status: DrasiScheduleStatus, ev: DragEvent): void {
  // Από κάρτα σε κάρτα της ίδιας στήλης δεν «φεύγουμε».
  const to = ev.relatedTarget as Node | null;
  if (overStatus.value === status && !(to && (ev.currentTarget as HTMLElement).contains(to))) {
    overStatus.value = null;
    if (dragId.value) setFocus(kanbanFocus(dragId.value, null));
  }
}
function onDragEnd(): void {
  dragId.value = null;
  overStatus.value = null;
  setFocus(null);
}
function onDrop(status: DrasiScheduleStatus): void {
  const id = dragId.value;
  onDragEnd();
  if (id) void move(id, status);
}

const hm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayLabel = (date: string): string =>
  new Date(`${date}T12:00:00`).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'numeric' });
const names = (card: DrasiScheduleItemView): string => card.responsibles.map((r) => `${r.lastName} ${r.firstName}`.trim()).join(', ');
const packedOf = (card: DrasiScheduleItemView): number => card.yliko.filter((y) => y.packed).length;

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>

<style scoped>
.kanban {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 768px) {
  .kanban {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }
}
.kanban__column {
  min-height: 140px;
  padding: 10px;
  border-radius: 14px;
  background: var(--surface-2);
  transition: background-color var(--dur-medium) var(--ease-standard);
}
.kanban__column--over {
  background: color-mix(in srgb, var(--klados-ink) 12%, var(--surface-2));
}
.kanban__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 10px;
}
.kanban__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kanban__card {
  border-radius: 12px;
  transition:
    opacity var(--dur-short) var(--ease-standard),
    transform var(--dur-medium) var(--ease-standard),
    box-shadow var(--dur-medium) var(--ease-standard);
}
.kanban__card--draggable {
  cursor: grab;
}
.kanban__card--dragging {
  opacity: 0.45;
}
/* Την κρατά κάποιος άλλος: σηκώνεται λίγο, με απαλή λάμψη στο χρώμα του. */
.kanban__card--held {
  transform: translateY(-2px);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--peer) 45%, transparent),
    0 6px 16px color-mix(in srgb, var(--peer) 22%, transparent);
}
.kanban__column--peer {
  background: color-mix(in srgb, var(--peer) 10%, var(--surface-2));
}
.kanban__holder {
  color: var(--peer);
  font-weight: 500;
}
.kanban__card--done .kanban__item {
  opacity: 0.75;
}
.kanban__item {
  border-radius: 12px;
  padding: 8px 10px;
}
.kanban__chip {
  margin-left: 0;
  background: var(--tint);
}
.kanban__empty {
  padding: 20px 8px;
  text-align: center;
}
</style>
