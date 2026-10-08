<template>
  <!--
    Η σελίδα του γονέα (ή του ίδιου του ενήλικου): ένα έντυπο, ένα άτομο, χωρίς
    μενού και χωρίς συνεδρία. Οι ερωτήσεις είναι μία προς μία αυτές του επίσημου
    εντύπου του Σ.Ε.Ο. — ό,τι συμπληρωθεί εδώ τυπώνεται πάνω στο πρωτότυπο.
  -->
  <q-page class="form-page flex flex-center q-pa-md">
    <q-card flat bordered class="form-card">
      <q-card-section v-if="loading" class="text-center q-pa-xl">
        <q-spinner size="40px" color="klados" />
      </q-card-section>

      <template v-else-if="error">
        <q-card-section class="text-center q-pa-xl">
          <q-icon name="link_off" size="48px" color="grey-6" class="block q-mx-auto q-mb-md" />
          <div class="text-subtitle1">{{ error }}</div>
        </q-card-section>
      </template>

      <template v-else-if="done || form?.status === 'SUBMITTED'">
        <q-card-section class="text-center q-pa-xl">
          <q-icon name="check_circle" size="56px" color="positive" class="block q-mx-auto q-mb-md" />
          <div class="text-h6">Ευχαριστούμε!</div>
          <div class="text-body2 text-grey-7 q-mt-sm">Το έντυπο καταχωρήθηκε. Ο σύνδεσμος αυτός δεν ισχύει πια.</div>
        </q-card-section>
      </template>

      <template v-else-if="form">
        <q-card-section class="q-pb-none">
          <div class="text-caption text-grey-7">{{ form.drasi.topiko }} · Σ.Ε.Ο.</div>
          <div class="text-h6">{{ title }}</div>
          <div class="text-body2">
            <b>{{ form.participant.firstName }} {{ form.participant.lastName }}</b> ·
            {{ form.drasi.title }} · {{ formatDateRange(form.drasi.dateStart, form.drasi.dateEnd) }}
            <span v-if="form.drasi.location"> · {{ form.drasi.location }}</span>
          </div>
          <div v-if="form.type === 'SYMMETOXI'" class="text-body2 text-grey-8 q-mt-sm">
            Ο/Η κάτωθι υπογεγραμμένος/η γονέας/κηδεμόνας δηλώνω υπεύθυνα ότι δέχομαι το παιδί μου / το μέλος υπό την κηδεμονία μου να
            συμμετάσχει στην Οδηγική δράση που αναφέρεται παραπάνω.
          </div>
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <template v-for="field in visibleFields" :key="field.key">
            <div v-if="field.section" class="text-subtitle2 q-pt-sm section-title">{{ field.section }}</div>

            <div v-if="field.kind === 'yesno'" class="field-row">
              <div class="text-body2">{{ labelOf(field) }}<span v-if="field.required" class="text-negative"> *</span></div>
              <SegmentedToggle
                v-model="answers[field.key]"
                dense
                unelevated
                toggle-color="klados"
                color="grey-3"
                text-color="grey-9"
                class="q-mt-xs"
                :options="[
                  { label: 'Ναι', value: true },
                  { label: 'Όχι', value: false },
                ]"
              />
              <div v-if="field.hint" class="text-caption text-grey-7 q-mt-xs">{{ field.hint }}</div>
            </div>
            <q-select
              v-else-if="field.kind === 'select'"
              :model-value="textAnswer(field.key)"
              :options="field.options ?? []"
              @update:model-value="(v: string | null) => setAnswer(field.key, v)"
              :label="labelOf(field) + (field.required ? ' *' : '')"
              outlined
              dense
              :hint="field.hint"
            />
            <q-input
              v-else
              :model-value="textAnswer(field.key)"
              :label="labelOf(field) + (field.required ? ' *' : '')"
              @update:model-value="(v: string | number | null) => setAnswer(field.key, v)"
              :type="field.kind === 'textarea' ? 'textarea' : field.kind === 'phone' ? 'tel' : 'text'"
              :autogrow="field.kind === 'textarea'"
              outlined
              dense
              :hint="field.hint"
            />
          </template>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-gutter-md">
          <div class="text-subtitle2">Υπογραφή</div>
          <!-- Το όνομα έρχεται από το μητρώο και δεν αλλάζει· αν είναι πάνω από ένας γονέας/κηδεμόνας, διαλέγεις ποιος υπογράφει. -->
          <template v-if="form.signers.length">
            <q-select
              v-if="form.signers.length > 1"
              v-model="signerName"
              :options="form.signers.map((s) => ({ label: `${s.name} (${SIGNER_ROLE_LABEL[s.role]})`, value: s.name }))"
              label="Ποιος υπογράφει *"
              outlined
              dense
              emit-value
              map-options
            />
            <q-input v-else :model-value="signerName" :label="form.isMinor ? 'Γονέας/κηδεμόνας' : 'Ονοματεπώνυμο'" outlined dense readonly :hint="form.isMinor ? 'Όπως είναι δηλωμένο στο μητρώο του Σ.Ε.Ο.' : ''" />
          </template>
          <template v-else>
            <q-input v-model="signerName" label="Ονοματεπώνυμο υπογράφοντος *" outlined dense />
            <q-select v-model="signerRole" :options="roleOptions" label="Ιδιότητα *" outlined dense emit-value map-options />
          </template>
          <SignaturePad v-model="signature" />
          <q-checkbox v-model="consent" dense>
            <span class="text-body2">
              <template v-if="form.type === 'YGEIA'">
                Δηλώνω υπεύθυνα ότι γνωστοποίησα όλα τα προβλήματα υγείας, ότι τα παραπάνω στοιχεία είναι αληθή, και εξουσιοδοτώ τον/την Αρχηγό και
                τους υπεύθυνους Α΄ Βοηθειών να τα κοινοποιήσουν σε λειτουργούς υγείας σε περίπτωση ανάγκης.
              </template>
              <template v-else>Δηλώνω ότι τα στοιχεία είναι αληθή και ότι υπογράφω ως {{ effectiveRole ? SIGNER_ROLE_LABEL[effectiveRole].toLowerCase() : 'γονέας/κηδεμόνας' }}.</template>
              Η καταχώριση γίνεται με ημερομηνία και ώρα.
            </span>
          </q-checkbox>
          <div v-if="submitError" class="text-negative text-body2">{{ submitError }}</div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn color="klados" text-color="klados-on" unelevated label="Υποβολή" :loading="submitting" :disable="!canSubmit" @click="submit" />
        </q-card-actions>

        <q-card-section class="text-caption text-grey-6 q-pt-none">
          Ο σύνδεσμος ισχύει έως {{ formatDate(form.expiresAt) }} και παύει με την υποβολή. Τα στοιχεία υγείας διαγράφονται
          {{ HEALTH_DATA_RETENTION_DAYS }} ημέρες μετά τη δράση.
        </q-card-section>
      </template>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  HEALTH_DATA_RETENTION_DAYS,
  SIGNER_ROLE_LABEL,
  SignerRole,
  formFieldApplies,
  type DrasiFormField,
  type PublicFormView,
} from '@trifylli/shared';
import SignaturePad from '../components/SignaturePad.vue';
import { ApiError, get, post } from '../lib/api';
import { formatDate, formatDateRange } from '../lib/format';
import { useKladosThemeStore } from '../stores/klados-theme';

const kladosTheme = useKladosThemeStore();

const route = useRoute();
const token = String(route.params.token ?? '');

const loading = ref(true);
const error = ref<string | null>(null);
const form = ref<PublicFormView | null>(null);
const answers = reactive<Record<string, string | boolean | undefined>>({});
const textAnswer = (key: string): string => (typeof answers[key] === 'string' ? (answers[key] as string) : '');
const setAnswer = (key: string, v: string | number | null): void => {
  answers[key] = v === null || v === undefined ? '' : String(v);
};
const signerName = ref('');
const signerRole = ref<SignerRole | null>(null);
const signature = ref('');
const consent = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const done = ref(false);

// Η σελίδα ζει εκτός layout κλάδου· βάφεται μόλις μάθει ποιος διοργανώνει.
watch(
  () => (form.value ? form.value.drasi.klados : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

const title = computed(() => {
  if (!form.value) return '';
  if (form.value.type === 'SYMMETOXI') return 'Δήλωση Συμμετοχής';
  return form.value.isMinor ? 'Πιστοποιητικό Υγείας' : 'Πιστοποιητικό Υγείας Στελέχους';
});
/** Η διατύπωση του γονέα ή του ίδιου του ενήλικου. */
const labelOf = (f: DrasiFormField): string => (form.value && !form.value.isMinor && f.labelAdult ? f.labelAdult : f.label);
/** Τα «αναγράψτε αναλυτικά» κ.λπ. εμφανίζονται μόνο όταν ισχύει η συνθήκη τους. */
const visibleFields = computed(() => (form.value ? form.value.fields.filter((f) => formFieldApplies(f, answers, form.value!.isMinor)) : []));

const roleOptions = computed(() =>
  (Object.keys(SignerRole) as SignerRole[])
    .filter((r) => (form.value?.isMinor ? r !== 'IDIOS' : true))
    .map((r) => ({ label: SIGNER_ROLE_LABEL[r], value: r })),
);

/** Ο ρόλος που θα σταλεί: του επιλεγμένου υπογράφοντος, αλλιώς ό,τι διάλεξε ο χρήστης. */
const effectiveRole = computed<SignerRole | null>(() => form.value?.signers.find((s) => s.name === signerName.value)?.role ?? signerRole.value);

const canSubmit = computed(() => {
  if (!form.value || !consent.value || !signerName.value.trim() || !effectiveRole.value) return false;
  return visibleFields.value.every((f) => {
    if (!f.required) return true;
    const v = answers[f.key];
    return f.kind === 'yesno' ? typeof v === 'boolean' : typeof v === 'string' && v.trim().length > 0;
  });
});

onMounted(async () => {
  try {
    form.value = await get<PublicFormView>(`/forms/${token}`);
    signerRole.value = form.value.isMinor ? 'GONEAS' : 'IDIOS';
    // Ένας μόνο δυνατός υπογράφων ⇒ προσυμπληρωμένος και κλειδωμένος.
    if (form.value.signers.length === 1) signerName.value = form.value.signers[0]!.name;
    for (const [k, v] of Object.entries(form.value.prefill ?? {})) answers[k] = v;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Ο σύνδεσμος δεν είναι διαθέσιμος.';
  } finally {
    loading.value = false;
  }
});

async function submit(): Promise<void> {
  submitting.value = true;
  submitError.value = null;
  try {
    // Μόνο τα ορατά πεδία — ό,τι κρύφτηκε επειδή άλλαξε μια απάντηση δεν στέλνεται.
    const visible = new Set(visibleFields.value.map((f) => f.key));
    const payload = Object.fromEntries(Object.entries(answers).filter(([k]) => visible.has(k)));
    await post(`/forms/${token}`, {
      answers: payload,
      signerName: signerName.value.trim(),
      signerRole: effectiveRole.value,
      consent: consent.value,
      ...(signature.value ? { signatureDataUrl: signature.value } : {}),
    });
    done.value = true;
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Αποτυχία υποβολής — δοκιμάστε ξανά.';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.form-page {
  background: var(--app-bg, #f4f6f8);
  min-height: 100vh;
}
.form-card {
  width: 100%;
  max-width: 680px;
}
.field-row {
  padding: 4px 0;
}
.section-title {
  border-bottom: 1px solid var(--line-soft);
  padding-bottom: 4px;
}
</style>
