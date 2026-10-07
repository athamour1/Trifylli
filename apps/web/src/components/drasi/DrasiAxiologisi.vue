<template>
  <div>
    <q-inner-loading :showing="loading" />

    <!-- ── Θέματα (τα φτιάχνουν τα στελέχη) ── -->
    <q-card v-if="canWrite" flat bordered class="q-mb-md">
      <q-card-section class="row items-center q-pb-xs">
        <div class="text-subtitle2 col">Θέματα αξιολόγησης</div>
        <q-btn flat dense color="klados" icon="add" label="Θέμα" @click="addQuestion" />
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div v-if="!editor.length" class="text-caption text-grey-6">
          Χωρίς θέματα η αξιολόγηση δεν εμφανίζεται σε κανέναν. Πρόσθεσε ό,τι θέλεις να μάθεις — π.χ. «Τι θα
          άλλαζες στο πρόγραμμα;», «Πόσο καλά δούλεψε η τροφοδοσία; (1–5)».
        </div>
        <div v-for="(q, i) in editor" :key="q.key" class="row q-col-gutter-sm items-start q-mb-xs">
          <div class="col-12 col-sm-8"><q-input v-model="q.text" :label="`Θέμα ${i + 1}`" outlined dense color="klados" /></div>
          <div class="col-9 col-sm-3">
            <q-select v-model="q.kind" :options="kindOptions" label="Είδος" outlined dense emit-value map-options color="klados" />
          </div>
          <div class="col-3 col-sm-1 row items-center">
            <q-btn flat dense round icon="delete" color="negative" @click="editor.splice(i, 1)" />
          </div>
        </div>
        <div v-if="editor.length || view?.questions.length" class="row justify-end q-mt-sm">
          <q-btn color="klados" text-color="klados-on" label="Αποθήκευση θεμάτων" :loading="saving" @click="saveQuestions" />
        </div>
      </q-card-section>
    </q-card>

    <div v-if="view && !view.questions.length && !canWrite" class="text-center text-grey-6 q-pa-lg">
      Δεν έχει οριστεί αξιολόγηση για αυτή τη δράση.
    </div>

    <!-- ── Οι απαντήσεις μου ── -->
    <q-card v-if="view?.questions.length" flat bordered class="q-mb-md">
      <q-card-section class="q-pb-xs text-subtitle2">Η αξιολόγησή μου</q-card-section>
      <q-card-section class="q-pt-none">
        <div v-for="q in view.questions" :key="q.id" class="q-mb-md">
          <div class="text-body2 q-mb-xs">{{ q.text }}</div>
          <q-rating v-if="q.kind === 'SCALE_1_5'" v-model="mine[q.id]!.value" :max="5" size="2em" color="klados" icon="star_border" icon-selected="star" />
          <q-input v-else v-model="mine[q.id]!.text" type="textarea" autogrow outlined dense color="klados" placeholder="Η άποψή σου" />
        </div>
        <div class="row justify-end">
          <q-btn color="klados" text-color="klados-on" label="Υποβολή" :loading="saving" @click="saveAnswers" />
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Σύνοψη (υπεύθυνοι) ── -->
    <q-card v-if="view?.summary && view.questions.length" flat bordered>
      <q-card-section class="q-pb-xs row items-center">
        <div class="text-subtitle2 col">Σύνοψη</div>
        <q-badge outline color="grey-7" :label="`${view.summary.respondents} απάντησαν`" />
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div v-for="q in view.questions" :key="q.id" class="q-mb-md">
          <div class="text-body2 text-weight-medium">{{ q.text }}</div>
          <template v-if="q.kind === 'SCALE_1_5'">
            <div class="row items-center q-gutter-sm">
              <q-rating :model-value="summaryOf(q.id)?.average ?? 0" :max="5" size="1.4em" color="klados" readonly icon="star_border" icon-selected="star" icon-half="star_half" />
              <span class="text-caption text-grey-7">{{ summaryOf(q.id)?.average ?? '—' }} / 5 · {{ summaryOf(q.id)?.count ?? 0 }} απαντήσεις</span>
            </div>
          </template>
          <q-list v-else dense>
            <q-item v-for="(t, i) in summaryOf(q.id)?.texts ?? []" :key="i" class="q-px-none">
              <q-item-section>
                <q-item-label>{{ t.text }}</q-item-label>
                <q-item-label caption>{{ t.user }}</q-item-label>
              </q-item-section>
            </q-item>
            <div v-if="!summaryOf(q.id)?.texts.length" class="text-caption text-grey-6">Καμία απάντηση.</div>
          </q-list>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { DRASI_REVIEW_KIND_LABEL, DrasiReviewKind, type DrasiReviewView } from '@trifylli/shared';
import { ApiError, get, put } from '../../lib/api';

const props = defineProps<{ drasiId: string; canWrite: boolean }>();
const $q = useQuasar();
const loading = ref(false);
const saving = ref(false);
const view = ref<DrasiReviewView | null>(null);

interface EditorRow {
  key: number;
  id?: string;
  text: string;
  kind: DrasiReviewKind;
}
const editor = reactive<EditorRow[]>([]);
const mine = reactive<Record<string, { value: number; text: string }>>({});
let nextKey = 1;
const kindOptions = (Object.keys(DrasiReviewKind) as DrasiReviewKind[]).map((k) => ({ label: DRASI_REVIEW_KIND_LABEL[k], value: k }));

function summaryOf(questionId: string) {
  return view.value?.summary?.questions.find((q) => q.questionId === questionId) ?? null;
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiReviewView>(`/draseis/${props.drasiId}/review`);
    editor.splice(0, editor.length, ...view.value.questions.map((q) => ({ key: nextKey++, id: q.id, text: q.text, kind: q.kind })));
    for (const q of view.value.questions) {
      const a = view.value.mine.find((x) => x.questionId === q.id);
      mine[q.id] = { value: a?.value ?? 0, text: a?.text ?? '' };
    }
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης αξιολόγησης.');
  } finally {
    loading.value = false;
  }
}
onMounted(reload);

function addQuestion(): void {
  editor.push({ key: nextKey++, text: '', kind: 'TEXT' });
}

async function saveQuestions(): Promise<void> {
  saving.value = true;
  try {
    await put(`/draseis/${props.drasiId}/review/questions`, {
      questions: editor.filter((q) => q.text.trim()).map((q) => ({ ...(q.id ? { id: q.id } : {}), text: q.text.trim(), kind: q.kind })),
    });
    await reload();
    $q.notify({ type: 'positive', message: 'Τα θέματα αποθηκεύτηκαν.' });
  } catch (err) {
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  } finally {
    saving.value = false;
  }
}

async function saveAnswers(): Promise<void> {
  if (!view.value) return;
  saving.value = true;
  try {
    await put(`/draseis/${props.drasiId}/review/answers`, {
      answers: view.value.questions.map((q) => ({
        questionId: q.id,
        ...(q.kind === 'SCALE_1_5' ? { value: mine[q.id]?.value || null } : { text: mine[q.id]?.text || null }),
      })),
    });
    await reload();
    $q.notify({ type: 'positive', message: 'Η αξιολόγησή σου καταχωρήθηκε.' });
  } catch (err) {
    notifyError(err, 'Αποτυχία υποβολής.');
  } finally {
    saving.value = false;
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>
