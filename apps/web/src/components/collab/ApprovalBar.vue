<template>
  <div v-if="state" class="approval-bar q-mb-md" :class="`approval-bar--${state.status.toLowerCase()}`">
    <div class="row items-center q-gutter-sm">
      <q-icon :name="meta.icon" :color="meta.color" size="22px" />
      <div class="col">
        <div class="text-weight-medium">
          {{ meta.label }}
          <span v-if="state.status === 'EGKRITHIKE' && state.changedAfter" class="text-orange-9"> — άλλαξε μετά την έγκριση</span>
        </div>
        <div class="text-caption text-grey-7">{{ caption }}</div>
      </div>

      <ReadReceipts v-if="state.status === 'EGKRITHIKE'" :document="document" />
      <q-btn v-if="state.status === 'EGKRITHIKE' && state.changedAfter" flat dense no-caps size="sm" icon="compare" label="Σύγκριση" @click="openCompare" />
      <q-btn
        v-if="canSend"
        unelevated
        dense
        no-caps
        color="klados"
        icon="send"
        :label="state.status === 'EGKRITHIKE' ? 'Ξανά για έλεγχο' : 'Για έλεγχο'"
        class="q-px-sm"
        :loading="busy === 'request'"
        @click="act('request')"
      />
      <template v-if="state.canDecide && canApproveNow">
        <q-btn flat dense no-caps color="negative" icon="undo" label="Επιστροφή" :disable="!!busy" @click="returnDialog = true" />
        <q-btn unelevated dense no-caps color="positive" icon="task_alt" label="Έγκριση" class="q-px-sm" :loading="busy === 'approve'" @click="act('approve')" />
      </template>
    </div>

    <div v-if="state.status === 'PROXEIRO' && state.returnNote" class="approval-bar__note">
      <q-icon name="undo" size="16px" class="q-mr-xs" />
      Επιστράφηκε<template v-if="state.decidedBy"> από {{ state.decidedBy.firstName }} {{ state.decidedBy.lastName }}</template>: «{{ state.returnNote }}»
    </div>

    <!-- Επιστροφή με σχόλιο -->
    <q-dialog v-model="returnDialog">
      <q-card style="width: min(460px, 94vw)">
        <q-card-section class="text-subtitle1 q-pb-none">Επιστροφή για διορθώσεις</q-card-section>
        <q-card-section>
          <q-input
            v-model="note"
            type="textarea"
            autogrow
            outlined
            autofocus
            color="klados"
            label="Τι να διορθωθεί;"
            :input-style="{ minHeight: '72px' }"
          />
          <div class="text-caption text-grey-7 q-mt-xs">Μπαίνει και στα σχόλια του κειμένου, για να συζητηθεί εκεί.</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps label="Άκυρο" />
          <q-btn flat no-caps color="negative" label="Επιστροφή" :disable="!note.trim()" :loading="busy === 'return'" @click="giveBack" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Η εγκεκριμένη μορφή δίπλα στην τωρινή -->
    <q-dialog v-model="compareDialog" :maximized="$q.screen.lt.sm">
      <q-card style="width: min(820px, 96vw)">
        <q-card-section class="row items-center no-wrap q-py-sm">
          <div class="col">
            <div class="text-subtitle1">Τι άλλαξε μετά την έγκριση</div>
            <div v-if="compare?.approvedAt" class="text-caption text-grey-7">Εγκρίθηκε {{ formatDateTime(compare.approvedAt) }}</div>
          </div>
          <q-btn v-close-popup flat round dense icon="close" aria-label="Κλείσιμο" />
        </q-card-section>
        <q-separator />
        <q-card-section class="approval-compare">
          <div v-if="!changedParts.length" class="text-caption text-grey-7">Καμία αλλαγή.</div>
          <div v-for="part in changedParts" :key="part.key" class="q-mb-md">
            <div class="text-caption text-weight-medium text-grey-8 q-mb-xs">{{ part.label }}</div>
            <div class="approval-diff">
              <div v-for="(line, index) in part.lines" :key="index" class="approval-line" :class="`approval-line--${line.kind}`">
                <template v-for="(segment, s) in line.segments" :key="s">
                  <ins v-if="segment.kind === 'add' && line.segments.length > 1">{{ segment.text }}</ins>
                  <del v-else-if="segment.kind === 'del' && line.segments.length > 1">{{ segment.text }}</del>
                  <template v-else>{{ segment.text || ' ' }}</template>
                </template>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { ApprovalCompareView, ApprovalView } from '@trifylli/shared';
import ReadReceipts from './ReadReceipts.vue';
import { onDocumentChange } from '../../composables/useCollabDoc';
import { get, post } from '../../lib/api';
import { APPROVAL_META } from '../../lib/approvals';
import { formatDateTime } from '../../lib/format';
import { diffText, hasChanges } from '../../lib/text-diff';

/**
 * Η έγκριση ενός προγραμματικού ή γεύματος: Πρόχειρο → Για έλεγχο → Εγκρίθηκε.
 * Όποιος γράφει το στέλνει για έλεγχο· ο Αρχηγός της δράσης και οι διαχειριστές
 * του κλάδου εγκρίνουν ή το επιστρέφουν με σχόλιο. Μετά την έγκριση: «Το
 * διάβασαν», και — αν άλλαξε — σύγκριση με την εγκεκριμένη μορφή.
 */
const props = defineProps<{ document: string }>();

const $q = useQuasar();
const state = ref<ApprovalView | null>(null);
const busy = ref<'request' | 'approve' | 'return' | null>(null);
const returnDialog = ref(false);
const note = ref('');
const compareDialog = ref(false);
const compare = ref<ApprovalCompareView | null>(null);

const meta = computed(() => APPROVAL_META[state.value?.status ?? 'PROXEIRO']);
const canSend = computed(
  () => !!state.value?.canRequest && (state.value.status === 'PROXEIRO' || (state.value.status === 'EGKRITHIKE' && state.value.changedAfter)),
);
const canApproveNow = computed(() => state.value?.status === 'ELEGXOS' || (state.value?.status === 'EGKRITHIKE' && state.value.changedAfter));

const caption = computed(() => {
  const s = state.value;
  if (!s) return '';
  const name = (person: { firstName: string; lastName: string } | null) => (person ? `${person.firstName} ${person.lastName}` : '');
  switch (s.status) {
    case 'ELEGXOS':
      return `Το έστειλε ${name(s.requestedBy) || 'κάποιος'}${s.requestedAt ? ` · ${formatDateTime(s.requestedAt)}` : ''} — περιμένει τον Αρχηγό της δράσης ή διαχειριστή.`;
    case 'EGKRITHIKE':
      return `Από ${name(s.decidedBy) || 'κάποιον'}${s.decidedAt ? ` · ${formatDateTime(s.decidedAt)}` : ''}`;
    default:
      return s.canRequest ? 'Όταν είναι έτοιμο, στείλ’ το για έλεγχο.' : 'Γράφεται ακόμα.';
  }
});

async function load(): Promise<void> {
  try {
    state.value = await get<ApprovalView>('/approvals/state', { params: { document: props.document } });
  } catch {
    // Χωρίς δίκτυο ή χωρίς έγκριση για αυτό το έγγραφο: η μπάρα δεν φαίνεται.
  }
}

async function act(action: 'request' | 'approve'): Promise<void> {
  busy.value = action;
  try {
    await post(`/approvals/${action}`, { document: props.document });
    await load();
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν έγινε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    busy.value = null;
  }
}

async function giveBack(): Promise<void> {
  busy.value = 'return';
  try {
    await post('/approvals/return', { document: props.document, note: note.value.trim() });
    returnDialog.value = false;
    note.value = '';
    await load();
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν έγινε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    busy.value = null;
  }
}

async function openCompare(): Promise<void> {
  compareDialog.value = true;
  compare.value = null;
  try {
    compare.value = await get<ApprovalCompareView>('/approvals/compare', { params: { document: props.document } });
  } catch {
    $q.notify({ type: 'negative', message: 'Η σύγκριση δεν φορτώθηκε.' });
  }
}

const changedParts = computed(() => {
  const view = compare.value;
  if (!view) return [];
  const approved = new Map(view.approved.map((part) => [part.key, part.text]));
  return view.current
    .map((part) => ({ key: part.key, label: part.label, lines: diffText(approved.get(part.key) ?? '', part.text) }))
    .filter((part) => hasChanges(part.lines));
});

void load();
const stop = onDocumentChange(props.document, (change) => {
  if (change.topic === 'approval' || change.topic === '*') void load();
});
onBeforeUnmount(stop);
</script>

<style scoped lang="scss">
.approval-bar {
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--tint-soft);
}
.approval-bar--elegxos {
  background: color-mix(in srgb, #fb8c00 12%, var(--tint-soft));
}
.approval-bar--egkrithike {
  background: color-mix(in srgb, #43a047 12%, var(--tint-soft));
}
.approval-bar__note {
  margin: 8px 0 0 32px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.approval-compare {
  max-height: 70vh;
  overflow-y: auto;
}
.approval-diff {
  border-radius: 10px;
  background: var(--tint-soft);
  padding: 6px 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.approval-line--add {
  background: color-mix(in srgb, #43a047 16%, transparent);
}
.approval-line--del {
  background: color-mix(in srgb, #e53935 14%, transparent);
}
.approval-line ins {
  text-decoration: none;
  background: color-mix(in srgb, #43a047 38%, transparent);
  border-radius: 3px;
}
.approval-line del {
  background: color-mix(in srgb, #e53935 34%, transparent);
  border-radius: 3px;
}
</style>
