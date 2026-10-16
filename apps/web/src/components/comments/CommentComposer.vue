<template>
  <div class="comment-composer">
    <div v-if="quote" class="comment-quote">«{{ quote }}»</div>
    <q-input
      ref="inputRef"
      v-model="body"
      type="textarea"
      autogrow
      outlined
      dense
      color="klados"
      :placeholder="placeholder"
      :maxlength="COMMENT_LIMITS.body"
      :input-style="{ minHeight: '44px' }"
      @keydown="onKeydown"
      @keyup="trackCaret"
      @click="trackCaret"
      @update:model-value="onInput"
    />
    <!-- Η λίστα των στελεχών για το «@» — μέσα στη ροή, όχι σε popup (δουλεύει και στο κινητό). -->
    <q-list v-if="suggestions.length" dense class="comment-composer__people" role="listbox" aria-label="Στελέχη για αναφορά">
      <q-item
        v-for="(person, index) in suggestions"
        :key="person.id"
        clickable
        dense
        :active="index === highlighted"
        active-class="comment-composer__person--active"
        role="option"
        @mousedown.prevent="pick(person)"
      >
        <q-item-section avatar class="comment-composer__avatar">
          <q-avatar size="22px" :style="{ background: collabColor(person.id) }" text-color="white" class="comment-composer__face">
            {{ `${person.firstName.charAt(0)}${person.lastName.charAt(0)}` }}
          </q-avatar>
        </q-item-section>
        <q-item-section>{{ person.firstName }} {{ person.lastName }}</q-item-section>
      </q-item>
    </q-list>
    <div class="row items-center no-wrap q-mt-xs">
      <span class="col text-caption text-grey-7 gt-xs">«@» για αναφορά σε στέλεχος · Ctrl+Enter για αποστολή</span>
      <span class="col text-caption text-grey-7 lt-sm">«@» για αναφορά</span>
      <q-btn flat dense no-caps size="sm" label="Άκυρο" @click="emit('cancel')" />
      <q-btn unelevated dense no-caps size="sm" color="klados" class="q-ml-xs q-px-sm" :label="submitLabel" :disable="!body.trim()" :loading="busy" @click="submit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { COMMENT_LIMITS, collabColor, type CommentPerson } from '@trifylli/shared';
import { mentionLabel, mentionQuery, mentionedIn, searchable } from '../../lib/comments';

/**
 * Το κουτί ενός σχολίου (νέο, απάντηση ή διόρθωση). Με «@» ανοίγει η λίστα με τα
 * στελέχη — όχι παιδιά — και το όνομα μπαίνει ολόκληρο στο κείμενο· όσα ονόματα
 * μένουν στο κείμενο είναι οι αναφορές που φεύγουν με το σχόλιο.
 */
const props = withDefaults(
  defineProps<{
    people: CommentPerson[];
    initial?: string;
    quote?: string | null;
    placeholder?: string;
    submitLabel?: string;
    busy?: boolean;
  }>(),
  { initial: '', quote: null, placeholder: 'Γράψε σχόλιο…', submitLabel: 'Αποστολή', busy: false },
);
const emit = defineEmits<{ submit: [body: string, mentionIds: string[]]; cancel: []; 'need-people': [] }>();

const inputRef = ref<ComponentPublicInstance | null>(null);
const body = ref(props.initial);
const caret = ref(props.initial.length);
const highlighted = ref(0);
/** Η λίστα έκλεισε με Esc — ώσπου να αλλάξει το «@…». */
const dismissed = ref<string | null>(null);

function native(): HTMLTextAreaElement | null {
  const input = inputRef.value as unknown as { getNativeElement?: () => HTMLTextAreaElement } | null;
  return input?.getNativeElement?.() ?? null;
}

const query = computed(() => mentionQuery(body.value, caret.value));
const suggestions = computed(() => {
  const current = query.value;
  if (!current || dismissed.value === `${current.from}:${current.query}`) return [];
  const needle = searchable(current.query);
  return props.people
    .filter((person) => !needle || searchable(person.firstName).startsWith(needle) || searchable(person.lastName).startsWith(needle))
    .slice(0, 6);
});

watch(query, (current) => {
  highlighted.value = 0;
  if (current) emit('need-people');
});

function trackCaret(): void {
  caret.value = native()?.selectionStart ?? body.value.length;
}

function onInput(): void {
  void nextTick(trackCaret);
}

function pick(person: CommentPerson): void {
  const current = query.value;
  if (!current) return;
  const label = `${mentionLabel(person)} `;
  body.value = body.value.slice(0, current.from) + label + body.value.slice(caret.value);
  const at = current.from + label.length;
  void nextTick(() => {
    const el = native();
    el?.focus();
    el?.setSelectionRange(at, at);
    caret.value = at;
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (suggestions.value.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlighted.value = (highlighted.value + step + suggestions.value.length) % suggestions.value.length;
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const person = suggestions.value[highlighted.value];
      if (person) pick(person);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const current = query.value;
      if (current) dismissed.value = `${current.from}:${current.query}`;
      return;
    }
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submit();
  }
}

function submit(): void {
  const text = body.value.trim();
  if (!text || props.busy) return;
  emit('submit', text, mentionedIn(text, props.people));
}

onMounted(() => {
  // Οι αναφορές ενός σχολίου που διορθώνεται χρειάζονται τη λίστα για να μετρηθούν ξανά.
  if (props.initial.includes('@')) emit('need-people');
  void nextTick(() => {
    const el = native();
    el?.focus();
    el?.setSelectionRange(body.value.length, body.value.length);
  });
});
</script>

<style scoped lang="scss">
.comment-composer__people {
  margin-top: 4px;
  border-radius: 10px;
  background: var(--tint-soft);
  overflow: hidden;
}
.comment-composer__person--active {
  background: color-mix(in srgb, var(--klados-ink) 12%, transparent);
  color: inherit;
}
.comment-composer__avatar {
  min-width: 32px;
}
.comment-composer__face {
  font-size: 10px;
  font-weight: 600;
}
</style>
