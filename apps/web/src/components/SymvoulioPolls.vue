<template>
  <q-card v-if="canManage || polls.length" flat bordered class="q-mt-md">
    <q-card-section class="row items-center justify-between q-py-sm">
      <div class="text-subtitle1 text-weight-medium">Ψηφοφορίες</div>
      <q-btn v-if="canManage && !composing" flat dense no-caps color="klados" icon="how_to_vote" label="Νέα" @click="composing = true" />
    </q-card-section>

    <!-- Νέα ψηφοφορία -->
    <q-card-section v-if="composing" class="q-pt-none">
      <q-input v-model="question" dense outlined autofocus color="klados" label="Ερώτηση" :maxlength="POLL_LIMITS.question" />
      <div class="row items-center q-gutter-sm q-mt-sm">
        <SegmentedToggle
          v-model="kind"
          dense flat no-caps size="sm"
          toggle-color="klados"
          :options="[
            { label: 'Ναι / Όχι / Αποχή', value: 'yesno' },
            { label: 'Επιλογές', value: 'choices' },
          ]"
        />
        <q-toggle v-model="secret" dense color="klados" label="Μυστική" />
      </div>
      <div v-if="kind === 'choices'" class="q-mt-sm">
        <div v-for="(_, index) in options" :key="index" class="row items-center no-wrap q-mb-xs">
          <q-input v-model="options[index]" dense outlined color="klados" class="col" :placeholder="`Επιλογή ${index + 1}`" :maxlength="POLL_LIMITS.option" />
          <q-btn v-if="options.length > 2" flat round dense size="sm" icon="close" aria-label="Αφαίρεση επιλογής" @click="options.splice(index, 1)" />
        </div>
        <q-btn v-if="options.length < POLL_LIMITS.options" flat dense no-caps size="sm" icon="add" label="Επιλογή" @click="options.push('')" />
      </div>
      <div class="text-caption text-grey-7 q-mt-xs">
        Ψηφίζουν οι συμμετέχοντες.{{ secret ? ' Μυστική: φαίνεται ποιος ψήφισε, όχι τι — και η ψήφος δεν αλλάζει.' : '' }} Στο κλείσιμο το αποτέλεσμα μπαίνει στα πρακτικά.
      </div>
      <div class="row justify-end q-gutter-xs q-mt-sm">
        <q-btn flat dense no-caps label="Άκυρο" @click="resetComposer" />
        <q-btn unelevated dense no-caps color="klados" label="Άνοιγμα" class="q-px-sm" :disable="!canOpen" :loading="busy === 'open'" @click="openPoll" />
      </div>
    </q-card-section>

    <q-list separator>
      <q-item v-for="poll in polls" :key="poll.id" class="column items-stretch q-py-md">
        <div class="row items-start no-wrap">
          <div class="col">
            <div class="text-weight-medium">{{ poll.question }}</div>
            <div class="text-caption text-grey-7">
              {{ poll.closedAt ? `Έκλεισε ${formatDateTime(poll.closedAt)}` : 'Ανοιχτή' }}{{ poll.secret ? ' · μυστική' : '' }} · ψήφισαν {{ votedCount(poll) }}/{{ poll.voters.length }}
            </div>
          </div>
          <template v-if="poll.canManage">
            <q-btn v-if="!poll.closedAt" flat dense no-caps size="sm" icon="lock" label="Κλείσιμο" :loading="busy === poll.id" @click="closePoll(poll)" />
            <q-btn flat round dense size="sm" icon="delete" color="negative" aria-label="Διαγραφή ψηφοφορίας" @click="removePoll(poll)" />
          </template>
        </div>

        <!-- Οι επιλογές: μπάρες με το αποτέλεσμα, και η ψήφος με ένα πάτημα -->
        <div class="q-mt-sm">
          <div
            v-for="(option, index) in poll.options"
            :key="index"
            class="poll-option"
            :class="{ 'poll-option--mine': poll.mine.choice === index, 'poll-option--clickable': poll.canVote }"
            role="button"
            :tabindex="poll.canVote ? 0 : -1"
            :aria-pressed="poll.mine.choice === index"
            @click="poll.canVote && vote(poll, index)"
            @keydown.enter="poll.canVote && vote(poll, index)"
          >
            <div class="poll-option__bar" :style="{ width: `${share(poll, index)}%` }" />
            <div class="poll-option__label row items-center no-wrap">
              <q-icon v-if="poll.mine.choice === index" name="check_circle" size="16px" color="klados" class="q-mr-xs" />
              <span class="col ellipsis">{{ option }}</span>
              <span class="text-weight-medium q-ml-sm">{{ poll.counts[index] ?? 0 }}</span>
            </div>
            <div v-if="!poll.secret && namesFor(poll, index)" class="poll-option__names text-caption text-grey-7">{{ namesFor(poll, index) }}</div>
          </div>
        </div>
        <div v-if="poll.secret && poll.mine.voted" class="text-caption text-grey-7 q-mt-xs">Ψήφισες — η μυστική ψήφος δεν αλλάζει.</div>
        <div v-else-if="poll.canVote && !poll.mine.voted" class="text-caption text-klados q-mt-xs">Πάτα μια επιλογή για να ψηφίσεις.</div>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { POLL_LIMITS, collabDocument, collabShortName, type SymvoulioPollView } from '@trifylli/shared';
import SegmentedToggle from './SegmentedToggle.vue';
import { onDocumentChange } from '../composables/useCollabDoc';
import { del, get, post, put } from '../lib/api';
import { formatDateTime } from '../lib/format';

/**
 * Οι ψηφοφορίες του συμβουλίου: Ναι/Όχι/Αποχή ή επιλογές, επώνυμες ή μυστικές.
 * Ψηφίζουν οι συμμετέχοντες· τα αποτελέσματα φαίνονται ζωντανά, και στο κλείσιμο
 * μπαίνουν στα πρακτικά.
 */
const props = defineProps<{ symvoulioId: string; canManage: boolean }>();

const $q = useQuasar();
const polls = ref<SymvoulioPollView[]>([]);
const busy = ref<string | null>(null);

async function load(): Promise<void> {
  try {
    polls.value = await get<SymvoulioPollView[]>(`/symvoulia/${props.symvoulioId}/polls`);
  } catch {
    // Χωρίς δίκτυο: μένουν όσα ξέρουμε.
  }
}

const votedCount = (poll: SymvoulioPollView) => poll.voters.filter((voter) => voter.voted).length;
function share(poll: SymvoulioPollView, index: number): number {
  const total = poll.counts.reduce((sum, count) => sum + count, 0);
  return total ? Math.round(((poll.counts[index] ?? 0) / total) * 100) : 0;
}
function namesFor(poll: SymvoulioPollView, index: number): string {
  return poll.voters
    .filter((voter) => voter.choice === index)
    .map((voter) => collabShortName(voter.firstName, voter.lastName))
    .join(', ');
}

async function vote(poll: SymvoulioPollView, choice: number): Promise<void> {
  if (poll.mine.choice === choice) return;
  if (poll.secret) {
    const ok = await new Promise<boolean>((resolve) =>
      $q
        .dialog({
          title: 'Μυστική ψήφος',
          message: `«${poll.options[choice]}» — η μυστική ψήφος δεν αλλάζει μετά.`,
          cancel: { flat: true, label: 'Άκυρο' },
          ok: { flat: true, color: 'klados', label: 'Ψηφίζω' },
        })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false)),
    );
    if (!ok) return;
  }
  try {
    await put(`/symvoulia/${props.symvoulioId}/polls/${poll.id}/vote`, { choice });
    await load();
  } catch (error) {
    $q.notify({ type: 'negative', message: error instanceof Error ? error.message : 'Η ψήφος δεν στάλθηκε.' });
  }
}

// ── Νέα ψηφοφορία ──
const composing = ref(false);
const question = ref('');
const kind = ref<'yesno' | 'choices'>('yesno');
const options = ref<string[]>(['', '']);
const secret = ref(false);
const canOpen = computed(() => question.value.trim() && (kind.value === 'yesno' || options.value.filter((option) => option.trim()).length >= 2));

function resetComposer(): void {
  composing.value = false;
  question.value = '';
  kind.value = 'yesno';
  options.value = ['', ''];
  secret.value = false;
}

async function openPoll(): Promise<void> {
  busy.value = 'open';
  try {
    await post(`/symvoulia/${props.symvoulioId}/polls`, {
      question: question.value.trim(),
      ...(kind.value === 'choices' ? { options: options.value.map((option) => option.trim()).filter(Boolean) } : {}),
      secret: secret.value,
    });
    resetComposer();
    await load();
  } catch (error) {
    $q.notify({ type: 'negative', message: error instanceof Error ? error.message : 'Η ψηφοφορία δεν άνοιξε.' });
  } finally {
    busy.value = null;
  }
}

function closePoll(poll: SymvoulioPollView): void {
  $q.dialog({
    title: 'Κλείσιμο ψηφοφορίας',
    message: 'Το αποτέλεσμα θα μπει στο τέλος των πρακτικών, και δεν θα ψηφίζεται πια.',
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { flat: true, color: 'klados', label: 'Κλείσιμο' },
  }).onOk(async () => {
    busy.value = poll.id;
    try {
      await post(`/symvoulia/${props.symvoulioId}/polls/${poll.id}/close`);
      await load();
    } catch {
      $q.notify({ type: 'negative', message: 'Δεν έκλεισε — δοκίμασε ξανά με δίκτυο.' });
    } finally {
      busy.value = null;
    }
  });
}

function removePoll(poll: SymvoulioPollView): void {
  $q.dialog({
    title: 'Διαγραφή ψηφοφορίας',
    message: poll.closedAt ? 'Το αποτέλεσμα μένει στα πρακτικά.' : 'Θα χαθούν και οι ψήφοι.',
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { flat: true, color: 'negative', label: 'Διαγραφή' },
  }).onOk(async () => {
    try {
      await del(`/symvoulia/${props.symvoulioId}/polls/${poll.id}`);
      await load();
    } catch {
      $q.notify({ type: 'negative', message: 'Δεν διαγράφηκε.' });
    }
  });
}

onMounted(load);
// Ζωντανά: ψήφοι, νέες και κλεισμένες ψηφοφορίες φτάνουν μέσω του κοινού εγγράφου του συμβουλίου.
const stop = onDocumentChange(collabDocument.symvoulio(props.symvoulioId), (change) => {
  if (change.topic === 'polls' || change.topic === '*') void load();
});
onBeforeUnmount(stop);
</script>

<style scoped lang="scss">
.poll-option {
  position: relative;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--tint-soft);
  overflow: hidden;
}
.poll-option + .poll-option {
  margin-top: 6px;
}
.poll-option--clickable {
  cursor: pointer;
}
.poll-option--clickable:hover {
  background: var(--tint);
}
.poll-option--mine {
  box-shadow: inset 3px 0 0 var(--klados-ink);
}
.poll-option__bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--klados-ink) 18%, transparent);
  transition: width var(--dur-medium) var(--ease-standard);
}
.poll-option__label,
.poll-option__names {
  position: relative;
}
</style>
