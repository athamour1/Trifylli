<template>
  <div>
    <CollabMarkdownField
      v-if="ready"
      v-bind="editorView"
      :doc="doc"
      :field="field"
      :document-name="name"
      :awareness="awareness"
      :readonly="readonly || !writable"
    />
    <template v-else>
      <!-- Δεν έχει ανοίξει ποτέ σε αυτή τη συσκευή: το κείμενο από το cache, μόνο για ανάγνωση. -->
      <MarkdownField v-bind="fallbackView" />
      <div v-if="status === 'offline'" class="text-caption text-grey-6 q-mt-sm">
        Χωρίς σύνδεση: μόνο ανάγνωση σε αυτή τη συσκευή — η επεξεργασία ανοίγει μόλις συνδεθείς.
      </div>
    </template>
    <div v-if="status === 'update-required'" class="text-caption text-orange-9 q-mt-sm">
      Βγήκε νέα έκδοση της εφαρμογής — ανανέωσε τη σελίδα για να γράψεις εδώ.
    </div>
    <div v-else-if="status === 'forbidden' && !readonly" class="text-caption text-grey-7 q-mt-sm">
      Δεν έχεις πια πρόσβαση για αλλαγές εδώ — φαίνεται η τελευταία εκδοχή που έφτασε.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue';
import type { CollabPresenceUser, KladosType } from '@trifylli/shared';
import MarkdownField from './MarkdownField.vue';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import type { SaveState } from '../lib/save-state';

/**
 * Ένα κείμενο Markdown που γράφουν πολλοί μαζί — ένα κοινό έγγραφο με ένα πεδίο
 * (π.χ. το προγραμματικό ενός στοιχείου). Ανοίγει μόνο του το έγγραφο και λέει
 * στη σελίδα πώς πάει η αποθήκευση (`state`) και ποιοι άλλοι είναι εκεί (`peers`).
 *
 * Ένα έγγραφο ανά component: όταν αλλάζει το `name`, η σελίδα του δίνει νέο `key`.
 */
const props = withDefaults(
  defineProps<{
    name: string;
    field: string;
    /** Το κείμενο από το `GET` — φαίνεται όσο το έγγραφο δεν έχει ανοίξει ποτέ εδώ. */
    fallback?: string | null | undefined;
    readonly?: boolean;
    label?: string;
    placeholder?: string;
    emptyText?: string;
    minHeight?: number;
    klados?: KladosType | null;
  }>(),
  {
    fallback: null,
    readonly: false,
    label: 'Σημειώσεις',
    placeholder: 'Markdown: **έντονα**, - λίστα, # τίτλος…',
    emptyText: 'Καμία σημείωση.',
    minHeight: 96,
    klados: null,
  },
);

const emit = defineEmits<{ state: [SaveState]; peers: [CollabPresenceUser[]] }>();

// CodeMirror φορτώνεται μόνο όταν υπάρχει κείμενο για γράψιμο.
const CollabMarkdownField = defineAsyncComponent(() => import('./CollabMarkdownField.vue'));

const { doc, awareness, ready, writable, status, peers, saveState, whenSaved } = useCollabDoc(props.name, useCollabMe());

// Οι κοινές ρυθμίσεις των δύο εμφανίσεων — ως αντικείμενα, για να μην περνούν
// `undefined` σε props που δεν το δέχονται.
const editorView = computed(() => ({
  klados: props.klados ?? null,
  label: props.label ?? '',
  placeholder: props.placeholder ?? '',
  emptyText: props.emptyText ?? 'Καμία σημείωση.',
  minHeight: props.minHeight ?? 96,
}));
const fallbackView = computed(() => ({
  modelValue: props.fallback ?? '',
  readonly: true,
  klados: props.klados ?? null,
  emptyText: props.emptyText ?? 'Καμία σημείωση.',
}));

watch(saveState, (value) => emit('state', value), { immediate: true });
watch(peers, (value) => emit('peers', value), { immediate: true });

defineExpose({ whenSaved });
</script>
