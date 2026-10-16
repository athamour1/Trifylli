<template>
  <div
    class="comment-thread"
    :class="{ 'comment-thread--active': active, 'comment-thread--resolved': !!thread.resolvedAt }"
    :data-thread="thread.id"
    @click="emit('activate')"
  >
    <button
      v-if="thread.quote"
      type="button"
      class="comment-quote comment-thread__quote"
      :class="{ 'comment-thread__quote--gone': detached }"
      :disabled="detached"
      :aria-label="detached ? 'Η φράση άλλαξε ή σβήστηκε' : 'Δες τη φράση στο κείμενο'"
      @click.stop="emit('locate')"
    >
      «{{ thread.quote }}»
      <span v-if="detached" class="comment-thread__gone">— η φράση άλλαξε ή σβήστηκε</span>
    </button>

    <CommentComposer
      v-if="editing === thread.id"
      :people="people"
      :initial="thread.body"
      submit-label="Αποθήκευση"
      :busy="busy"
      @need-people="emit('need-people')"
      @cancel="editing = null"
      @submit="(body, mentions) => edit(thread.id, body, mentions)"
    />
    <CommentItem v-else :comment="thread" :me-id="meId" @edit="editing = thread.id" @remove="remove(thread.id, true)">
      <template #actions>
        <q-btn
          flat
          round
          dense
          size="sm"
          :icon="thread.resolvedAt ? 'restart_alt' : 'check'"
          :color="thread.resolvedAt ? undefined : 'klados'"
          :loading="resolving"
          :aria-label="thread.resolvedAt ? 'Ξανά ανοιχτό' : 'Επιλύθηκε'"
          @click.stop="toggleResolved"
        >
          <q-tooltip>{{ thread.resolvedAt ? 'Ξανά ανοιχτό' : 'Επιλύθηκε' }}</q-tooltip>
        </q-btn>
      </template>
    </CommentItem>

    <div v-if="thread.resolvedAt && thread.resolvedBy" class="text-caption text-grey-7 comment-thread__resolved">
      Επιλύθηκε από {{ thread.resolvedBy.firstName }} {{ thread.resolvedBy.lastName }}
    </div>

    <div v-if="thread.replies.length" class="comment-thread__replies">
      <template v-for="reply in thread.replies" :key="reply.id">
        <CommentComposer
          v-if="editing === reply.id"
          :people="people"
          :initial="reply.body"
          submit-label="Αποθήκευση"
          :busy="busy"
          @need-people="emit('need-people')"
          @cancel="editing = null"
          @submit="(body, mentions) => edit(reply.id, body, mentions)"
        />
        <CommentItem v-else :comment="reply" :me-id="meId" @edit="editing = reply.id" @remove="remove(reply.id, false)" />
      </template>
    </div>

    <div v-if="!thread.resolvedAt" class="comment-thread__reply">
      <CommentComposer
        v-if="replying"
        :people="people"
        placeholder="Απάντηση…"
        submit-label="Απάντηση"
        :busy="busy"
        @need-people="emit('need-people')"
        @cancel="replying = false"
        @submit="sendReply"
      />
      <q-btn v-else flat dense no-caps size="sm" color="klados" icon="reply" label="Απάντηση" @click.stop="replying = true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import type { CommentPerson, CommentThreadView } from '@trifylli/shared';
import type { useComments } from '../../composables/useComments';
import CommentComposer from './CommentComposer.vue';
import CommentItem from './CommentItem.vue';

/**
 * Ένα νήμα: η φράση (πατιέται και δείχνει πού είναι στο κείμενο), το πρώτο
 * σχόλιο, οι απαντήσεις, «Επιλύθηκε». Αν η φράση σβήστηκε, μένει το απόσπασμα.
 */
const props = defineProps<{
  thread: CommentThreadView;
  api: ReturnType<typeof useComments>;
  people: CommentPerson[];
  meId: string | null;
  active: boolean;
  /** Η φράση δεν βρίσκεται πια στο κείμενο. */
  detached: boolean;
}>();
const emit = defineEmits<{ activate: []; locate: []; 'need-people': [] }>();

const $q = useQuasar();
const replying = ref(false);
const editing = ref<string | null>(null);
const busy = ref(false);
const resolving = ref(false);

function failed(): void {
  $q.notify({ type: 'negative', message: 'Δεν στάλθηκε — δοκίμασε ξανά με δίκτυο.' });
}

async function sendReply(body: string, mentionIds: string[]): Promise<void> {
  busy.value = true;
  try {
    await props.api.reply(props.thread.id, body, mentionIds);
    replying.value = false;
  } catch {
    failed();
  } finally {
    busy.value = false;
  }
}

async function edit(id: string, body: string, mentionIds: string[]): Promise<void> {
  busy.value = true;
  try {
    await props.api.edit(id, body, mentionIds);
    editing.value = null;
  } catch {
    failed();
  } finally {
    busy.value = false;
  }
}

function remove(id: string, root: boolean): void {
  $q.dialog({
    title: 'Διαγραφή σχολίου',
    message: root && props.thread.replies.length ? 'Θα σβηστούν και οι απαντήσεις του.' : 'Το σχόλιο θα σβηστεί για όλους.',
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { flat: true, color: 'negative', label: 'Διαγραφή' },
  }).onOk(async () => {
    try {
      await props.api.remove(id);
    } catch {
      failed();
    }
  });
}

async function toggleResolved(): Promise<void> {
  resolving.value = true;
  try {
    await props.api.resolve(props.thread.id, !props.thread.resolvedAt);
  } catch {
    failed();
  } finally {
    resolving.value = false;
  }
}
</script>

<style scoped lang="scss">
.comment-thread {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--tint-soft);
  transition: background-color var(--dur-medium) var(--ease-standard), box-shadow var(--dur-medium) var(--ease-standard);
}
.comment-thread + .comment-thread {
  margin-top: 8px;
}
.comment-thread--active {
  background: color-mix(in srgb, #f9a825 12%, var(--tint-soft));
  box-shadow: inset 3px 0 0 #f9a825;
}
.comment-thread--resolved {
  opacity: 0.8;
}
.comment-thread__quote {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.comment-thread__quote:disabled {
  cursor: default;
}
.comment-thread__quote--gone {
  text-decoration: line-through;
  text-decoration-color: var(--line-strong);
}
.comment-thread__gone {
  font-style: normal;
  text-decoration: none;
  display: inline-block;
  color: var(--text-soft);
  font-size: 12px;
}
.comment-thread__resolved {
  margin: 4px 0 0 32px;
}
.comment-thread__replies {
  margin: 10px 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.comment-thread__reply {
  margin: 6px 0 0 28px;
}
</style>
