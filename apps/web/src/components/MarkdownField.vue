<template>
  <div
    class="md-field"
    :class="{ 'md-field--drag': dragActive }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Μόνο ανάγνωση: ούτε tabs ούτε textarea, απλώς το κείμενο. -->
    <template v-if="readonly">
      <div v-if="modelValue.trim()" class="markdown-body" v-html="html" />
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

      <q-input
        v-if="mode === 'edit'"
        ref="inputRef"
        :model-value="modelValue"
        type="textarea"
        outlined
        autogrow
        color="klados"
        :input-style="{ minHeight: `${minHeight}px` }"
        :placeholder="placeholder"
        @update:model-value="(value) => emit('update:modelValue', String(value ?? ''))"
      />
      <div v-else class="markdown-preview">
        <div v-if="modelValue.trim()" class="markdown-body" v-html="html" />
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
import { nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue';
import type { KladosType } from '@trifylli/shared';
import { useMarkdownImages } from '../composables/useMarkdownImages';

/**
 * Πεδίο Markdown με εναλλαγή γραφής/προβολής και ενσωματωμένες εικόνες.
 *
 * Markdown και όχι WYSIWYG: ο σχεδιασμός γράφεται βιαστικά, συχνά στο κινητό,
 * και μια λίστα με παύλες είναι πιο γρήγορη από μια μπάρα εργαλείων. Οι εικόνες
 * ανεβαίνουν στο object storage και σερβίρονται μέσω του backend με auth — στο
 * κείμενο μένει μια σταθερή αναφορά `![](trifylli:ID)`, που στο render γίνεται
 * blob URL (βλ. `useMarkdownImages`). Για κείμενα που γράφουν πολλοί μαζί υπάρχει
 * το `CollabMarkdownField`.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    placeholder?: string;
    readonly?: boolean;
    emptyText?: string;
    minHeight?: number;
    /** Εμβέλεια των εικόνων (κλάδος ή `null` για Τοπικό). */
    klados?: KladosType | null;
  }>(),
  {
    label: 'Σημειώσεις',
    placeholder: 'Markdown: **έντονα**, - λίστα, # τίτλος…',
    readonly: false,
    emptyText: 'Καμία σημείωση.',
    minHeight: 96,
    klados: null,
  },
);

const emit = defineEmits<{ 'update:modelValue': [string] }>();

const mode = ref<'edit' | 'view'>('edit');

const inputRef = ref<ComponentPublicInstance | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const { html, uploading, dragActive, uploadFiles, onPaste, onDragEnter, onDragOver, onDragLeave, onDrop } =
  useMarkdownImages({
    text: () => props.modelValue,
    klados: () => props.klados,
    insert: insertAtCursor,
    accepts: () => !props.readonly && mode.value === 'edit',
  });

function textarea(): HTMLTextAreaElement | null {
  const input = inputRef.value as unknown as { getNativeElement?: () => HTMLTextAreaElement } | null;
  return input?.getNativeElement?.() ?? null;
}

function pickImage(): void {
  fileInput.value?.click();
}
function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  void uploadFiles(input.files);
  input.value = '';
}

function insertAtCursor(text: string): void {
  const el = textarea();
  const start = el?.selectionStart ?? props.modelValue.length;
  const end = el?.selectionEnd ?? start;
  const next = props.modelValue.slice(0, start) + text + props.modelValue.slice(end);
  emit('update:modelValue', next);
  void nextTick(() => {
    const node = textarea();
    if (node) {
      const pos = start + text.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    }
  });
}

// ── Προσάρτηση listeners στο textarea (υπάρχει μόνο σε κατάσταση γραφής) ──
let bound: HTMLTextAreaElement | null = null;
function bindEditor(): void {
  const el = textarea();
  if (el && el !== bound) {
    unbindEditor();
    // Το paste πάει στο textarea· το drag-drop το χειρίζεται το dropzone wrapper.
    el.addEventListener('paste', onPaste);
    bound = el;
  }
}
function unbindEditor(): void {
  if (bound) {
    bound.removeEventListener('paste', onPaste);
    bound = null;
  }
}

watch(
  mode,
  async (value) => {
    if (props.readonly) return;
    if (value === 'edit') {
      await nextTick();
      bindEditor();
    } else {
      unbindEditor();
    }
  },
  { immediate: true },
);

onBeforeUnmount(unbindEditor);
</script>

<style lang="scss">
// Χωρίς `scoped`: το περιεχόμενο μπαίνει με `v-html`, οπότε δεν φέρει τα
// attributes του component και ένα scoped στυλ δεν θα το άγγιζε.
.markdown-body {
  font-size: 0.95rem;
  line-height: 1.55;
  word-break: break-word;

  > *:first-child {
    margin-top: 0;
  }
  > *:last-child {
    margin-bottom: 0;
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 0.8em 0 0.4em;
    font-weight: 600;
    line-height: 1.25;
  }
  h1 {
    font-size: 1.3rem;
  }
  h2 {
    font-size: 1.15rem;
  }
  h3,
  h4 {
    font-size: 1rem;
  }

  p,
  ul,
  ol,
  blockquote,
  pre {
    margin: 0 0 0.6em;
  }

  ul,
  ol {
    padding-left: 1.4em;
  }

  blockquote {
    margin-left: 0;
    padding-left: 0.9em;
    border-left: 3px solid var(--klados-color);
    color: #555;
  }

  code {
    padding: 0.1em 0.35em;
    border-radius: 3px;
    background: var(--tint);
    font-size: 0.9em;
  }

  pre {
    padding: 0.7em;
    border-radius: 4px;
    overflow-x: auto;
    background: var(--tint);

    code {
      padding: 0;
      background: none;
    }
  }

  img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin: 0.3em 0;

    &.md-img-pending {
      min-width: 120px;
      min-height: 60px;
      background: var(--tint);
    }
  }

  table {
    border-collapse: collapse;

    th,
    td {
      padding: 0.3em 0.6em;
      border: 1px solid var(--line);
    }
  }

  hr {
    border: none;
    border-top: 1px solid var(--line);
  }
}

.markdown-preview {
  min-height: 96px;
  padding: 11px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
}

// Ολόκληρο το πεδίο είναι περιοχή drag-and-drop εικόνας.
.md-field {
  position: relative;
  border-radius: 6px;

  &--drag {
    outline: 2px dashed var(--klados-color);
    outline-offset: 2px;
  }
}

.md-field__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  color: var(--klados-ink, var(--q-primary));
  font-weight: 600;
  pointer-events: none;
  z-index: 2;
}
</style>
