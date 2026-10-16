<template>
  <div
    class="md-field"
    :class="{ 'md-field--drag': dragActive }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Μόνο ανάγνωση: το κείμενο, ζωντανά καθώς γράφουν οι άλλοι — σχολιάζεται κι έτσι. -->
    <template v-if="readonly">
      <div v-if="comments || $slots.actions" class="row items-center justify-end q-mb-xs q-gutter-xs">
        <slot name="actions" />
        <q-btn v-if="comments" flat dense no-caps size="sm" icon="add_comment" color="klados" label="Σχόλιο" @mousedown.prevent @click="startComment">
          <q-tooltip>Σχόλιο στη φράση που επέλεξες — ή σε όλο το κείμενο</q-tooltip>
        </q-btn>
      </div>
      <div ref="rendered">
        <div v-if="text.trim()" class="markdown-body" v-html="html" />
        <div v-else class="text-caption text-grey-6">{{ emptyText }}</div>
      </div>
    </template>

    <template v-else>
      <div class="row items-center justify-between q-mb-xs">
        <div class="text-caption text-grey-7">{{ label }}</div>
        <div class="row items-center q-gutter-xs">
          <slot name="actions" />
          <q-btn
            v-if="mode === 'edit'"
            flat dense no-caps size="sm" icon="image"
            color="klados"
            :loading="uploading"
            label="Εικόνα"
            @click="pickImage"
          />
          <q-btn
            v-if="comments"
            flat dense no-caps size="sm" icon="add_comment"
            color="klados"
            :label="$q.screen.gt.xs ? 'Σχόλιο' : undefined"
            aria-label="Σχόλιο"
            @mousedown.prevent
            @click="startComment"
          >
            <q-tooltip>Σχόλιο στη φράση που επέλεξες — ή σε όλο το κείμενο (Ctrl+Alt+M)</q-tooltip>
          </q-btn>
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
      <div v-if="mode === 'view'" ref="rendered" class="markdown-preview">
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

    <CommentsPanel
      v-if="comments && commentKey"
      v-model:active-id="activeId"
      :api="comments"
      :threads="threads"
      :ranges="ranges"
      :field="commentKey"
      :me-id="meId"
      :draft="draft"
      @locate="locate"
      @draft-done="draft = null"
    />

    <div v-if="dragActive" class="md-field__overlay">
      <q-icon name="add_photo_alternate" size="30px" />
      <span>Άφησε την εικόνα εδώ</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, placeholder as placeholderText, type DecorationSet } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import { UndoManager, type Doc, type Text as YText } from 'yjs';
import { COMMENT_LIMITS, type CommentAnchor, type KladosType } from '@trifylli/shared';
import SegmentedToggle from './SegmentedToggle.vue';
import CommentsPanel from './comments/CommentsPanel.vue';
import { useComments } from '../composables/useComments';
import { useMarkdownImages } from '../composables/useMarkdownImages';
import { anchorOf, findQuote, rangeOf } from '../lib/comments';
import { useAuthStore } from '../stores/auth';

/** Οι φράσεις με σχόλια μέσα στον επεξεργαστή: κίτρινη επισήμανση, που πατιέται. */
interface CommentMark {
  id: string;
  from: number;
  to: number;
  active: boolean;
}
const setCommentMarks = StateEffect.define<CommentMark[]>();
const commentMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    // Ανάμεσα στους υπολογισμούς ακολουθούν τις αλλαγές του κειμένου.
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setCommentMarks)) continue;
      const length = tr.state.doc.length;
      next = Decoration.set(
        effect.value
          .filter((mark) => mark.from < mark.to && mark.to <= length)
          .map((mark) =>
            Decoration.mark({ class: mark.active ? 'cm-comment cm-comment--active' : 'cm-comment', attributes: { 'data-comment': mark.id } }).range(mark.from, mark.to),
          ),
        true,
      );
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

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
    /** Το πεδίο (κείμενο) στη ρίζα του εγγράφου… */
    field?: string;
    /** …ή ένα κείμενο μέσα στη δομή του (π.χ. η περιγραφή ενός κομματιού της συγκέντρωσης). */
    text?: YText | null;
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
    /**
     * Το κείμενο για τα σχόλια (`description`, `block:<id>`…) — από προεπιλογή το
     * `field`. Χωρίς αυτό (ή χωρίς `documentName`) δεν υπάρχουν σχόλια.
     */
    commentKey?: string | null;
  }>(),
  {
    field: '',
    commentKey: null,
    text: null,
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

const $q = useQuasar();
const mode = ref<'edit' | 'view'>('edit');
const host = ref<HTMLElement | null>(null);
const rendered = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const view = shallowRef<EditorView | null>(null);

// ── Τα σχόλια του κειμένου ──
const commentKey = props.commentKey ?? (props.field || null);
const comments = props.documentName && commentKey ? useComments(props.documentName) : null;
const auth = useAuthStore();
const meId = computed(() => auth.profile?.user.id ?? null);
const threads = computed(() => comments?.threads.value.filter((thread) => thread.field === commentKey) ?? []);
/** Πού είναι τώρα η φράση κάθε νήματος (`null` = σβήστηκε). */
const ranges = shallowRef<Map<string, { from: number; to: number } | null>>(new Map());
const activeId = ref<string | null>(null);
const draft = ref<{ anchor: CommentAnchor | null; quote: string | null } | null>(null);

// ── Το κείμενο, ζωντανά (για προβολή και μόνο-ανάγνωση) ──
const text = ref('');
let ytext: YText | null = null;
const syncText = (): void => {
  text.value = ytext?.toString() ?? '';
};
const onTextChange = (): void => {
  syncText();
  if (comments) scheduleRanges();
};

function bindText(): void {
  ytext?.unobserve(onTextChange);
  ytext = props.text ?? (props.field ? props.doc.getText(props.field) : null);
  ytext?.observe(onTextChange);
  syncText();
  if (comments) scheduleRanges();
}

/** Οι θέσεις των φράσεων ξανά από το Yjs — μετά από κάθε αλλαγή του κειμένου ή των σχολίων. */
function recomputeRanges(): void {
  const next = new Map<string, { from: number; to: number } | null>();
  if (ytext) for (const thread of threads.value) if (thread.anchor) next.set(thread.id, rangeOf(props.doc, ytext, thread.anchor, thread.quote));
  ranges.value = next;
  paintComments();
}

// Όχι μέσα στην ενημέρωση του επεξεργαστή (εκεί γράφεται το Yjs για τις δικές μας αλλαγές).
let rangesQueued = false;
function scheduleRanges(): void {
  if (rangesQueued) return;
  rangesQueued = true;
  queueMicrotask(() => {
    rangesQueued = false;
    recomputeRanges();
  });
}

function paintComments(): void {
  const editor = view.value;
  if (!editor) return;
  const marks = threads.value
    .filter((thread) => !thread.resolvedAt)
    .flatMap((thread) => {
      const range = ranges.value.get(thread.id);
      return range ? [{ id: thread.id, ...range, active: thread.id === activeId.value }] : [];
    });
  editor.dispatch({ effects: setCommentMarks.of(marks) });
}

watch(threads, scheduleRanges);
watch(activeId, paintComments);

/** Η τελευταία επιλογή μέσα στην προβολή — στο κινητό χάνεται με το πάτημα του κουμπιού. */
let picked: string | null = null;
function onSelectionChange(): void {
  const selection = window.getSelection();
  const container = rendered.value;
  if (!selection || !container || !selection.anchorNode || !container.contains(selection.anchorNode)) return;
  picked = selection.isCollapsed ? null : selection.toString();
}

/** «Σχόλιο»: στη φράση που επέλεξες (στο κείμενο ή στην προβολή) — αλλιώς σε όλο το κείμενο. */
function startComment(): void {
  if (!ytext) return;
  let anchor: CommentAnchor | null = null;
  let quote: string | null = null;
  const editor = view.value;
  if (editor && !props.readonly && mode.value === 'edit') {
    const { from, to } = editor.state.selection.main;
    if (from < to) {
      anchor = anchorOf(ytext, from, to);
      quote = editor.state.sliceDoc(from, to);
    }
  } else if (picked?.trim()) {
    quote = picked;
    const range = findQuote(ytext.toString(), picked);
    if (range) anchor = anchorOf(ytext, range.from, range.to);
  }
  const shown = quote?.replace(/\s+/g, ' ').trim() ?? '';
  draft.value = { anchor, quote: shown ? shown.slice(0, COMMENT_LIMITS.quote) : null };
}

/** Δείχνει τη φράση ενός νήματος στο κείμενο. */
async function locate(id: string): Promise<void> {
  activeId.value = id;
  const range = ranges.value.get(id);
  if (!range) return;
  if (!props.readonly && mode.value !== 'edit') {
    mode.value = 'edit';
    await nextTick();
  }
  const editor = view.value;
  if (editor) editor.dispatch({ effects: EditorView.scrollIntoView(range.from, { y: 'center' }) });
  else rendered.value?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
  // Φράσεις με σχόλιο: όπως ένας μαρκαδόρος, πιο έντονα το νήμα που είναι ανοιχτό.
  '.cm-comment': {
    backgroundColor: 'color-mix(in srgb, #f9a825 22%, transparent)',
    borderBottom: '2px solid color-mix(in srgb, #f9a825 75%, transparent)',
    cursor: 'pointer',
  },
  '.cm-comment--active': { backgroundColor: 'color-mix(in srgb, #f9a825 42%, transparent)' },
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
        keymap.of([
          ...(comments
            ? [
                {
                  key: 'Mod-Alt-m',
                  run: () => {
                    startComment();
                    return true;
                  },
                },
              ]
            : []),
          ...yUndoManagerKeymap,
          ...defaultKeymap,
        ]),
        yCollab(ytext, props.awareness ?? null, { undoManager }),
        commentMarks,
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
          // Πάτημα σε φράση με σχόλιο: ανοίγει το νήμα της (ο κέρσορας μπαίνει κανονικά).
          click: (event) => {
            const id = (event.target as HTMLElement | null)?.closest?.('[data-comment]')?.getAttribute('data-comment');
            if (id) activeId.value = id;
            return false;
          },
        }),
        theme,
        EditorView.theme({ '.cm-content': { minHeight: `${props.minHeight}px` } }),
      ],
    }),
  });
  if (comments) recomputeRanges();
}

function destroyEditor(): void {
  view.value?.destroy();
  view.value = null;
}

// Νέο έγγραφο (π.χ. το αντίγραφο της συσκευής αντικαταστάθηκε) ή νέα awareness:
// ο επεξεργαστής ξαναστήνεται πάνω τους.
watch(
  () => [props.doc, props.field, props.text, props.awareness, props.readonly] as const,
  async () => {
    bindText();
    await nextTick();
    buildEditor();
  },
);

onMounted(() => {
  bindText();
  buildEditor();
  if (comments) document.addEventListener('selectionchange', onSelectionChange);
});

onBeforeUnmount(() => {
  ytext?.unobserve(onTextChange);
  destroyEditor();
  document.removeEventListener('selectionchange', onSelectionChange);
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
