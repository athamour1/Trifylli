<template>
  <q-page padding>
    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <!-- ── Κεφαλίδα ── -->
        <div class="row items-start no-wrap q-mb-md">
          <q-btn flat round dense icon="arrow_back" color="klados" class="q-mr-sm q-mt-xs" @click="goBack">
            <q-tooltip>Πίσω στη λίστα</q-tooltip>
          </q-btn>
          <div class="col row items-start justify-between q-col-gutter-sm">
          <div class="col-12 col-sm">
            <q-input
              v-model="header.title"
              :readonly="!editable"
              borderless
              dense
              class="page-title"
              placeholder="Συγκέντρωση χωρίς τίτλο"
            />
            <div class="text-caption text-grey-7">
              {{ formatDate(data.date) }} · {{ KLADOS_LABEL[data.klados.type] }}
              <span v-if="data.drasi"> · {{ data.drasi.title }}</span>
            </div>
          </div>

          <div class="col-12 col-sm-auto row items-center q-gutter-sm">
            <CollabPresence :peers="peers" />
            <SaveStatus v-if="editable" :status="worstSaveState(saveStatus, collabSaveState)" @retry="saveNow" />
            <DocumentHistory :document="docName" :writable="planEditable" />
            <q-btn
              v-if="viewOnly && auth.can('syggentrwsh:write')"
              outline
              color="klados"
              icon="edit"
              label="Επεξεργασία"
              @click="startEditing"
            />
            <q-btn
              outline
              color="klados"
              icon="picture_as_pdf"
              label="PDF"
              :loading="pdfLoading"
              @click="exportPdf"
            >
              <q-tooltip>Εκτύπωση ή αποθήκευση ως PDF</q-tooltip>
            </q-btn>
          </div>
          </div>
        </div>

        <CollabBanner :status="collabStatus" :ready="collabReady" :editable="editable" target="στο πρόγραμμα" />
        <BirthdaysBanner :birthdays="data.birthdays ?? []" title="Γενέθλια αυτή την εβδομάδα" />

        <div class="row q-col-gutter-md">
          <!-- ── Πρόγραμμα ── -->
          <div class="col-12 col-md-8">
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="row items-center justify-between q-py-sm">
                <div class="text-subtitle1 text-weight-medium">Πρόγραμμα</div>
                <div class="row items-center q-gutter-xs">
                  <q-chip dense outline icon="timer" :label="formatDuration(totalDurationMin)" />
                  <q-chip v-if="endsAt" dense outline icon="schedule" :label="`λήξη ${endsAt}`" />
                </div>
              </q-card-section>
            </q-card>

            <q-card v-for="part in plan" :key="part.section" flat bordered class="q-mb-md">
              <q-card-section class="row items-center justify-between q-py-sm q-col-gutter-sm">
                <div class="col row items-baseline q-gutter-sm">
                  <span class="text-weight-medium text-klados">{{ part.label }}</span>
                  <span v-if="schedule.sectionStart.get(part.section)" class="text-caption text-grey-7">
                    {{ schedule.sectionStart.get(part.section) }}
                  </span>
                </div>

                <!-- Όταν το μέρος έχει κομμάτια, η διάρκεια είναι το άθροισμά
                     τους και δεν γράφεται· αλλιώς γράφεται εδώ. -->
                <div class="col-auto">
                  <q-input
                    v-if="!part.blocks.length"
                    :model-value="part.durationMin"
                    :readonly="!planEditable"
                    type="number"
                    min="0"
                    dense
                    outlined
                    suffix="λ"
                    style="width: 110px"
                    @update:model-value="(value) => setPartMinutes(part.section, value)"
                  />
                  <span v-else class="text-caption text-grey-7">
                    {{ formatDuration(partDuration(part)) }}
                  </span>
                </div>
              </q-card-section>
              <q-separator />

              <!-- Ελεύθερο κείμενο του μέρους -->
              <q-card-section class="q-py-sm">
                <CollabMarkdownField
                  v-if="collabReady"
                  :doc="collabDoc"
                  :text="sectionNotes(collabDoc, part.section)"
                  :document-name="docName"
                  :comment-key="`section:${part.section}`"
                  :awareness="awareness"
                  :klados="data.klados.type"
                  :readonly="!planEditable"
                  :label="`Σημειώσεις — ${part.label}`"
                  :placeholder="SECTION_PLACEHOLDER[part.section]"
                />
                <MarkdownField v-else :model-value="part.notes" readonly :klados="data.klados.type" />
              </q-card-section>

              <!-- Κομμάτια: μόνο στο Κύριο Μέρος. Στο Άνοιγμα και στο Κλείσιμο
                   εμφανίζονται μόνο αν υπάρχουν ήδη, ώστε παλιός σχεδιασμός να
                   μη σβήνεται σιωπηλά στην πρώτη αποθήκευση. -->
              <template v-if="hasBlocks(part)">
                <q-separator />
                <q-card-section class="q-py-sm">
                  <div
                    v-if="!part.blocks.length"
                    class="text-caption text-grey-6 q-py-sm"
                  >
                    {{ planEditable ? 'Κανένα κομμάτι ακόμη.' : 'Δεν έχει σχεδιαστεί.' }}
                  </div>

                  <div
                    v-for="(block, index) in part.blocks"
                    :key="block.key"
                    class="timeline-block q-mb-md"
                  >
                    <div class="row items-center q-col-gutter-sm">
                      <div class="col">
                        <q-input
                          :model-value="block.title"
                          :readonly="!planEditable"
                          dense
                          outlined
                          placeholder="Τίτλος κομματιού"
                          @update:model-value="(value) => updateBlock(collabDoc, block.id, { title: String(value ?? '') })"
                        >
                          <template v-if="schedule.blockStart.get(block.key)" #prepend>
                            <span class="text-caption text-grey-7">
                              {{ schedule.blockStart.get(block.key) }}
                            </span>
                          </template>
                        </q-input>
                      </div>
                      <div class="col-auto" style="width: 110px">
                        <q-input
                          :model-value="block.durationMin"
                          :readonly="!planEditable"
                          type="number"
                          min="1"
                          dense
                          outlined
                          suffix="λ"
                          @update:model-value="(value) => setBlockMinutes(block.id, value)"
                        />
                      </div>
                      <div v-if="planEditable" class="col-auto">
                        <q-btn
                          dense
                          flat
                          round
                          size="sm"
                          icon="keyboard_arrow_up"
                          :disable="index === 0"
                          @click="moveBlock(collabDoc, block.id, -1)"
                        />
                        <q-btn
                          dense
                          flat
                          round
                          size="sm"
                          icon="keyboard_arrow_down"
                          :disable="index === part.blocks.length - 1"
                          @click="moveBlock(collabDoc, block.id, 1)"
                        />
                        <q-btn
                          dense
                          flat
                          round
                          size="sm"
                          icon="close"
                          color="negative"
                          @click="removeBlock(collabDoc, block.id)"
                        />
                      </div>
                    </div>

                    <div class="q-mt-sm">
                      <CollabMarkdownField
                        v-if="collabReady"
                        :doc="collabDoc"
                        :text="blockDescription(collabDoc, block.id)"
                        :document-name="docName"
                        :comment-key="`block:${block.id}`"
                        :awareness="awareness"
                        :klados="data.klados.type"
                        :readonly="!planEditable"
                        label="Περιγραφή"
                        placeholder="Markdown: οδηγίες, κανόνες, εναλλακτική…"
                        empty-text="Χωρίς περιγραφή."
                        :min-height="72"
                      />
                      <MarkdownField v-else :model-value="block.description" readonly :klados="data.klados.type" empty-text="Χωρίς περιγραφή." />
                    </div>

                    <div class="q-mt-sm" style="max-width: 320px">
                      <q-select
                        :model-value="block.responsibleId"
                        :options="stelexiOptions"
                        :readonly="!planEditable"
                        label="Υπεύθυνος"
                        dense
                        outlined
                        emit-value
                        map-options
                        clearable
                        @update:model-value="(value) => updateBlock(collabDoc, block.id, { responsibleId: value ?? null })"
                      />
                    </div>

                    <!-- Υλικό δηλωμένο από την αποθήκη σε παλιότερο σχεδιασμό. -->
                    <div v-if="block.yliko.length" class="q-mt-xs">
                      <q-chip
                        v-for="use in block.yliko"
                        :key="use.id"
                        dense
                        size="sm"
                        color="secondary"
                        text-color="white"
                        icon="inventory_2"
                        :removable="planEditable"
                        @remove="removeBlockYliko(collabDoc, block.id, use.id)"
                      >
                        {{ use.name }} × {{ use.qty }}
                      </q-chip>
                    </div>
                  </div>

                  <q-btn
                    v-if="planEditable && part.section === TimelineSection.KYRIO_MEROS"
                    flat
                    dense
                    no-caps
                    color="klados"
                    icon="add"
                    label="Προσθήκη κομματιού"
                    @click="addBlock(collabDoc, part.section)"
                  />
                </q-card-section>
              </template>
            </q-card>
          </div>

          <!-- ── Πλαϊνή στήλη ── -->
          <div class="col-12 col-md-4">
            <!-- Στοιχεία -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="text-subtitle1 text-weight-medium q-py-sm">
                Στοιχεία
              </q-card-section>
              <q-separator />
              <q-card-section class="q-gutter-sm">
                <DateField v-model="header.date" label="Ημερομηνία" :editable="editable" />
                <TimeField
                  v-model="header.startTime"
                  label="Ώρα έναρξης"
                  :editable="editable"
                  hint="Με ώρα έναρξης, κάθε κομμάτι δείχνει πότε αρχίζει."
                />
                <q-input
                  v-model="header.location"
                  :readonly="!editable"
                  label="Τοποθεσία"
                  dense
                  outlined
                />
                <q-input
                  v-model="header.goal"
                  :readonly="!editable"
                  label="Κεντρική ιδέα"
                  type="textarea"
                  autogrow
                  dense
                  outlined
                />
              </q-card-section>
            </q-card>

            <!-- Όλο το υλικό της συγκέντρωσης σε μία λίστα -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="row items-center justify-between q-py-sm">
                <div class="text-subtitle1 text-weight-medium">Υλικό</div>
                <q-chip
                  v-if="allYliko.length"
                  dense
                  outline
                  :label="`${packedCount}/${allYliko.length}`"
                />
              </q-card-section>
              <q-separator />

              <q-card-section class="q-py-sm">
                <div v-if="!yliko.length && !allYliko.length" class="text-caption text-grey-6 q-pb-sm">
                  {{ planEditable ? 'Κενή λίστα.' : 'Δεν έχει δηλωθεί υλικό.' }}
                </div>

                <div
                  v-for="item in yliko"
                  :key="item.key"
                  class="row items-center q-col-gutter-xs q-mb-xs"
                >
                  <div class="col-auto">
                    <q-checkbox
                      :model-value="item.packed"
                      :disable="!planEditable"
                      dense
                      color="klados"
                      @update:model-value="(value) => updateYliko(collabDoc, item.id, { packed: value })"
                    />
                  </div>
                  <div class="col">
                    <q-input
                      :model-value="item.label"
                      :readonly="!planEditable"
                      dense
                      outlined
                      placeholder="π.χ. σπάγκος"
                      :data-yliko-id="item.id"
                      :class="item.packed ? 'text-grey-6' : ''"
                      @update:model-value="(value) => updateYliko(collabDoc, item.id, { label: String(value ?? '') })"
                      @keydown.enter.prevent="addYlikoRow(item.id)"
                    />
                  </div>
                  <div class="col-auto" style="width: 76px">
                    <q-input
                      :model-value="item.qty"
                      :readonly="!planEditable"
                      type="number"
                      min="1"
                      dense
                      outlined
                      @update:model-value="(value) => setYlikoQty(item.id, value)"
                    />
                  </div>
                  <div v-if="planEditable" class="col-auto">
                    <q-btn
                      dense
                      flat
                      round
                      size="sm"
                      icon="close"
                      color="negative"
                      @click="removeYliko(collabDoc, item.id)"
                    />
                  </div>
                </div>

                <q-btn
                  v-if="planEditable"
                  flat
                  dense
                  no-caps
                  color="klados"
                  icon="add"
                  label="Προσθήκη"
                  @click="addYlikoRow(yliko.at(-1)?.id ?? null)"
                />
              </q-card-section>

              <!-- Ό,τι προκύπτει από το πρόγραμμα ή την αποθήκη: μπαίνει στην ίδια
                   λίστα, αλλά δεν γράφεται εδώ — αλλάζει εκεί που δηλώθηκε. -->
              <template v-if="derivedYliko.length">
                <q-separator />
                <q-card-section class="q-py-sm">
                  <div class="text-caption text-grey-7 q-mb-xs">
                    Από το πρόγραμμα και την αποθήκη
                  </div>
                  <div
                    v-for="item in derivedYliko"
                    :key="item.label"
                    class="row items-center q-py-xs text-grey-8"
                  >
                    <q-icon name="inventory_2" size="16px" class="q-mr-sm" />
                    <div class="col">{{ item.label }}</div>
                    <div class="col-auto">× {{ item.qty }}</div>
                  </div>
                </q-card-section>
              </template>
            </q-card>

            <!-- Στελέχη που αναλαμβάνουν τη συγκέντρωση -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section class="row items-center justify-between q-py-sm">
                <div class="text-subtitle1 text-weight-medium">Στελέχη</div>
                <q-chip
                  v-if="stelexiCandidates.length"
                  dense
                  outline
                  :label="`${stelexosIds.length}/${stelexiCandidates.length}`"
                />
              </q-card-section>
              <q-separator />

              <q-card-section class="q-py-sm">
                <q-banner
                  v-if="stelexosIds.length < 2"
                  dense
                  class="bg-orange-1 text-orange-10 q-mb-sm"
                >
                  <template #avatar><q-icon name="warning" /></template>
                  Λιγότερα από δύο στελέχη.
                </q-banner>

                <div v-if="!stelexiCandidates.length" class="text-caption text-grey-6">
                  Δεν βρέθηκαν ενεργά στελέχη στον κλάδο.
                </div>

                <q-list v-else dense>
                  <q-item
                    v-for="stelexos in stelexiCandidates"
                    :key="stelexos.id"
                    v-ripple
                    tag="label"
                    :clickable="planEditable"
                  >
                    <q-item-section avatar>
                      <q-checkbox
                        :model-value="stelexosIds.includes(stelexos.id)"
                        :disable="!planEditable"
                        dense
                        color="klados"
                        @update:model-value="(value) => setStelexos(collabDoc, stelexos.id, value)"
                      />
                    </q-item-section>
                    <q-item-section>
                      {{ stelexos.lastName }} {{ stelexos.firstName }}
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

          </div>
        </div>
        <SyggentrwshPrint ref="printRef" :sheet="printSheet" />
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  KLADOS_META,
  TIMELINE_SECTION_LABEL,
  TIMELINE_SECTION_ORDER,
  TimelineSection,
  collabDocument,
  type BirthdayView,
  type CheckoutStatus,
  type KladosType,
  type PlanSnapshot,
} from '@trifylli/shared';
import CollabBanner from '../components/CollabBanner.vue';
import CollabPresence from '../components/CollabPresence.vue';
import DocumentHistory from '../components/collab/DocumentHistory.vue';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import DateField from '../components/DateField.vue';
import TimeField from '../components/TimeField.vue';
import SyggentrwshPrint from '../components/SyggentrwshPrint.vue';
import { useAsyncData } from '../composables/useAsyncData';
import BirthdaysBanner from '../components/BirthdaysBanner.vue';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import { useLiveReload } from '../composables/useLiveChanges';
import { useKladosThemeStore } from '../stores/klados-theme';
import { ApiError, OfflineError, get, patch } from '../lib/api';
import { formatDate, formatDateLong, formatDuration } from '../lib/format';
import type { PrintFact, PrintSheet } from '../lib/print-sheet';
import { printElement } from '../lib/print';
import { keepFocus } from '../lib/keep-focus';
import { worstSaveState, type SaveState } from '../lib/save-state';
import {
  DEFAULT_BLOCK_MINUTES,
  addBlock,
  addYlikoAfter,
  blockDescription,
  moveBlock,
  readPlan,
  removeBlock,
  removeBlockYliko,
  removeYliko,
  sectionNotes,
  setSectionDuration,
  setStelexos,
  typedNumber,
  updateBlock,
  updateYliko,
} from '../lib/syggentrwsh-plan';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';

const kladosTheme = useKladosThemeStore();

// CodeMirror φορτώνεται μόνο όταν ανοίξει σελίδα με κείμενα για γράψιμο.
const CollabMarkdownField = defineAsyncComponent(() => import('../components/CollabMarkdownField.vue'));

/**
 * Σχεδιασμός συγκέντρωσης.
 *
 * Μία οθόνη, χωρίς «λειτουργία επεξεργασίας»: το πρόγραμμα γράφεται επί τόπου
 * και αποθηκεύεται μόνο του. Ο σχεδιασμός γίνεται συνήθως σε συμβούλιο με το
 * κινητό στο χέρι, όπου ένα κουμπί «Αποθήκευση» που ξεχάστηκε σημαίνει χαμένη
 * δουλειά — και πολλές φορές τον γράφουν δύο-τρία στελέχη μαζί: το πρόγραμμα
 * είναι κοινό έγγραφο (`syggentrwsh:<id>`, βλ. lib/syggentrwsh-plan), ζωντανά,
 * με κέρσορες. Η κεφαλίδα (τίτλος, ημερομηνία, ώρα, τόπος, ιδέα) σώζεται όπως πριν.
 */

/** Προεπιλεγμένη διάρκεια νέου κομματιού — και εφεδρεία όταν το πεδίο μείνει κενό. */
const DEFAULT_DURATION_MIN = DEFAULT_BLOCK_MINUTES;

/** Πόσο περιμένουμε να σταματήσει η πληκτρολόγηση πριν στείλουμε. */
const AUTOSAVE_DELAY_MS = 1200;

const SECTION_PLACEHOLDER: Record<TimelineSection, string> = {
  ANOIGMA: 'Προσκλητήριο, έπαρση, τραγούδι…',
  KYRIO_MEROS: 'Στήσιμο, κανόνες παιχνιδιού, εναλλακτική σε κακοκαιρία…',
  KLEISIMO: 'Αξιολόγηση, ανακοινώσεις, υποστολή…',
};

interface BlockYlikoUse {
  id: string;
  name: string;
  qty: number;
}

/** Ένα κομμάτι όπως το δείχνει η σελίδα. */
interface PlanBlock {
  /** Το id του κομματιού στο κοινό έγγραφο — σταθερό, και κλειδί του `v-for`. */
  key: string;
  id: string;
  title: string;
  description: string;
  durationMin: number;
  responsibleId: string | null;
  yliko: BlockYlikoUse[];
}

interface PlanPart {
  section: TimelineSection;
  label: string;
  notes: string;
  /** Η γραμμένη διάρκεια του μέρους· μετράει μόνο όταν δεν υπάρχουν κομμάτια. */
  durationMin: number;
  blocks: PlanBlock[];
}

interface PlanYlikoItem {
  key: string;
  id: string;
  label: string;
  qty: number;
  packed: boolean;
}

interface Detail {
  id: string;
  title: string | null;
  date: string;
  /** Γενέθλια μελών του κλάδου 3 μέρες γύρω από τη συγκέντρωση. */
  birthdays?: BirthdayView[];
  startTime: string | null;
  location: string | null;
  goal: string | null;
  klados: { id: string; type: KladosType; name: string | null };
  drasi: { id: string; title: string } | null;
  totalDurationMin: number;
  sections: {
    section: TimelineSection;
    label: string;
    durationMin: number;
    /** Η αποθηκευμένη διάρκεια του μέρους, πριν υπερισχύσουν τα κομμάτια. */
    ownDurationMin: number;
    notes: string;
    blocks: {
      id: string;
      title: string;
      description: string | null;
      durationMin: number;
      responsible: { id: string; firstName: string; lastName: string } | null;
      yliko: { qty: number; yliko: { id: string; name: string } }[];
    }[];
  }[];
  ylikoItems: { id: string; label: string; qty: number; packed: boolean }[];
  stelexi: { userId: string; user: Stelexos }[];
  requiredYliko: { id: string; name: string; unit: string | null; qty: number }[];
  checkouts: { id: string; qty: number; status: CheckoutStatus; yliko: { id: string; name: string } }[];
}

interface Stelexos {
  id: string;
  firstName: string;
  lastName: string;
}

const route = useRoute();
const router = useRouter();

/** Πίσω στη λίστα συγκεντρώσεων του κλάδου. */
function goBack(): void {
  const k = data.value?.klados?.type;
  void router.push(k ? { name: 'klados-syggentrwseis', params: { klados: k } } : { name: 'dashboard' });
}
const $q = useQuasar();
const auth = useAuthStore();
const offline = useOfflineStore();
const id = String(route.params.id);

/**
 * Η σελίδα ανοίγει και μόνο για διάβασμα (`?view=1`).
 *
 * Έχει νόημα επειδή αποθηκεύει μόνη της: χωρίς τέτοια λειτουργία, το να ρίξεις
 * μια ματιά στο πρόγραμμα σημαίνει ότι ένα κατά λάθος πάτημα γράφεται αμέσως.
 */
const viewOnly = computed(() => route.query.view === '1');
const editable = computed(() => auth.can('syggentrwsh:write') && !viewOnly.value);

function startEditing(): void {
  const query = { ...route.query };
  delete query.view;
  void router.replace({ query });
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<Detail>(`/syggentrwseis/${id}`),
  { forbiddenPage: true, cacheKey: `syggentrwsh:${id}` },
);

// Η σελίδα ζει εκτός `/k/:klados`, οπότε το layout δεν ξέρει τον κλάδο της· τον
// δηλώνει μόνη της ώστε τα κουμπιά της να πάρουν το χρώμα του.
watch(
  () => (data.value ? data.value.klados.type : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

// ───────────────────────── Τοπική κατάσταση ─────────────────────────

const header = reactive({
  title: '',
  date: '',
  startTime: '',
  location: '',
  goal: '',
});

/** Ο κατάλογος στελεχών του κλάδου — έρχεται ξεχωριστά από τον σχεδιασμό. */
const fetchedStelexi = ref<Stelexos[]>([]);

// ───────────────────────── Το πρόγραμμα: κοινό έγγραφο ─────────────────────────

const docName = collabDocument.syggentrwsh(id);
const {
  doc: collabDoc,
  awareness,
  ready: collabReady,
  writable: collabWritable,
  status: collabStatus,
  peers,
  saveState: collabSaveState,
  onChange,
} = useCollabDoc(docName, useCollabMe());

/** Το πρόγραμμα όπως είναι τώρα στο έγγραφο — ξαναδιαβάζεται σε κάθε αλλαγή (δική μας ή άλλων). */
const docPlan = shallowRef<PlanSnapshot | null>(null);
let stopWatchingDoc: (() => void) | null = null;
watch(
  collabDoc,
  (doc) => {
    stopWatchingDoc?.();
    // Η ενημέρωση μπορεί να μετακινήσει το κομμάτι που γράφει ο χρήστης (το
    // μετακίνησε κάποιος άλλος): η εστίαση μένει εκεί που ήταν.
    const refresh = (): void => keepFocus(() => {
      docPlan.value = readPlan(doc);
    });
    doc.on('update', refresh);
    stopWatchingDoc = () => doc.off('update', refresh);
    refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => stopWatchingDoc?.());

/** Πριν ανοίξει το έγγραφο (ή χωρίς δίκτυο, σε συσκευή που δεν το έχει): ό,τι έφερε το `GET`, μόνο για ανάγνωση. */
const restPlan = computed<PlanSnapshot | null>(() => (data.value ? planFromDetail(data.value) : null));
const planSource = computed<PlanSnapshot | null>(() => (collabReady.value ? docPlan.value : restPlan.value));

// Ζωντανά: την κεφαλίδα τη γράφουν και άλλοι — χωρίς να πατηθεί ό,τι γράφει ο
// χρήστης και δεν έχει σωθεί (το πρόγραμμα είναι ήδη κοινό έγγραφο).
useLiveReload(['header'], reload, { subscribe: onChange, busy: () => dirty.value });

/** Το πρόγραμμα γράφεται όταν γράφεται η σελίδα **και** ο server το επιτρέπει. */
const planEditable = computed(() => editable.value && collabReady.value && collabWritable.value);

const plan = computed<PlanPart[]>(() => {
  const source = planSource.value;
  return TIMELINE_SECTION_ORDER.map((section) => ({
    section,
    label: TIMELINE_SECTION_LABEL[section],
    notes: source?.sections[section]?.notes ?? '',
    durationMin: source?.sections[section]?.durationMin ?? 0,
    blocks: (source?.blocks ?? [])
      .filter((block) => block.section === section)
      .map((block) => ({
        key: block.id,
        id: block.id,
        title: block.title,
        description: block.description,
        durationMin: block.durationMin,
        responsibleId: block.responsibleId,
        yliko: block.yliko,
      })),
  }));
});

const yliko = computed<PlanYlikoItem[]>(() =>
  (planSource.value?.yliko ?? []).map((item) => ({ key: item.id, id: item.id, label: item.label, qty: item.qty, packed: item.packed })),
);

const stelexosIds = computed<string[]>(() => planSource.value?.stelexi ?? []);

// Πεδία αριθμού: όσο είναι κενά δεν γράφεται τίποτα (βλ. `typedNumber`).
function setPartMinutes(section: TimelineSection, value: string | number | null): void {
  const minutes = typedNumber(value);
  if (minutes !== null) setSectionDuration(collabDoc.value, section, minutes);
}

function setBlockMinutes(blockId: string, value: string | number | null): void {
  const minutes = typedNumber(value);
  if (minutes !== null) updateBlock(collabDoc.value, blockId, { durationMin: minutes });
}

/** Νέα γραμμή υλικού: η εστίαση πάει στο όνομά της, για να συνεχιστεί η πληκτρολόγηση. */
function addYlikoRow(afterId: string | null): void {
  const id = addYlikoAfter(collabDoc.value, afterId);
  void nextTick(() => document.querySelector<HTMLInputElement>(`[data-yliko-id="${id}"]`)?.focus());
}

function setYlikoQty(itemId: string, value: string | number | null): void {
  const qty = typedNumber(value);
  if (qty !== null) updateYliko(collabDoc.value, itemId, { qty });
}

/**
 * Κατάσταση αποθήκευσης — δηλώνεται πριν από το `hydrate`, γιατί ο watcher που
 * γεμίζει τη φόρμα τρέχει μέσα στο setup και διαβάζει το `dirty`.
 */
const saveStatus = ref<SaveState>('clean');
const dirty = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Γεμίζει τη φόρμα από τον server.
 *
 * Το `hydrating` κρατά τον watcher του autosave κλειστό: χωρίς αυτό, η πρώτη
 * φόρτωση θα μοιάζει με αλλαγή του χρήστη και θα έστελνε αμέσως αποθήκευση.
 */
let hydrating = false;

/**
 * Ό,τι ξέρουμε ότι έχει ο server για την κεφαλίδα: η αποθήκευση στέλνει μόνο ό,τι
 * διαφέρει, ώστε δύο που γράφουν μαζί (π.χ. ο ένας την ώρα, ο άλλος τον τόπο) να
 * μη σβήνουν ο ένας τον άλλον.
 */
const baseline = { title: '', date: '', startTime: '', location: '', goal: '' };

function hydrate(value: Detail): void {
  hydrating = true;

  header.title = value.title ?? '';
  header.date = isoDay(new Date(value.date));
  header.startTime = value.startTime ? clockOf(new Date(value.startTime)) : '';
  header.location = value.location ?? '';
  header.goal = value.goal ?? '';
  Object.assign(baseline, header);

  // Μετά το τέλος του τρέχοντος tick: οι αλλαγές ειδοποιούν τον watcher
  // ασύγχρονα, οπότε ένα σύγχρονο `hydrating = false` θα άνοιγε πολύ νωρίς και
  // η ίδια η φόρτωση θα περνούσε για αλλαγή.
  void Promise.resolve().then(() => {
    hydrating = false;
  });
}

/** Το πρόγραμμα από το `GET` στην ίδια μορφή με το έγγραφο — για όσο αυτό δεν είναι διαθέσιμο. */
function planFromDetail(value: Detail): PlanSnapshot {
  const sections: PlanSnapshot['sections'] = {};
  for (const part of value.sections) sections[part.section] = { notes: part.notes, durationMin: part.ownDurationMin };
  return {
    sections,
    blocks: value.sections.flatMap((part) =>
      part.blocks.map((block, order) => ({
        id: block.id,
        section: part.section,
        order,
        title: block.title,
        durationMin: block.durationMin,
        responsibleId: block.responsible?.id ?? null,
        yliko: block.yliko.map((use) => ({ id: use.yliko.id, name: use.yliko.name, qty: use.qty })),
        description: block.description ?? '',
      })),
    ),
    yliko: value.ylikoItems.map((item, order) => ({ id: item.id, order, label: item.label, qty: item.qty, packed: item.packed })),
    stelexi: value.stelexi.map((entry) => entry.userId),
  };
}

// Γεμίζουμε μόνο όσο δεν υπάρχουν αλλαγές σε εκκρεμότητα, ώστε μια ανανέωση
// (π.χ. επιστροφή δικτύου) να μη σβήσει ό,τι μόλις γράφτηκε.
watch(
  data,
  (value) => {
    if (value && !dirty.value) hydrate(value);
  },
  { immediate: true },
);

// ───────────────────────── Παράγωγα ─────────────────────────

/** Τα κομμάτια υπερισχύουν· χωρίς αυτά μετράει η γραμμένη διάρκεια του μέρους. */
function partDuration(part: PlanPart): number {
  return part.blocks.length
    ? part.blocks.reduce((sum, block) => sum + clampDuration(block.durationMin), 0)
    : clampSectionDuration(part.durationMin);
}

/**
 * Πού δείχνονται κομμάτια: πάντα στο Κύριο Μέρος, και στα άλλα μέρη μόνο όσο
 * υπάρχουν από παλιότερο σχεδιασμό — αλλιώς η πρώτη αποθήκευση θα τα έσβηνε
 * χωρίς ο χρήστης να τα έχει δει ποτέ.
 */
function hasBlocks(part: PlanPart): boolean {
  return part.section === TimelineSection.KYRIO_MEROS || part.blocks.length > 0;
}

const totalDurationMin = computed(() =>
  plan.value.reduce((sum, part) => sum + partDuration(part), 0),
);

/** Πότε αρχίζει κάθε μέρος και κάθε κομμάτι, όταν υπάρχει ώρα έναρξης. */
const schedule = computed(() => {
  const sectionStart = new Map<TimelineSection, string>();
  const blockStart = new Map<string, string>();

  let minutes = minutesOf(header.startTime);
  if (minutes === null) return { sectionStart, blockStart };

  for (const part of plan.value) {
    sectionStart.set(part.section, formatClock(minutes));

    if (part.blocks.length) {
      for (const block of part.blocks) {
        blockStart.set(block.key, formatClock(minutes));
        minutes += clampDuration(block.durationMin);
      }
    } else {
      minutes += clampSectionDuration(part.durationMin);
    }
  }
  return { sectionStart, blockStart };
});

const endsAt = computed(() => {
  const start = minutesOf(header.startTime);
  return start === null ? null : formatClock(start + totalDurationMin.value);
});

const packedCount = computed(() => yliko.value.filter((item) => item.packed).length);

/**
 * Όλο το υλικό της συγκέντρωσης σε μία λίστα.
 *
 * Τρεις πηγές το γεννούν — η ελεύθερη λίστα, όσα δηλώνονται μέσα στα κομμάτια
 * και οι δεσμεύσεις της αποθήκης — αλλά όποιος ετοιμάζει το σακίδιο δεν θέλει
 * τρεις λίστες· θέλει μία.
 *
 * Διπλή αναφορά του ίδιου είδους **δεν** αθροίζεται: κρατάμε τη μεγαλύτερη
 * ποσότητα που ζητήθηκε. Τα κομμάτια εκτελούνται στη σειρά, οπότε δύο παιχνίδια
 * που θέλουν από 8 μαρκαδόρους θέλουν 8 συνολικά, όχι 16 — και μια γραμμή που
 * ο χρήστης έγραψε ήδη στην ελεύθερη λίστα δεν πρέπει να μετρηθεί δύο φορές.
 */
const allYliko = computed(() => {
  const totals = new Map<string, { label: string; qty: number; packed: boolean }>();

  const add = (label: string, qty: number, packed: boolean): void => {
    const name = label.trim();
    if (!name) return;
    const key = name.toLocaleLowerCase('el');
    const current = totals.get(key);
    totals.set(key, {
      label: current?.label ?? name,
      qty: Math.max(current?.qty ?? 0, qty),
      packed: (current?.packed ?? false) || packed,
    });
  };

  for (const item of yliko.value) add(item.label, clampQty(item.qty), item.packed);
  for (const part of plan.value) {
    for (const block of part.blocks) {
      for (const use of block.yliko) add(use.name, use.qty, false);
    }
  }
  for (const checkout of data.value?.checkouts ?? []) add(checkout.yliko.name, checkout.qty, false);

  return [...totals.values()];
});

/** Όσα δεν προέρχονται από την ελεύθερη λίστα — φαίνονται, αλλά δεν γράφονται. */
const derivedYliko = computed(() => {
  const written = new Set(
    yliko.value.map((item) => item.label.trim().toLocaleLowerCase('el')).filter(Boolean),
  );
  return allYliko.value.filter((item) => !written.has(item.label.toLocaleLowerCase('el')));
});

/**
 * Τα στελέχη που μπορούν να επιλεγούν.
 *
 * Ενώνει τον κατάλογο του κλάδου με όσους είναι ήδη επιλεγμένοι: ο κατάλογος
 * έρχεται από ξεχωριστό request που χωρίς δίκτυο δεν φτάνει, και χωρίς την
 * ένωση η λίστα θα έδειχνε άδεια ενώ η συγκέντρωση έχει στελέχη.
 */
const stelexiCandidates = computed<Stelexos[]>(() => {
  const byId = new Map<string, Stelexos>();
  for (const entry of data.value?.stelexi ?? []) byId.set(entry.user.id, entry.user);
  for (const stelexos of fetchedStelexi.value) byId.set(stelexos.id, stelexos);
  return [...byId.values()].sort((a, b) => a.lastName.localeCompare(b.lastName, 'el'));
});

const stelexiOptions = computed(() =>
  stelexiCandidates.value.map((stelexos) => ({
    label: `${stelexos.lastName} ${stelexos.firstName}`,
    value: stelexos.id,
  })),
);

// ───────────────────────── Εξαγωγή ─────────────────────────

function stelexosName(stelexosId: string | null): string | null {
  if (!stelexosId) return null;
  const found = stelexiCandidates.value.find((candidate) => candidate.id === stelexosId);
  return found ? `${found.lastName} ${found.firstName}` : null;
}

/** «13:00» + 20 λεπτά → «13:20». */
function clockPlus(clock: string | null, minutes: number): string | null {
  const base = clock === null ? null : minutesOf(clock);
  return base === null ? null : formatClock(base + minutes);
}

/**
 * Το φύλλο εκτύπωσης, φτιαγμένο από την τρέχουσα κατάσταση της οθόνης.
 *
 * Υπολογίζεται πάντα, όχι μόνο όταν πατηθεί το κουμπί: η εκτύπωση μπορεί να
 * ξεκινήσει και από τον browser (Ctrl+P), οπότε το φύλλο πρέπει να είναι ήδη
 * στο DOM όταν ανοίξει ο διάλογος.
 */
const printRef = ref<{ prepare: () => Promise<void> } | null>(null);
const pdfLoading = ref(false);

const printSheet = computed<PrintSheet>(() => {
  const klados = data.value?.klados.type ?? null;
  const duration = totalDurationMin.value;

  const facts: PrintFact[] = [];
  if (header.startTime && endsAt.value) {
    facts.push({ label: 'Ώρα', value: `${header.startTime} – ${endsAt.value}` });
  }
  if (duration > 0) facts.push({ label: 'Διάρκεια', value: formatDuration(duration) });
  if (header.location.trim()) facts.push({ label: 'Τόπος', value: header.location.trim() });
  if (data.value?.drasi) facts.push({ label: 'Δράση', value: data.value.drasi.title });

  const printedBy = auth.displayName ? ` από ${auth.displayName}` : '';

  return {
    topiko: auth.topiko?.name ?? '',
    klados: klados ? KLADOS_LABEL[klados] : '',
    accent: klados ? KLADOS_META[klados].color : '#546e7a',
    title: header.title.trim() || 'Συγκέντρωση',
    dateLabel: header.date ? formatDateLong(new Date(`${header.date}T12:00:00`)) : '',
    facts,
    goal: header.goal.trim(),
    stelexi: stelexosIds.value
      .map(stelexosName)
      .filter((name): name is string => name !== null),
    parts: plan.value.map((part) => {
      const start = schedule.value.sectionStart.get(part.section) ?? null;
      const end = clockPlus(start, partDuration(part));
      return {
        section: part.section,
        label: part.label,
        notes: part.notes,
        duration: partDuration(part) > 0 ? formatDuration(partDuration(part)) : '',
        range: start && end ? `${start} – ${end}` : '',
        blocks: part.blocks.map((block) => ({
          key: block.key,
          title: block.title,
          description: block.description,
          duration: formatDuration(clampDuration(block.durationMin)),
          start: schedule.value.blockStart.get(block.key) ?? null,
          responsible: stelexosName(block.responsibleId),
          yliko: block.yliko.length
            ? block.yliko.map((use) => `${use.name} × ${use.qty}`).join(', ')
            : null,
        })),
      };
    }),
    yliko: allYliko.value,
    footer: [auth.topiko?.name, `εκτυπώθηκε ${formatDate(new Date())}${printedBy}`]
      .filter(Boolean)
      .join(' · '),
  };
});

/**
 * Εκτύπωση ζητημένη από τη λίστα (`?print=1`).
 *
 * Το αίτημα καταναλώνεται μία φορά και το query φεύγει: αλλιώς μια ανανέωση της
 * σελίδας —ή ένα πίσω από τον browser— θα ξανάνοιγε τον διάλογο εκτύπωσης.
 */
watch(
  data,
  async (value) => {
    if (!value || route.query.print !== '1') return;
    const query = { ...route.query };
    delete query.print;
    await router.replace({ query });

    // Περιμένουμε το φύλλο να μπει στο DOM: ένα `print()` πριν από αυτό τυπώνει
    // κενή σελίδα, και ο χρήστης δεν έχει τρόπο να καταλάβει γιατί.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (document.querySelector('.print-sheet')) break;
      await nextTick();
    }
    await exportPdf();
  },
  { immediate: true },
);

/**
 * Εκτύπωση — και, από τον ίδιο διάλογο, «Αποθήκευση ως PDF».
 *
 * Όχι παραγωγή PDF μέσα στην εφαρμογή: μια βιβλιοθήκη PDF θα χρειαζόταν
 * ενσωματωμένη γραμματοσειρά με ελληνικά (εκατοντάδες KB στο bundle μιας PWA
 * που πρέπει να φορτώνει με κακό σήμα) και θα ξανάγραφε από την αρχή τη
 * στοίχιση που ο browser ξέρει ήδη να κάνει.
 */
async function exportPdf(): Promise<void> {
  pdfLoading.value = true;
  try {
    // Προφόρτωση εικόνων Markdown ως data URLs μέσα στο (κρυφό) φύλλο.
    await printRef.value?.prepare();
    const sheet = document.querySelector<HTMLElement>('.print-sheet');
    if (sheet) await printElement(sheet, pdfFileName());
    else window.print();
  } finally {
    pdfLoading.value = false;
  }
}

/** Όνομα αρχείου PDF: τίτλος συγκέντρωσης + ημερομηνία. */
function pdfFileName(): string {
  const title = (printSheet.value.title || 'Συγκέντρωση').trim();
  const date = data.value?.date ? formatDate(data.value.date).replace(/\//g, '-') : '';
  return date ? `${title} ${date}` : title;
}

// ───────────────────────── Αυτόματη αποθήκευση ─────────────────────────

// Μόνο η κεφαλίδα: το πρόγραμμα σώζεται μόνο του, ως κοινό έγγραφο.
watch(
  header,
  () => {
    if (hydrating || !editable.value) return;
    dirty.value = true;
    saveStatus.value = 'pending';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
  },
  { deep: true },
);

async function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty.value || !editable.value) return;

  saveStatus.value = 'saving';
  const sent = { ...header };
  // Η ώρα έναρξης κρέμεται από την ημέρα: όταν αλλάζει η ημέρα, ξαναστέλνεται κι αυτή.
  const timeChanged = sent.startTime !== baseline.startTime || (sent.date !== baseline.date && !!sent.startTime);
  const body = {
    ...(sent.title.trim() !== baseline.title.trim() ? { title: sent.title.trim() || null } : {}),
    ...(sent.date !== baseline.date ? { date: dayToIso(sent.date) } : {}),
    ...(timeChanged ? { startTime: sent.startTime ? combineDateTime(sent.date, sent.startTime) : null } : {}),
    ...(sent.location.trim() !== baseline.location.trim() ? { location: sent.location.trim() || null } : {}),
    ...(sent.goal.trim() !== baseline.goal.trim() ? { goal: sent.goal.trim() || null } : {}),
  };
  try {
    if (Object.keys(body).length) await patch(`/syggentrwseis/${id}`, body);
    Object.assign(baseline, sent);

    dirty.value = false;
    saveStatus.value = 'saved';
  } catch (err) {
    // Χωρίς δίκτυο δεν είναι σφάλμα: η σελίδα κρατά τις αλλαγές και ξαναστέλνει
    // μόλις επιστρέψει η σύνδεση. Γι' αυτό δεν μπαίνουν στην offline ουρά —
    // κάθε παύση πληκτρολόγησης θα πρόσθετε μια ακόμη εγγραφή της ίδιας οθόνης.
    if (err instanceof OfflineError) {
      saveStatus.value = 'offline';
      return;
    }
    saveStatus.value = 'error';
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.',
    });
  }
}

watch(
  () => offline.online,
  (online) => {
    if (online && dirty.value) void saveNow();
  },
);

// Φεύγοντας από τη σελίδα σώζουμε ό,τι δεν έχει προλάβει να φύγει.
onBeforeRouteLeave(() => {
  if (dirty.value) void saveNow();
});

/**
 * Κλείσιμο καρτέλας μέσα στο παράθυρο της καθυστέρησης.
 *
 * Το `beforeunload` δεν προλαβαίνει να περιμένει αίτημα, οπότε το μόνο που
 * μπορεί να κάνει είναι να ρωτήσει τον browser να σταματήσει τον χρήστη.
 */
function warnOnUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  event.preventDefault();
}

window.addEventListener('beforeunload', warnOnUnload);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  window.removeEventListener('beforeunload', warnOnUnload);
});

// ───────────────────────── Κατάλογος στελεχών ─────────────────────────

async function loadStelexi(): Promise<void> {
  try {
    const result = await get<{ candidates: Stelexos[] }>(`/syggentrwseis/${id}/stelexi`);
    fetchedStelexi.value = result.candidates;
  } catch {
    // Δευτερεύον: χωρίς δίκτυο μένουν ορατά όσα στελέχη είναι ήδη επιλεγμένα.
    fetchedStelexi.value = [];
  }
}

watch(
  data,
  (value) => {
    if (value && !fetchedStelexi.value.length) void loadStelexi();
  },
  { immediate: true },
);

// ───────────────────────── Βοηθητικά ─────────────────────────

function clampDuration(value: number): number {
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) && minutes >= 1 ? minutes : DEFAULT_DURATION_MIN;
}

/** Το μέρος μπορεί να μην έχει διάρκεια — μηδέν σημαίνει «δεν το μέτρησα». */
function clampSectionDuration(value: number): number {
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function clampQty(value: number): number {
  const qty = Math.round(Number(value));
  return Number.isFinite(qty) && qty >= 1 ? qty : 1;
}

/**
 * «YYYY-MM-DD» από **τοπική** ημερομηνία.
 *
 * Όχι `toISOString().slice(0, 10)`: εκείνο γυρίζει UTC και σε θετική ζώνη μια
 * βραδινή συγκέντρωση θα εμφανιζόταν την επόμενη μέρα.
 */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function clockOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Λεπτά από τα μεσάνυχτα, ή `null` όταν το πεδίο είναι κενό/άκυρο. */
function minutesOf(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Λεπτά → «HH:MM», με αναδίπλωση αν το πρόγραμμα περάσει τα μεσάνυχτα. */
function formatClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Η `date` κρατά την **ημέρα**· η ώρα της δεν σημαίνει τίποτα. Στέλνεται στο
 * μεσημέρι ώστε καμία μετατροπή ζώνης να μη τη μετακινήσει σε άλλη μέρα.
 */
function dayToIso(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

function combineDateTime(day: string, clock: string): string {
  return new Date(`${day}T${clock}:00`).toISOString();
}
</script>
