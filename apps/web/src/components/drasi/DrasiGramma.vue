<template>
  <div class="gramma">
    <div class="row items-start q-col-gutter-sm q-mb-md">
      <div class="col-12 col-sm">
        <div class="text-subtitle1 text-weight-medium">Γράμμα προς τους γονείς</div>
        <div class="text-caption text-grey-7">
          Ξεκινά από το πρότυπο με τα στοιχεία της δράσης — ημερομηνίες, τόπος, κόστος, ο Αρχηγός που υπογράφει.
          Ό,τι λείπει είναι «…».
          <template v-if="canWrite"> Το γράφετε μαζί και αποθηκεύεται μόνο του.</template>
        </div>
      </div>
      <div class="col-12 col-sm-auto row items-center q-gutter-sm">
        <SaveStatus v-if="canWrite" :status="saveState" />
        <q-btn
          unelevated no-caps color="klados" text-color="klados-on" icon="picture_as_pdf" label="Λήψη PDF"
          :loading="printing" :disable="loading && !fallback" @click="download"
        >
          <q-tooltip>Ανοίγει η εκτύπωση — «Αποθήκευση ως PDF» για αρχείο</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Χωρίς κάρτα γύρω: ο επεξεργαστής έχει ήδη το δικό του πλαίσιο. -->
    <div class="gramma-paper relative-position">
      <q-inner-loading :showing="loading && fallback === null" />
      <CollabTextField
        v-if="fallback !== null"
        ref="field"
        :name="collabDocument.drasiGramma(drasiId)"
        field="text"
        :fallback="fallback"
        :readonly="!canWrite"
        :klados="organiser"
        label="Το γράμμα"
        placeholder="Αγαπητοί γονείς, …"
        empty-text="Το γράμμα είναι κενό."
        :min-height="420"
        @state="saveState = $event"
      />
    </div>

    <!-- Το φύλλο ζει κρυφό στη σελίδα· κλωνοποιείται στο iframe εκτύπωσης. -->
    <div v-if="sheet" class="gonis-host" aria-hidden="true">
      <GonisPrint mode="gramma" :logo="sheet.logo" :html="sheet.html" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { collabDocument, type KladosType } from '@trifylli/shared';
import CollabTextField from '../CollabTextField.vue';
import SaveStatus from '../SaveStatus.vue';
import GonisPrint from './GonisPrint.vue';
import { ApiError, get } from '../../lib/api';
import { seoLogo } from '../../lib/gonis-print';
import { renderMarkdown } from '../../lib/markdown';
import { printElement } from '../../lib/print';
import type { SaveState } from '../../lib/save-state';

const props = defineProps<{ drasiId: string; title: string; organiser: KladosType | null; canWrite: boolean }>();
const $q = useQuasar();

/** Το κείμενο από το `GET` (ή το πρότυπο) — όσο το κοινό έγγραφο δεν έχει ανοίξει. */
const fallback = ref<string | null>(null);
const loading = ref(false);
const saveState = ref<SaveState>('clean');
const field = ref<InstanceType<typeof CollabTextField> | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    fallback.value = (await get<{ text: string }>(`/draseis/${props.drasiId}/gramma`)).text;
  } catch (err) {
    fallback.value = '';
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Το γράμμα δεν φόρτωσε.' });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── Λήψη ──
const printing = ref(false);
const sheet = ref<{ logo: string; html: string } | null>(null);

async function download(): Promise<void> {
  printing.value = true;
  try {
    const text = field.value?.text() ?? fallback.value ?? '';
    sheet.value = { logo: await seoLogo(), html: renderMarkdown(text) };
    await nextTick();
    const element = document.querySelector<HTMLElement>('.gonis-host .print-sheet');
    if (!element) throw new Error('Το φύλλο δεν ετοιμάστηκε.');
    await printElement(element, `${props.title} — Γράμμα προς τους γονείς`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : 'Αποτυχία εκτύπωσης.' });
  } finally {
    printing.value = false;
  }
}
</script>

<style scoped>
.gramma-paper {
  max-width: 820px;
  min-height: 120px;
}
.gonis-host {
  position: absolute;
  left: -10000px;
  top: 0;
  width: 800px;
}
</style>
