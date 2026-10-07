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
            <SaveStatus v-if="editable" :status="saveStatus" @retry="saveNow" />
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
                    v-model.number="part.durationMin"
                    :readonly="!editable"
                    type="number"
                    min="0"
                    dense
                    outlined
                    suffix="λ"
                    style="width: 110px"
                  />
                  <span v-else class="text-caption text-grey-7">
                    {{ formatDuration(partDuration(part)) }}
                  </span>
                </div>
              </q-card-section>
              <q-separator />

              <!-- Ελεύθερο κείμενο του μέρους -->
              <q-card-section class="q-py-sm">
                <MarkdownField
                  v-model="part.notes"
                  :klados="data.klados.type"
                  :readonly="!editable"
                  :label="`Σημειώσεις — ${part.label}`"
                  :placeholder="SECTION_PLACEHOLDER[part.section]"
                />
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
                    {{ editable ? 'Κανένα κομμάτι ακόμη.' : 'Δεν έχει σχεδιαστεί.' }}
                  </div>

                  <div
                    v-for="(block, index) in part.blocks"
                    :key="block.key"
                    class="timeline-block q-mb-md"
                  >
                    <div class="row items-center q-col-gutter-sm">
                      <div class="col">
                        <q-input
                          v-model="block.title"
                          :readonly="!editable"
                          dense
                          outlined
                          placeholder="Τίτλος κομματιού"
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
                          v-model.number="block.durationMin"
                          :readonly="!editable"
                          type="number"
                          min="1"
                          dense
                          outlined
                          suffix="λ"
                        />
                      </div>
                      <div v-if="editable" class="col-auto">
                        <q-btn
                          dense
                          flat
                          round
                          size="sm"
                          icon="keyboard_arrow_up"
                          :disable="index === 0"
                          @click="move(part, index, -1)"
                        />
                        <q-btn
                          dense
                          flat
                          round
                          size="sm"
                          icon="keyboard_arrow_down"
                          :disable="index === part.blocks.length - 1"
                          @click="move(part, index, 1)"
                        />
                        <q-btn
                          dense
                          flat
                          round
                          size="sm"
                          icon="close"
                          color="negative"
                          @click="part.blocks.splice(index, 1)"
                        />
                      </div>
                    </div>

                    <div class="q-mt-sm">
                      <MarkdownField
                        v-model="block.description"
                        :klados="data.klados.type"
                        :readonly="!editable"
                        label="Περιγραφή"
                        placeholder="Markdown: οδηγίες, κανόνες, εναλλακτική…"
                        empty-text="Χωρίς περιγραφή."
                        :min-height="72"
                      />
                    </div>

                    <div class="q-mt-sm" style="max-width: 320px">
                      <q-select
                        v-model="block.responsibleId"
                        :options="stelexiOptions"
                        :readonly="!editable"
                        label="Υπεύθυνος"
                        dense
                        outlined
                        emit-value
                        map-options
                        clearable
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
                        :removable="editable"
                        @remove="removeBlockYliko(block, use.id)"
                      >
                        {{ use.name }} × {{ use.qty }}
                      </q-chip>
                    </div>
                  </div>

                  <q-btn
                    v-if="editable && part.section === TimelineSection.KYRIO_MEROS"
                    flat
                    dense
                    no-caps
                    color="klados"
                    icon="add"
                    label="Προσθήκη κομματιού"
                    @click="addBlock(part)"
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
                <div v-if="!allYliko.length" class="text-caption text-grey-6 q-pb-sm">
                  {{ editable ? 'Κενή λίστα.' : 'Δεν έχει δηλωθεί υλικό.' }}
                </div>

                <div
                  v-for="(item, index) in yliko"
                  :key="item.key"
                  class="row items-center q-col-gutter-xs q-mb-xs"
                >
                  <div class="col-auto">
                    <q-checkbox v-model="item.packed" :disable="!editable" dense color="klados" />
                  </div>
                  <div class="col">
                    <q-input
                      v-model="item.label"
                      :readonly="!editable"
                      dense
                      outlined
                      placeholder="π.χ. σπάγκος"
                      :class="item.packed ? 'text-grey-6' : ''"
                      @keydown.enter.prevent="addYlikoAfter(index)"
                    />
                  </div>
                  <div class="col-auto" style="width: 76px">
                    <q-input
                      v-model.number="item.qty"
                      :readonly="!editable"
                      type="number"
                      min="1"
                      dense
                      outlined
                    />
                  </div>
                  <div v-if="editable" class="col-auto">
                    <q-btn
                      dense
                      flat
                      round
                      size="sm"
                      icon="close"
                      color="negative"
                      @click="yliko.splice(index, 1)"
                    />
                  </div>
                </div>

                <q-btn
                  v-if="editable"
                  flat
                  dense
                  no-caps
                  color="klados"
                  icon="add"
                  label="Προσθήκη"
                  @click="addYlikoAfter(yliko.length - 1)"
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
                    :clickable="editable"
                  >
                    <q-item-section avatar>
                      <q-checkbox
                        v-model="stelexosIds"
                        :val="stelexos.id"
                        :disable="!editable"
                        dense
                        color="klados"
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
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  KLADOS_META,
  TIMELINE_SECTION_LABEL,
  TIMELINE_SECTION_ORDER,
  TimelineSection,
  type CheckoutStatus,
  type KladosType,
} from '@trifylli/shared';
import MarkdownField from '../components/MarkdownField.vue';
import PageState from '../components/PageState.vue';
import SaveStatus from '../components/SaveStatus.vue';
import DateField from '../components/DateField.vue';
import TimeField from '../components/TimeField.vue';
import SyggentrwshPrint from '../components/SyggentrwshPrint.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { applyKladosTheme } from '../lib/klados-theme';
import { ApiError, OfflineError, get, patch, put } from '../lib/api';
import { formatDate, formatDateLong, formatDuration } from '../lib/format';
import type { PrintFact, PrintSheet } from '../lib/print-sheet';
import { printElement } from '../lib/print';
import type { SaveState } from '../lib/save-state';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';

/**
 * Σχεδιασμός συγκέντρωσης.
 *
 * Μία οθόνη, χωρίς «λειτουργία επεξεργασίας»: το πρόγραμμα γράφεται επί τόπου
 * και αποθηκεύεται μόνο του. Ο σχεδιασμός γίνεται συνήθως σε συμβούλιο με το
 * κινητό στο χέρι, όπου ένα κουμπί «Αποθήκευση» που ξεχάστηκε σημαίνει χαμένη
 * δουλειά.
 */

/** Προεπιλεγμένη διάρκεια νέου κομματιού — και εφεδρεία όταν το πεδίο μείνει κενό. */
const DEFAULT_DURATION_MIN = 10;

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

/** Τοπική μορφή κομματιού. */
interface PlanBlock {
  /**
   * Σταθερό κλειδί για το `v-for`. Δικό μας, όχι το id της βάσης: η αποθήκευση
   * ξαναγράφει τα κομμάτια, οπότε τα id αλλάζουν και το Vue θα ξανάφτιαχνε όλα
   * τα πεδία — χάνοντας τον δρομέα μέσα στο κείμενο που μόλις γραφόταν.
   */
  key: string;
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
  label: string;
  qty: number;
  packed: boolean;
}

interface Detail {
  id: string;
  title: string | null;
  date: string;
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
  { cacheKey: `syggentrwsh:${id}` },
);

// Η σελίδα ζει εκτός `/k/:klados`, οπότε το layout δεν ξέρει τον κλάδο της· τον
// δηλώνει μόνη της ώστε τα κουμπιά της να πάρουν το χρώμα του.
watch(
  () => data.value?.klados.type,
  (klados) => applyKladosTheme(klados ?? null),
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

const plan = ref<PlanPart[]>([]);
const yliko = ref<PlanYlikoItem[]>([]);
const stelexosIds = ref<string[]>([]);

/** Ο κατάλογος στελεχών του κλάδου — έρχεται ξεχωριστά από τον σχεδιασμό. */
const fetchedStelexi = ref<Stelexos[]>([]);

let keySeq = 0;
const nextKey = (): string => `k${(keySeq += 1)}`;

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

function hydrate(value: Detail): void {
  hydrating = true;

  header.title = value.title ?? '';
  header.date = isoDay(new Date(value.date));
  header.startTime = value.startTime ? clockOf(new Date(value.startTime)) : '';
  header.location = value.location ?? '';
  header.goal = value.goal ?? '';

  const bySection = new Map(value.sections.map((s) => [s.section, s]));
  plan.value = TIMELINE_SECTION_ORDER.map((section) => {
    const incoming = bySection.get(section);
    return {
      section,
      label: TIMELINE_SECTION_LABEL[section],
      notes: incoming?.notes ?? '',
      durationMin: incoming?.ownDurationMin ?? 0,
      blocks: (incoming?.blocks ?? []).map((block) => ({
        key: nextKey(),
        title: block.title,
        description: block.description ?? '',
        durationMin: block.durationMin,
        responsibleId: block.responsible?.id ?? null,
        yliko: block.yliko.map((use) => ({
          id: use.yliko.id,
          name: use.yliko.name,
          qty: use.qty,
        })),
      })),
    };
  });

  yliko.value = value.ylikoItems.map((item) => ({
    key: nextKey(),
    label: item.label,
    qty: item.qty,
    packed: item.packed,
  }));

  stelexosIds.value = value.stelexi.map((entry) => entry.userId);

  // Μετά το τέλος του τρέχοντος tick: οι αλλαγές των refs ειδοποιούν τον
  // watcher ασύγχρονα, οπότε ένα συγχρονο `hydrating = false` θα άνοιγε πολύ
  // νωρίς και η ίδια η φόρτωση θα περνούσε για αλλαγή.
  void Promise.resolve().then(() => {
    hydrating = false;
  });
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

// ───────────────────────── Επεξεργασία ─────────────────────────

function addBlock(part: PlanPart): void {
  part.blocks.push({
    key: nextKey(),
    title: '',
    description: '',
    durationMin: DEFAULT_DURATION_MIN,
    responsibleId: null,
    yliko: [],
  });
}

function move(part: PlanPart, index: number, step: number): void {
  const target = index + step;
  if (target < 0 || target >= part.blocks.length) return;
  const [block] = part.blocks.splice(index, 1);
  if (block) part.blocks.splice(target, 0, block);
}

function removeBlockYliko(block: PlanBlock, ylikoId: string): void {
  block.yliko = block.yliko.filter((use) => use.id !== ylikoId);
}

function addYlikoAfter(index: number): void {
  yliko.value.splice(index + 1, 0, {
    key: nextKey(),
    label: '',
    qty: 1,
    packed: false,
  });
}

// ───────────────────────── Αυτόματη αποθήκευση ─────────────────────────

watch(
  [header, plan, yliko, stelexosIds],
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
  try {
    // Η κεφαλίδα πρώτη: αν σκάσει η ημερομηνία, δεν θέλουμε να έχει γραφτεί
    // μισό πρόγραμμα κάτω από λάθος στοιχεία.
    await patch(`/syggentrwseis/${id}`, {
      title: header.title.trim() || null,
      date: dayToIso(header.date),
      startTime: header.startTime ? combineDateTime(header.date, header.startTime) : null,
      location: header.location.trim() || null,
      goal: header.goal.trim() || null,
    });

    await put(`/syggentrwseis/${id}/plan`, {
      blocks: plan.value.flatMap((part) =>
        part.blocks.map((block) => ({
          section: part.section,
          title: block.title,
          description: block.description || undefined,
          durationMin: clampDuration(block.durationMin),
          responsibleId: block.responsibleId ?? undefined,
          ylikoIds: block.yliko.length ? block.yliko.map((use) => use.id) : undefined,
        })),
      ),
      sections: plan.value.map((part) => ({
        section: part.section,
        notes: part.notes,
        durationMin: clampSectionDuration(part.durationMin),
      })),
      yliko: yliko.value.map((item) => ({
        label: item.label,
        qty: clampQty(item.qty),
        packed: item.packed,
      })),
      stelexosIds: stelexosIds.value,
    });

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
