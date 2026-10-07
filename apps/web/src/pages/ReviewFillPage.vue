<template>
  <!--
    Η αξιολόγηση με δημόσιο σύνδεσμο: το παιδί (ή ο γονέας του) χωρίς λογαριασμό,
    όπως τα έντυπα. Ένας σύνδεσμος = ένας συμμετέχων = μία απάντηση.
  -->
  <q-page class="review-page flex flex-center q-pa-md">
    <div class="review-card">
      <div v-if="loading" class="text-center q-pa-xl"><q-spinner size="40px" color="primary" /></div>

      <q-card v-else-if="error" flat bordered>
        <q-card-section class="text-center q-pa-xl">
          <q-icon name="link_off" size="48px" color="grey-6" class="block q-mb-md" />
          <div class="text-subtitle1">{{ error }}</div>
        </q-card-section>
      </q-card>

      <template v-else-if="view">
        <div class="text-caption text-grey-7 q-mb-xs">{{ view.drasi.topiko }} · Σ.Ε.Ο. · {{ view.drasi.title }} · {{ formatDateRange(view.drasi.dateStart, view.drasi.dateEnd) }}</div>
        <div class="text-body2 q-mb-md">
          Για: <b>{{ view.participant.firstName }} {{ view.participant.lastName }}</b>
        </div>
        <ReviewQuestionsForm
          v-model:just-submitted="justSubmitted"
          :questions="view.questions"
          :settings="view.settings"
          :default-title="`Αξιολόγηση — ${view.drasi.title}`"
          :mine-answers="view.mine"
          :mine-submitted-at="view.mineSubmittedAt"
          :can-answer="view.canAnswer"
          :cannot-answer-reason="view.cannotAnswerReason"
          :summary="view.summary"
          :submitting="submitting"
          @submit="submit"
        />
        <div v-if="!view.questions.length" class="text-center text-grey-6 q-pa-lg">Η αξιολόγηση δεν έχει ερωτήσεις ακόμη.</div>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute } from 'vue-router';
import type { PublicReviewView } from '@trifylli/shared';
import ReviewQuestionsForm, { type ReviewAnswerPayload } from '../components/drasi/ReviewQuestionsForm.vue';
import { ApiError, get, post } from '../lib/api';
import { formatDateRange } from '../lib/format';

const route = useRoute();
const $q = useQuasar();
const token = String(route.params.token ?? '');
const loading = ref(true);
const error = ref<string | null>(null);
const view = ref<PublicReviewView | null>(null);
const submitting = ref(false);
const justSubmitted = ref(false);

onMounted(async () => {
  try {
    view.value = await get<PublicReviewView>(`/review/${token}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Ο σύνδεσμος δεν είναι διαθέσιμος.';
  } finally {
    loading.value = false;
  }
});

async function submit(answers: ReviewAnswerPayload[]): Promise<void> {
  submitting.value = true;
  try {
    view.value = await post<PublicReviewView>(`/review/${token}`, { answers });
    justSubmitted.value = true;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία υποβολής — δοκιμάστε ξανά.' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.review-page {
  background: var(--app-bg, #f4f6f8);
  min-height: 100vh;
}
.review-card {
  width: 100%;
  max-width: 680px;
}
</style>
