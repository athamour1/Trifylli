<template>
  <div
    class="md-field"
    :class="{ 'md-field--drag': dragActive }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Μόνο ανάγνωση: το κείμενο, ζωντανά καθώς γράφουν οι άλλοι. -->
    <template v-if="readonly">
      <div v-if="text.trim()" class="markdown-body" v-html="html" />
      <div v-else class="text-caption text-grey-6">{{ emptyText }}</div>
    </template>

    <template v-else>
      <div class="row items-center justify-between q-mb-xs">
        <div class="text-caption text-grey-7">{{ label }}</div>
        <div class="row items-center q-gutter-xs">
          <q-btn
            v-if="mode === 'edit'"
            flat dense no-caps size="sm" icon="image"
            color="klados"
            :loading="uploading"
            label="Εικόνα"
            @click="pickImage"
          />
          <SegmentedToggle
            v-model="mode"
            dense flat no-caps size="sm"
            toggle-color="klados"
            :options="[
              { label: 'Κείμενο', value: 'edit' },
              { label: 'Προβολή', value: 'view' },
            ]"
          />
        </div>
      </div>

      <!-- v-show: ο επεξεργαστής μένει ζωντανός στην εναλλαγή (θέση κέρσορα, undo). -->
      <div v-show="mode === 'edit'" ref="host" class="collab-md__editor" />
      <div v-if="mode === 'view'" class="markdown-preview">
        <div v-if="text.trim()" class="markdown-body" v-html="html" />
        <div v-else class="text-caption text-grey-6">{{ emptyText }}</div>
      </div>

      <div v-if="mode === 'edit'" class="text-caption text-grey-6 q-mt-xs">
        Σύρε ή επικόλλησε εικόνα μέσα στο κείμενο.
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        style="display: none"
        @change="onPick"
      />
    </template>

    <div v-if="dragActive" class="md-field__overlay">
      <q-icon name="add_photo_alternate" size="30px" />
      <span>Άφησε την εικόνα εδώ</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderText } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import { UndoManager, type Doc, type Text as YText } from 'yjs';
import type { KladosType } from '@trifylli/shared';
import SegmentedToggle from './SegmentedToggle.vue';
import { useMarkdownImages } from '../composables/useMarkdownImages';

/**
 * Πεδίο Markdown που γράφουν πολλοί μαζί (Yjs + CodeMirror 6).
 *
 * Ίδια εμφάνιση και ίδιες εικόνες με το `MarkdownField`· η διαφορά είναι ότι το
 * κείμενο είναι ένα κομμάτι (`field`) ενός κοινού εγγράφου (`useCollabDoc`): οι
 * αλλαγές των άλλων εμφανίζονται αμέσως, με τον κέρσορα και το όνομά τους, και
 * το undo αναιρεί μόνο τις δικές σου. Δεν έχει `v-model` — αποθηκεύει το ίδιο το
 * έγγραφο.
 */
const props = withDefaults(
  defineProps<{
    doc: Doc;
    field: string;
    /** Το όνομα του κοινού εγγράφου — οι εικόνες που ανεβαίνουν ανήκουν σε αυτό. */
    documentName?: string | null;
    awareness?: Awareness | null;
    label?: string;
    placeholder?: string;
    readonly?: boolean;
    emptyText?: string;
    minHeight?: number;
    /** Εμβέλεια των εικόνων (κλάδος ή `null` για Τοπικό). */
    klados?: KladosType | null;
  }>(),
  {
    documentName: null,
    awareness: null,
    label: 'Σημειώσεις',
    placeholder: 'Markdown: **έντονα**, - λίστα, # τίτλος…',
    readonly: false,
    emptyText: 'Καμία σημείωση.',
    minHeight: 96,
    klados: null,
  },
);

const mode = ref<'edit' | 'view'>('edit');
const host = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const view = shallowRef<EditorView | null>(null);

// ── Το κείμενο, ζωντανά (για προβολή και μόνο-ανάγνωση) ──
const text = ref('');
let ytext: YText | null = null;
const syncText = (): void => {
  text.value = ytext?.toString() ?? '';
};

function bindText(): void {
  ytext?.unobserve(syncText);
  ytext = props.doc.getText(props.field);
  ytext.observe(syncText);
  syncText();
}

const { html, uploading, dragActive, uploadFiles, onPaste, onDragEnter, onDragOver, onDragLeave, onDrop } =
  useMarkdownImages({
    text: () => text.value,
    klados: () => props.klados,
    insert,
    accepts: () => !props.readonly && mode.value === 'edit',
    document: () => props.documentName,
  });

/** Το κείμενο μπαίνει εκεί που είναι ο κέρσορας — και φεύγει στους άλλους όπως κάθε πληκτρολόγηση. */
function insert(snippet: string): void {
  const editor = view.value;
  if (!editor) {
    ytext?.insert(ytext.length, snippet);
    return;
  }
  const { from, to } = editor.state.selection.main;
  editor.dispatch({ changes: { from, to, insert: snippet }, selection: { anchor: from + snippet.length } });
  editor.focus();
}

function pickImage(): void {
  fileInput.value?.click();
}
function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  void uploadFiles(input.files);
  input.value = '';
}

// ── CodeMirror ──
const theme = EditorView.theme({
  '&': {
    fontSize: '0.95rem',
    border: '1px solid var(--line-strong)',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    transition: 'border-color 160ms ease, box-shadow 160ms ease',
  },
  '&:hover': { borderColor: 'color-mix(in srgb, var(--ink) 55%, transparent)' },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--klados-ink)',
    boxShadow: '0 0 0 1px var(--klados-ink), 0 0 0 4px color-mix(in srgb, var(--klados-ink) 16%, transparent)',
  },
  // Χωρίς κόψιμο: το όνομα πάνω από κέρσορα της πρώτης γραμμής βγαίνει πάνω από το
  // περίγραμμα. Οι γραμμές αναδιπλώνονται, οπότε δεν χρειάζεται οριζόντια κύλιση.
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.5', overflow: 'visible' },
  '.cm-content': { padding: '9px 0', caretColor: 'var(--klados-ink)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-placeholder': { color: 'var(--text-soft)' },
  // Το όνομα πάνω από τον κέρσορα των άλλων φαίνεται πάντα — όχι μόνο στο hover.
  '.cm-ySelectionInfo': {
    opacity: '1',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: '600',
    padding: '1px 5px',
    borderRadius: '4px 4px 4px 0',
    top: '-1.45em',
    whiteSpace: 'nowrap',
  },
  '.cm-ySelectionCaret': { borderLeftWidth: '2px', borderRightWidth: '0' },
});

function buildEditor(): void {
  destroyEditor();
  if (props.readonly || !host.value || !ytext) return;
  const undoManager = new UndoManager(ytext);
  view.value = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [
        keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
        yCollab(ytext, props.awareness ?? null, { undoManager }),
        EditorView.lineWrapping,
        placeholderText(props.placeholder),
        EditorView.contentAttributes.of({
          lang: 'el',
          spellcheck: 'true',
          autocapitalize: 'sentences',
          'aria-label': props.label,
        }),
        EditorView.domEventHandlers({
          paste: (event) => {
            onPaste(event);
            return event.defaultPrevented;
          },
        }),
        theme,
        EditorView.theme({ '.cm-content': { minHeight: `${props.minHeight}px` } }),
      ],
    }),
  });
}

function destroyEditor(): void {
  view.value?.destroy();
  view.value = null;
}

// Νέο έγγραφο (π.χ. το αντίγραφο της συσκευής αντικαταστάθηκε) ή νέα awareness:
// ο επεξεργαστής ξαναστήνεται πάνω τους.
watch(
  () => [props.doc, props.field, props.awareness, props.readonly] as const,
  async () => {
    bindText();
    await nextTick();
    buildEditor();
  },
);

onMounted(() => {
  bindText();
  buildEditor();
});

onBeforeUnmount(() => {
  ytext?.unobserve(syncText);
  destroyEditor();
});
</script>

<style lang="scss">
.collab-md__editor {
  // Στο κινητό κάτω από 16px ο browser κάνει zoom σε κάθε πάτημα στο πεδίο.
  @media (pointer: coarse) {
    .cm-editor {
      font-size: 16px;
    }
  }
}
</style>
