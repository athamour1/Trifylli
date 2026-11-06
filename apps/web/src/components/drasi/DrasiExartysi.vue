<template>
  <div class="exartysi">
    <!-- ── Κεφαλίδα ── -->
    <div class="row items-start q-col-gutter-sm q-mb-sm">
      <div class="col-12 col-sm">
        <q-input
          v-if="editable"
          :model-value="view.title"
          borderless dense class="exartysi-title" placeholder="Τίτλος (π.χ. ΕΞΑΡΤΥΣΗ ΓΙΑ ΤΗΝ ΚΑΤΑΣΚΗΝΩΣΗ)"
          :maxlength="EXARTYSI_LIMITS.title"
          @update:model-value="(v) => setInfo(doc, 'title', String(v ?? ''))"
        />
        <div v-else class="exartysi-title q-py-xs">{{ view.title || 'Εξάρτυση' }}</div>
        <div class="text-caption text-grey-7">
          Τι παίρνει μαζί του κάθε παιδί.
          <template v-if="editable"> Το γράφετε μαζί και αποθηκεύεται μόνο του — Enter σε ένα είδος φτιάχνει το επόμενο.</template>
        </div>
      </div>
      <div class="col-12 col-sm-auto row items-center q-gutter-sm">
        <SaveStatus v-if="editable" :status="saveState" />
        <DocumentHistory :document="docName" :writable="editable" />
        <q-btn
          unelevated no-caps color="klados" text-color="klados-on" icon="picture_as_pdf" label="Λήψη PDF"
          :loading="printing" :disable="!view.sections.length" @click="download"
        >
          <q-tooltip>Ανοίγει η εκτύπωση — «Αποθήκευση ως PDF» για αρχείο</q-tooltip>
        </q-btn>
      </div>
    </div>

    <CollabBanner :status="status" :ready="ready" :editable="canWrite" target="στην εξάρτυση" />
    <q-inner-loading :showing="!ready && !fallback" />

    <!-- ── Οι ενότητες ── -->
    <div class="tf-card-grid q-mt-sm" style="--tf-min: 300px">
      <div v-for="(section, si) in view.sections" :key="section.id">
        <q-card flat bordered class="full-height column exartysi-section">
          <q-card-section class="row items-center no-wrap q-pb-none">
            <q-icon name="backpack" color="klados" size="20px" class="q-mr-sm" />
            <q-input
              v-if="editable"
              :ref="(el) => remember(`s:${section.id}`, el)"
              :model-value="section.title"
              borderless dense class="col exartysi-section__title" placeholder="Όνομα ενότητας"
              :maxlength="EXARTYSI_LIMITS.title"
              @update:model-value="(v) => updateSection(doc, section.id, { title: String(v ?? '') })"
            />
            <div v-else class="col exartysi-section__title">{{ section.title || 'Χωρίς όνομα' }}</div>
            <q-btn v-if="editable" flat round dense size="sm" icon="more_vert" aria-label="Ενέργειες ενότητας">
              <q-menu auto-close>
                <q-list dense style="min-width: 190px">
                  <q-item clickable :disable="si === 0" @click="moveSection(doc, section.id, -1)">
                    <q-item-section avatar><q-icon name="arrow_upward" /></q-item-section>
                    <q-item-section>Πιο πάνω</q-item-section>
                  </q-item>
                  <q-item clickable :disable="si === view.sections.length - 1" @click="moveSection(doc, section.id, 1)">
                    <q-item-section avatar><q-icon name="arrow_downward" /></q-item-section>
                    <q-item-section>Πιο κάτω</q-item-section>
                  </q-item>
                  <q-item clickable @click="newSection(section.id)">
                    <q-item-section avatar><q-icon name="add" /></q-item-section>
                    <q-item-section>Νέα ενότητα από κάτω</q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable class="text-negative" @click="confirmRemoveSection(section)">
                    <q-item-section avatar><q-icon name="delete" /></q-item-section>
                    <q-item-section>Διαγραφή ενότητας</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </q-card-section>

          <q-card-section class="col q-pt-xs">
            <!-- Τα είδη -->
            <div v-for="(item, ii) in section.items" :key="item.id" class="exartysi-item row items-center no-wrap">
              <span class="exartysi-item__dot" aria-hidden="true" />
              <q-input
                v-if="editable"
                :ref="(el) => remember(item.id, el)"
                :model-value="item.label"
                borderless dense class="col" placeholder="Είδος"
                :maxlength="EXARTYSI_LIMITS.label"
                @update:model-value="(v) => updateItem(doc, item.id, String(v ?? ''))"
                @keydown.enter.prevent="newItem(section.id, item.id)"
                @keydown.backspace="(e: KeyboardEvent) => backspace(e, section.items, ii)"
              />
              <div v-else class="col q-py-xs">{{ item.label }}</div>
              <template v-if="editable">
                <q-btn
                  flat round dense size="xs" icon="arrow_upward" class="exartysi-item__tool" :disable="ii === 0"
                  aria-label="Πιο πάνω" @click="moveItem(doc, item.id, -1)"
                />
                <q-btn
                  flat round dense size="xs" icon="arrow_downward" class="exartysi-item__tool" :disable="ii === section.items.length - 1"
                  aria-label="Πιο κάτω" @click="moveItem(doc, item.id, 1)"
                />
                <q-btn flat round dense size="xs" icon="close" class="exartysi-item__tool" aria-label="Αφαίρεση" @click="removeItem(doc, item.id)" />
              </template>
            </div>
            <div v-if="!section.items.length && !editable" class="text-caption text-grey-6">Χωρίς είδη.</div>
            <q-btn
              v-if="editable"
              flat dense no-caps size="sm" color="klados" icon="add" label="Είδος" class="q-mt-xs"
              @click="newItem(section.id, section.items.at(-1)?.id ?? null)"
            />

            <!-- Η σημείωση της ενότητας («όλα να είναι μαρκαρισμένα») -->
            <q-input
              v-if="editable"
              :model-value="section.note"
              borderless dense class="exartysi-note q-mt-xs" placeholder="Σημείωση (προαιρετική)"
              :maxlength="EXARTYSI_LIMITS.note"
              @update:model-value="(v) => updateSection(doc, section.id, { note: String(v ?? '') })"
            >
              <template #prepend><q-icon name="sticky_note_2" size="16px" /></template>
            </q-input>
            <div v-else-if="section.note" class="exartysi-note q-mt-sm">{{ section.note }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div v-if="!view.sections.length && (ready || fallback)" class="column items-center q-pa-lg text-grey-7">
      <q-icon name="backpack" size="40px" color="klados" />
      <div class="q-mt-sm">Καμία ενότητα ακόμα.</div>
    </div>

    <div v-if="editable" class="q-mt-md">
      <q-btn unelevated no-caps color="klados" text-color="klados-on" icon="add" label="Νέα ενότητα" @click="newSection(null)" />
    </div>

    <!-- ── Σημείωση στο τέλος ── -->
    <div class="q-mt-lg exartysi-footer">
      <q-input
        v-if="editable"
        :model-value="view.footer"
        outlined dense autogrow color="klados" label="Σημείωση στο τέλος"
        placeholder="π.χ. Να έχετε μαζί σας μεσημεριανό για την 1η μέρα."
        :maxlength="EXARTYSI_LIMITS.footer"
        @update:model-value="(v) => setInfo(doc, 'footer', String(v ?? ''))"
      />
      <div v-else-if="view.footer" class="text-body2 text-weight-medium">{{ view.footer }}</div>
    </div>

    <!-- Το φύλλο ζει κρυφό στη σελίδα· κλωνοποιείται στο iframe εκτύπωσης. -->
    <div v-if="sheet" class="gonis-host" aria-hidden="true">
      <GonisPrint mode="exartysi" :logo="sheet.logo" :exartysi="sheet.view" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import { EXARTYSI_LIMITS, collabDocument, type DrasiExartysiView, type ExartysiItem, type ExartysiSection } from '@trifylli/shared';
import type { Doc } from 'yjs';
import CollabBanner from '../CollabBanner.vue';
import SaveStatus from '../SaveStatus.vue';
import DocumentHistory from '../collab/DocumentHistory.vue';
import GonisPrint from './GonisPrint.vue';
import { useCollabDoc, useCollabMe } from '../../composables/useCollabDoc';
import { ApiError, get } from '../../lib/api';
import {
  addItem,
  addSection,
  exartysiSeeded,
  moveItem,
  moveSection,
  readExartysi,
  removeItem,
  removeSection,
  setInfo,
  updateItem,
  updateSection,
} from '../../lib/exartysi-doc';
import { seoLogo } from '../../lib/gonis-print';
import { keepFocus } from '../../lib/keep-focus';
import { printElement } from '../../lib/print';

const props = defineProps<{ drasiId: string; title: string; canWrite: boolean }>();
const $q = useQuasar();

// ── Το κοινό έγγραφο ──
const docName = collabDocument.drasiExartysi(props.drasiId);
const { doc, ready, writable, status, saveState } = useCollabDoc(docName, useCollabMe());

/** Η εξάρτυση όπως είναι τώρα στο έγγραφο — ξαναδιαβάζεται σε κάθε αλλαγή, δική μας ή άλλων. */
const live = shallowRef<DrasiExartysiView | null>(null);
let stopWatching: (() => void) | null = null;
watch(
  doc,
  (current: Doc) => {
    stopWatching?.();
    const refresh = (): void => keepFocus(() => (live.value = exartysiSeeded(current) ? readExartysi(current) : null));
    current.on('update', refresh);
    stopWatching = () => current.off('update', refresh);
    refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => stopWatching?.());

/** Από το `GET` — φαίνεται όσο το έγγραφο δεν έχει ανοίξει σε αυτή τη συσκευή. */
const fallback = ref<DrasiExartysiView | null>(null);
onMounted(async () => {
  try {
    fallback.value = await get<DrasiExartysiView>(`/draseis/${props.drasiId}/exartysi`);
  } catch (err) {
    if (!live.value) $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Η εξάρτυση δεν φόρτωσε.' });
  }
});

const EMPTY: DrasiExartysiView = { title: '', footer: '', sections: [] };
const view = computed<DrasiExartysiView>(() => (ready.value && live.value ? live.value : (fallback.value ?? live.value ?? EMPTY)));
/** Γράφει όταν το επιτρέπει ο ρόλος **και** ο server, και το έγγραφο έχει έρθει γεμάτο. */
const editable = computed(() => props.canWrite && ready.value && writable.value && !!live.value);

// ── Εστίαση: Enter → νέο είδος από κάτω, Backspace σε κενό → σβήνει, νέα ενότητα → το όνομά της ──
const inputs = new Map<string, { focus: () => void }>();
function remember(id: string, el: unknown): void {
  if (el && typeof (el as { focus?: unknown }).focus === 'function') inputs.set(id, el as { focus: () => void });
  else inputs.delete(id);
}
async function focusItem(id: string): Promise<void> {
  await nextTick();
  inputs.get(id)?.focus();
}

function newItem(sectionId: string, afterId: string | null): void {
  void focusItem(addItem(doc.value, sectionId, afterId));
}

function backspace(event: KeyboardEvent, items: ExartysiItem[], index: number): void {
  const item = items[index];
  if (!item || item.label !== '') return;
  event.preventDefault();
  const previous = items[index - 1];
  removeItem(doc.value, item.id);
  if (previous) void focusItem(previous.id);
}

function newSection(afterId: string | null): void {
  void focusItem(`s:${addSection(doc.value, afterId)}`);
}

function confirmRemoveSection(section: ExartysiSection): void {
  const name = section.title.trim() || 'χωρίς όνομα';
  if (!section.items.length) {
    removeSection(doc.value, section.id);
    return;
  }
  $q.dialog({
    title: 'Διαγραφή ενότητας',
    message: `Η ενότητα «${name}» φεύγει μαζί με ${section.items.length === 1 ? 'το είδος της' : `τα ${section.items.length} είδη της`}. Επιστρέφει από το Ιστορικό.`,
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { color: 'negative', label: 'Διαγραφή', unelevated: true },
  }).onOk(() => removeSection(doc.value, section.id));
}

// ── Λήψη ──
const printing = ref(false);
const sheet = ref<{ logo: string; view: DrasiExartysiView } | null>(null);

async function download(): Promise<void> {
  printing.value = true;
  try {
    // Χωρίς κενές γραμμές στο χαρτί.
    const current = view.value;
    const clean: DrasiExartysiView = {
      ...current,
      sections: current.sections
        .map((section) => ({ ...section, items: section.items.filter((item) => item.label.trim()) }))
        .filter((section) => section.title.trim() || section.items.length),
    };
    sheet.value = { logo: await seoLogo(), view: clean };
    await nextTick();
    const element = document.querySelector<HTMLElement>('.gonis-host .print-sheet');
    if (!element) throw new Error('Το φύλλο δεν ετοιμάστηκε.');
    await printElement(element, `${props.title} — Εξάρτυση`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : 'Αποτυχία εκτύπωσης.' });
  } finally {
    printing.value = false;
  }
}
</script>

<style scoped>
.exartysi-title,
.exartysi-title :deep(input) {
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.exartysi-section__title,
.exartysi-section__title :deep(input) {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.exartysi-item {
  gap: 2px;
  min-height: 32px;
}
.exartysi-item__dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 10px 0 4px;
  border-radius: 50%;
  background: var(--klados-ink, currentColor);
  opacity: 0.6;
}
/* Τα εργαλεία της γραμμής: διακριτικά, εμφανή στο hover ή όταν γράφεις σε αυτήν. */
.exartysi-item__tool {
  opacity: 0.35;
  transition: opacity var(--dur-short, 120ms) var(--ease-standard, ease);
}
.exartysi-item:hover .exartysi-item__tool,
.exartysi-item:focus-within .exartysi-item__tool {
  opacity: 1;
}
@media (hover: none) {
  .exartysi-item__tool {
    opacity: 0.7;
  }
}
.exartysi-note,
.exartysi-note :deep(input) {
  font-style: italic;
  font-size: 0.85rem;
}
.exartysi-footer {
  max-width: 640px;
}
.gonis-host {
  position: absolute;
  left: -10000px;
  top: 0;
  width: 800px;
}
</style>
