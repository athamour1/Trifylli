<template>
  <div v-if="draft || threads.length" class="comments-panel">
    <button type="button" class="comments-panel__header row items-center no-wrap" :aria-expanded="open" @click="open = !open">
      <q-icon name="chat_bubble_outline" size="18px" class="q-mr-xs" />
      <span class="text-weight-medium">Σχόλια</span>
      <span v-if="openThreads.length" class="comments-panel__count q-ml-xs">{{ openThreads.length }}</span>
      <span v-if="resolvedThreads.length" class="text-caption text-grey-7 q-ml-sm">· {{ resolvedThreads.length }} επιλυμένα</span>
      <q-space />
      <q-icon :name="open ? 'expand_less' : 'expand_more'" size="20px" />
    </button>

    <template v-if="open || draft">
      <div v-if="draft" class="comments-panel__draft">
        <CommentComposer
          :people="people"
          :quote="draft.quote"
          :busy="sending"
          :placeholder="draft.quote ? 'Τι θέλεις να πεις για τη φράση;' : 'Σχόλιο σε όλο το κείμενο…'"
          @need-people="needPeople"
          @cancel="emit('draft-done')"
          @submit="send"
        />
      </div>

      <CommentThread
        v-for="thread in openThreads"
        :key="thread.id"
        :thread="thread"
        :api="api"
        :people="people"
        :me-id="meId"
        :active="thread.id === activeId"
        :detached="isDetached(thread)"
        @activate="emit('update:activeId', thread.id)"
        @locate="emit('locate', thread.id)"
        @need-people="needPeople"
      />

      <template v-if="resolvedThreads.length">
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          class="q-mt-sm"
          :icon="showResolved ? 'expand_less' : 'expand_more'"
          :label="showResolved ? 'Απόκρυψη επιλυμένων' : `Επιλυμένα (${resolvedThreads.length})`"
          @click="showResolved = !showResolved"
        />
        <template v-if="showResolved">
          <CommentThread
            v-for="thread in resolvedThreads"
            :key="thread.id"
            :thread="thread"
            :api="api"
            :people="people"
            :me-id="meId"
            :active="thread.id === activeId"
            :detached="isDetached(thread)"
            class="q-mt-sm"
            @activate="emit('update:activeId', thread.id)"
            @locate="emit('locate', thread.id)"
            @need-people="needPeople"
          />
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute } from 'vue-router';
import type { CommentAnchor, CommentPerson, CommentThreadView } from '@trifylli/shared';
import type { useComments } from '../../composables/useComments';
import CommentComposer from './CommentComposer.vue';
import CommentThread from './CommentThread.vue';

/**
 * Τα σχόλια ενός κειμένου, κάτω από αυτό: τα ανοιχτά νήματα με τη σειρά που
 * εμφανίζονται οι φράσεις τους στο κείμενο, μετά όσα δεν έχουν (ή έχασαν) φράση,
 * και τα επιλυμένα κρυμμένα. Ένας σύνδεσμος ειδοποίησης (`?comment=<id>`) ανοίγει
 * το νήμα του.
 */
const props = defineProps<{
  api: ReturnType<typeof useComments>;
  /** Τα νήματα αυτού του κειμένου. */
  threads: CommentThreadView[];
  /** Πού είναι τώρα κάθε φράση στο κείμενο (`null` = σβήστηκε). */
  ranges: ReadonlyMap<string, { from: number; to: number } | null>;
  field: string;
  meId: string | null;
  activeId: string | null;
  /** Νέο σχόλιο που γράφεται (από το κουμπί «Σχόλιο»). */
  draft: { anchor: CommentAnchor | null; quote: string | null } | null;
}>();
const emit = defineEmits<{ 'update:activeId': [string | null]; locate: [string]; 'draft-done': [] }>();

const $q = useQuasar();
const route = useRoute();
const open = ref(true);
const showResolved = ref(false);
const sending = ref(false);
const people = ref<CommentPerson[]>(props.api.people.value ?? []);

async function needPeople(): Promise<void> {
  if (!people.value.length) people.value = await props.api.loadPeople();
}

function isDetached(thread: CommentThreadView): boolean {
  return !!thread.anchor && props.ranges.get(thread.id) === null;
}

/** Πρώτα με τη σειρά των φράσεων στο κείμενο· μετά τα υπόλοιπα, παλιότερο πρώτο. */
function byPosition(a: CommentThreadView, b: CommentThreadView): number {
  const at = (thread: CommentThreadView) => props.ranges.get(thread.id)?.from ?? Number.POSITIVE_INFINITY;
  return at(a) - at(b) || a.createdAt.localeCompare(b.createdAt);
}

const openThreads = computed(() => props.threads.filter((thread) => !thread.resolvedAt).sort(byPosition));
const resolvedThreads = computed(() => props.threads.filter((thread) => thread.resolvedAt).sort(byPosition));

async function send(body: string, mentionIds: string[]): Promise<void> {
  if (!props.draft) return;
  sending.value = true;
  try {
    const id = await props.api.add({ field: props.field, anchor: props.draft.anchor, quote: props.draft.quote, body, mentionIds });
    emit('draft-done');
    emit('update:activeId', id);
  } catch {
    $q.notify({ type: 'negative', message: 'Το σχόλιο δεν στάλθηκε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    sending.value = false;
  }
}

// Το νήμα που άνοιξε (από το κείμενο ή από σύνδεσμο) φαίνεται.
watch(
  () => props.activeId,
  async (id) => {
    if (!id || !props.threads.some((thread) => thread.id === id)) return;
    open.value = true;
    if (props.threads.find((thread) => thread.id === id)?.resolvedAt) showResolved.value = true;
    await nextTick();
    document.querySelector(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
);

// Σύνδεσμος ειδοποίησης: `?comment=<id>` — μία φορά, μόλις φτάσει το νήμα.
let linked = false;
watch(
  () => props.threads,
  (threads) => {
    const wanted = route.query.comment;
    if (linked || typeof wanted !== 'string' || !threads.some((thread) => thread.id === wanted)) return;
    linked = true;
    emit('update:activeId', wanted);
    emit('locate', wanted);
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.comments-panel {
  margin-top: 10px;
}
.comments-panel__header {
  width: 100%;
  padding: 6px 2px;
  margin-bottom: 6px;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: none;
  border: 0;
  text-align: left;
}
.comments-panel__count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  background: #f9a825;
  color: #3e2a00;
}
.comments-panel__draft {
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, #f9a825 10%, var(--tint-soft));
}
</style>
