<template>
  <!--
    Η φόρμα αξιολόγησης προς συμπλήρωση — κοινή για τον συνδεδεμένο χρήστη (καρτέλα
    της δράσης) και για τον δημόσιο σύνδεσμο (παιδί/γονέας χωρίς λογαριασμό).
    Κρατά τις απαντήσεις και τον έλεγχο υποχρεωτικών· την αποστολή την κάνει ο γονέας.
  -->
  <div>
    <q-card flat bordered class="form-head q-mb-md">
      <q-card-section>
        <div class="form-title">{{ settings.title || defaultTitle }}</div>
        <div v-if="settings.description" class="text-body2 text-grey-8 pre-line q-mt-xs">{{ settings.description }}</div>
        <div v-if="settings.anonymous" class="text-caption text-grey-7 q-mt-sm"><q-icon name="visibility_off" size="14px" /> Οι απαντήσεις είναι ανώνυμες.</div>
        <div v-if="questions.some((q) => q.required)" class="text-caption text-negative q-mt-sm">* Υποχρεωτική</div>
      </q-card-section>
    </q-card>

    <!-- Μετά την υποβολή -->
    <q-card v-if="justSubmitted" flat bordered class="q-mb-md">
      <q-card-section class="row items-center no-wrap q-gutter-sm">
        <q-icon name="check_circle" color="positive" size="28px" />
        <div class="col">
          <div class="text-body1">{{ settings.confirmationMessage || 'Η απάντησή σου καταχωρήθηκε.' }}</div>
          <div class="text-caption text-grey-7">{{ formatDateTime(mineSubmittedAt ?? new Date().toISOString()) }}</div>
        </div>
        <q-btn v-if="canAnswer" flat color="klados" label="Αλλαγή απάντησης" @click="emit('update:justSubmitted', false)" />
      </q-card-section>
    </q-card>

    <template v-else>
      <q-banner v-if="!canAnswer" rounded class="bg-grey-2 q-mb-md">
        <template #avatar><q-icon name="lock" color="grey-7" /></template>
        {{ cannotAnswerReason }}
        <span v-if="mineSubmittedAt"> Απάντησες στις {{ formatDateTime(mineSubmittedAt) }}.</span>
      </q-banner>
      <q-banner v-else-if="mineSubmittedAt" rounded class="bg-grey-2 q-mb-md">
        <template #avatar><q-icon name="history" color="grey-7" /></template>
        Έχεις απαντήσει στις {{ formatDateTime(mineSubmittedAt) }} — μπορείς να αλλάξεις την απάντησή σου.
      </q-banner>

      <q-card v-for="q in questions" :key="q.id" flat bordered class="q-mb-md" :class="{ 'question-card--error': errors.has(q.id) }">
        <q-card-section>
          <div class="text-body1">{{ q.text }}<span v-if="q.required" class="text-negative"> *</span></div>
          <div v-if="q.description" class="text-caption text-grey-7 q-mb-sm">{{ q.description }}</div>

          <q-input v-if="q.kind === 'TEXT'" v-model="mine[q.id]!.text" dense placeholder="Η απάντησή σου" color="klados" :readonly="!canAnswer" maxlength="4000" />
          <q-input v-else-if="q.kind === 'PARAGRAPH'" v-model="mine[q.id]!.text" type="textarea" autogrow dense placeholder="Η απάντησή σου" color="klados" :readonly="!canAnswer" maxlength="4000" />
          <q-option-group v-else-if="q.kind === 'CHOICE'" v-model="mine[q.id]!.text" :options="q.options.map((o) => ({ label: o, value: o }))" color="klados" :disable="!canAnswer" />
          <q-option-group v-else-if="q.kind === 'CHECKBOX'" v-model="mine[q.id]!.choices" type="checkbox" :options="q.options.map((o) => ({ label: o, value: o }))" color="klados" :disable="!canAnswer" />
          <div v-else class="row items-center q-col-gutter-sm">
            <div v-if="q.scaleLow" class="col-auto text-caption text-grey-7">{{ q.scaleLow }}</div>
            <div class="col">
              <!-- Όχι `outline`: στο επιλεγμένο κουμπί το λευκό κείμενο γινόταν και περίγραμμα — αόρατο σε λευκό. -->
              <q-btn-toggle
                v-model="mine[q.id]!.value"
                :options="Array.from({ length: scaleMax(q.kind) }, (_, i) => ({ label: String(i + 1), value: i + 1 }))"
                unelevated
                dense
                spread
                no-caps
                color="grey-2"
                text-color="grey-9"
                toggle-color="klados"
                toggle-text-color="klados-on"
                clearable
                class="scale-toggle"
                :disable="!canAnswer"
              />
            </div>
            <div v-if="q.scaleHigh" class="col-auto text-caption text-grey-7">{{ q.scaleHigh }}</div>
          </div>
          <div v-if="errors.has(q.id)" class="text-caption text-negative q-mt-xs">Η ερώτηση είναι υποχρεωτική.</div>
        </q-card-section>
      </q-card>

      <div v-if="canAnswer && questions.length" class="row items-center q-gutter-sm">
        <q-btn color="klados" text-color="klados-on" unelevated label="Υποβολή" :loading="submitting" @click="submit" />
        <q-btn flat color="grey-7" label="Καθαρισμός" @click="clear" />
      </div>
    </template>

    <!-- Σύνοψη για τους απαντώντες, αν το επιτρέπουν οι ρυθμίσεις -->
    <template v-if="summary">
      <div class="text-subtitle2 q-mt-lg q-mb-sm">Σύνοψη απαντήσεων ({{ summary.respondents }})</div>
      <q-card v-for="q in questions" :key="q.id" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-body2 text-weight-medium q-mb-xs">{{ q.text }}</div>
          <template v-if="summaryOf(q.id)?.distribution.length">
            <div v-for="d in summaryOf(q.id)!.distribution" :key="d.label" class="row items-center no-wrap q-mb-xs">
              <div class="dist-label ellipsis">{{ d.label }}</div>
              <div class="col dist-track"><div class="dist-bar" :style="{ width: pct(d.count, summaryOf(q.id)!.count) }" /></div>
              <div class="dist-count text-caption text-grey-8">{{ d.count }}</div>
            </div>
          </template>
          <div v-for="(t, i) in summaryOf(q.id)?.texts ?? []" :key="i" class="text-body2 pre-line q-mb-xs">«{{ t.text }}»<span v-if="t.user && !settings.anonymous" class="text-caption text-grey-6"> — {{ t.user }}</span></div>
        </q-card-section>
      </q-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_REVIEW_SCALE_MAX,
  type DrasiReviewAnswerValue,
  type DrasiReviewKind,
  type DrasiReviewQuestionView,
  type DrasiReviewSettings,
  type DrasiReviewSummary,
} from '@trifylli/shared';
import { formatDateTime } from '../../lib/format';

/** Ό,τι στέλνεται στον server για μία ερώτηση. */
export type ReviewAnswerPayload = { questionId: string; value?: number | null; text?: string | null; choices?: string[] };

const props = defineProps<{
  questions: DrasiReviewQuestionView[];
  settings: Pick<DrasiReviewSettings, 'title' | 'description' | 'anonymous' | 'confirmationMessage'>;
  defaultTitle: string;
  mineAnswers: DrasiReviewAnswerValue[];
  mineSubmittedAt: string | null;
  canAnswer: boolean;
  cannotAnswerReason: string | null;
  summary: DrasiReviewSummary | null;
  submitting: boolean;
  justSubmitted: boolean;
}>();
const emit = defineEmits<{ submit: [ReviewAnswerPayload[]]; 'update:justSubmitted': [boolean] }>();

const $q = useQuasar();
const scaleMax = (k: DrasiReviewKind): number => DRASI_REVIEW_SCALE_MAX[k] ?? 5;
const mine = reactive<Record<string, { value: number | null; text: string; choices: string[] }>>({});
const errors = ref(new Set<string>());

// Οι απαντήσεις μου από τον server γίνονται η αρχική κατάσταση (και ξανά μετά από κάθε επαναφόρτωση).
watch(
  () => [props.questions, props.mineAnswers] as const,
  ([questions, answers]) => {
    for (const q of questions) {
      const a = answers.find((x) => x.questionId === q.id);
      mine[q.id] = { value: a?.value ?? null, text: a?.text ?? '', choices: [...(a?.choices ?? [])] };
    }
  },
  { immediate: true },
);

function summaryOf(questionId: string) {
  return props.summary?.questions.find((q) => q.questionId === questionId) ?? null;
}
const pct = (count: number, total: number): string => (total ? `${Math.round((count / total) * 100)}%` : '0%');

function isEmpty(q: DrasiReviewQuestionView): boolean {
  const a = mine[q.id];
  if (!a) return true;
  if (DRASI_REVIEW_SCALE_MAX[q.kind]) return a.value === null;
  if (q.kind === 'CHECKBOX') return !a.choices.length;
  return !a.text?.trim();
}
function clear(): void {
  for (const id of Object.keys(mine)) mine[id] = { value: null, text: '', choices: [] };
  errors.value = new Set();
}
function submit(): void {
  const missing = props.questions.filter((q) => q.required && isEmpty(q)).map((q) => q.id);
  errors.value = new Set(missing);
  if (missing.length) {
    $q.notify({ type: 'warning', message: 'Συμπλήρωσε τις υποχρεωτικές ερωτήσεις.' });
    return;
  }
  emit(
    'submit',
    props.questions.map((q) => {
      const a = mine[q.id]!;
      if (DRASI_REVIEW_SCALE_MAX[q.kind]) return { questionId: q.id, value: a.value };
      if (q.kind === 'CHECKBOX') return { questionId: q.id, choices: a.choices };
      return { questionId: q.id, text: a.text || null };
    }),
  );
}
</script>

<style scoped>
.form-head {
  border-top: 8px solid var(--klados-color);
}
.form-title {
  font-size: 1.5rem;
  font-weight: 600;
}
.question-card--error {
  border-color: var(--q-negative);
}
.scale-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.dist-label {
  width: 140px;
  flex: 0 0 140px;
  font-size: 0.85rem;
}
.dist-track {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  height: 18px;
  overflow: hidden;
}
.dist-bar {
  background: var(--klados-color);
  height: 100%;
  transition: width 0.3s;
}
.dist-count {
  width: 84px;
  flex: 0 0 84px;
  text-align: right;
}
.pre-line {
  white-space: pre-line;
}
</style>
