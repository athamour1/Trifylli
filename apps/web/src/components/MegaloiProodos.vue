<template>
  <div>
    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!members.length"
      empty-text="Δεν υπάρχουν Μεγάλοι Οδηγοί σε αυτόν τον κλάδο."
      empty-icon="trending_up"
      @retry="reload"
    >
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="m in members" :key="m.memberId" clickable v-ripple @click="openCard(m.memberId)">
          <q-item-section>
            <q-item-label>{{ m.lastName }} {{ m.firstName }}</q-item-label>
            <q-item-label caption>
              {{ m.subUnit ?? '—' }}
              <span v-if="!m.summary.hasYposchesi" class="text-orange-8"> · χωρίς Υπόσχεση</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center q-gutter-xs">
              <q-chip dense square color="grey-2" text-color="grey-9" icon="explore" :label="m.summary.prosanatolismoi">
                <q-tooltip>Προσανατολισμοί</q-tooltip>
              </q-chip>
              <q-chip
                dense
                :color="pyxidaColor(m.summary.pyxida)"
                :text-color="m.summary.pyxida > 0 ? 'white' : 'grey-7'"
                icon="explore"
                :label="m.summary.pyxida > 0 ? PYXIDES_LABELS[m.summary.pyxida - 1] : '—'"
              >
                <q-tooltip>Πυξίδα</q-tooltip>
              </q-chip>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>

    <!-- ── Καρτέλα μέλους ── -->
    <q-dialog v-model="cardOpen" @hide="card = null">
      <q-card style="min-width: min(600px, 95vw)">
        <q-card-section v-if="card && cardSummary" class="row items-center no-wrap">
          <div class="col">
            <div class="text-h6">{{ card.member.lastName }} {{ card.member.firstName }}</div>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-chip
                v-for="(label, i) in PYXIDES_LABELS"
                :key="label"
                dense
                :color="i < cardSummary.pyxida ? pyxidaColor(i + 1) : 'grey-3'"
                :text-color="i < cardSummary.pyxida ? 'white' : 'grey-7'"
                icon="explore"
                :label="label"
              />
            </div>
            <div v-if="nextHint" class="text-caption text-grey-7 q-mt-xs">{{ nextHint }}</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section v-if="card" class="q-gutter-md scroll" style="max-height: 72vh">
          <!-- Υπόσχεση -->
          <div>
            <div class="section-title q-mb-xs">Υπόσχεση</div>
            <q-item v-if="yposchesi" dense class="q-px-none">
              <q-item-section avatar><q-icon name="verified" color="klados" /></q-item-section>
              <q-item-section>
                <q-item-label>Δόθηκε</q-item-label>
                <q-item-label caption>{{ yposchesi.passedAt ? formatDate(yposchesi.passedAt) : '—' }}</q-item-label>
              </q-item-section>
              <q-item-section side v-if="canWrite">
                <q-btn flat dense round icon="delete" color="negative" @click="removeEntry(yposchesi)" />
              </q-item-section>
            </q-item>
            <q-btn
              v-else-if="canWrite"
              flat dense no-caps color="klados" icon="add"
              label="Καταχώρηση Υπόσχεσης"
              @click="openForm('YPOSCHESI')"
            />
            <div v-else class="text-caption text-grey-6">Δεν έχει δοθεί.</div>
          </div>

          <!-- Προσανατολισμοί -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Προσανατολισμοί</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" label="Προσανατολισμός" @click="openForm('PROSANATOLISMOS')" />
            </div>
            <div v-for="enotita in MO_ENOTITES" :key="enotita" class="q-mb-sm">
              <div class="text-caption text-weight-medium text-grey-8">{{ enotita }}</div>
              <q-list v-if="byEnotita(enotita).length" dense>
                <q-item v-for="e in byEnotita(enotita)" :key="e.id" class="q-px-none">
                  <q-item-section avatar><q-icon name="explore" color="secondary" size="20px" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ e.title }}</q-item-label>
                    <q-item-label caption>{{ e.passedAt ? formatDate(e.passedAt) : '—' }}</q-item-label>
                  </q-item-section>
                  <q-item-section side v-if="canWrite">
                    <q-btn flat dense round icon="delete" color="negative" size="sm" @click="removeEntry(e)" />
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-caption text-grey-5 q-pl-sm">—</div>
            </div>
          </div>

          <!-- Ειδικεύσεις / Υπευθυνότητες / Επιτροπές -->
          <div v-for="group in otherGroups" :key="group.kind">
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">{{ group.label }}</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" :label="group.add" @click="openForm(group.kind)" />
            </div>
            <q-list v-if="byKind(group.kind).length" dense>
              <q-item v-for="e in byKind(group.kind)" :key="e.id" class="q-px-none">
                <q-item-section avatar><q-icon :name="group.icon" :color="group.color" size="20px" /></q-item-section>
                <q-item-section>
                  <q-item-label>
                    {{ e.title }}
                    <q-badge v-if="e.category === EPITROPI_EIDIKI" color="accent" class="q-ml-xs" label="Εξωτ./Ειδικό" />
                  </q-item-label>
                  <q-item-label caption>{{ e.passedAt ? formatDate(e.passedAt) : '—' }}</q-item-label>
                </q-item-section>
                <q-item-section side v-if="canWrite">
                  <q-btn flat dense round icon="delete" color="negative" size="sm" @click="removeEntry(e)" />
                </q-item-section>
              </q-item>
            </q-list>
            <div v-else class="text-caption text-grey-5">Κανένα ακόμη.</div>
          </div>
        </q-card-section>

        <q-inner-loading :showing="cardLoading" />
      </q-card>
    </q-dialog>

    <!-- ── Φόρμα προσθήκης ── -->
    <q-dialog v-model="formOpen">
      <q-card style="min-width: min(440px, 92vw)">
        <q-card-section class="text-subtitle1 text-weight-medium">{{ formTitle }}</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-if="form.kind === 'PROSANATOLISMOS'"
            v-model="form.category"
            :options="[...MO_ENOTITES]"
            label="Ενότητα *"
            outlined
            dense
          />
          <q-input
            v-if="form.kind !== 'YPOSCHESI'"
            v-model="form.title"
            :label="`Όνομα ${MO_ENTRY_KIND_LABEL[form.kind] ?? ''} *`"
            outlined
            dense
          />
          <q-toggle
            v-if="form.kind === 'EPITROPI'"
            v-model="form.eidiki"
            label="Εξωτερικής Δράσης ή Συνεργασία με Ειδικό"
          />
          <q-input v-model="form.passedAt" label="Ημερομηνία" outlined dense type="date" />
        </q-card-section>
        <q-card-section v-if="formError" class="bg-red-1 text-negative">{{ formError }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" label="Προσθήκη" :loading="saving" @click="submitForm" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  ASIMENIA_REQ,
  CHRYSI_REQ,
  EPITROPI_EIDIKI,
  MO_ENOTITES,
  MO_ENTRY_KIND_LABEL,
  PYXIDES_LABELS,
  type KladosType,
} from '@trifylli/shared';
import PageState from './PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, del, get, post } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ klados: KladosType }>();

interface EntryLite {
  kind: string;
  category: string | null;
}
interface Entry extends EntryLite {
  id: string;
  title: string;
  passedAt: string | null;
  note: string | null;
}
interface MemberRow {
  memberId: string;
  firstName: string;
  lastName: string;
  subUnit: string | null;
  entries: EntryLite[];
}
interface Card {
  member: { id: string; firstName: string; lastName: string };
  entries: Entry[];
}

const $q = useQuasar();
const auth = useAuthStore();
const canWrite = computed(() => auth.can('proodos:write', props.klados));

const otherGroups = [
  { kind: 'EIDIKEFSI', label: 'Ειδικεύσεις', add: 'Ειδίκευση', icon: 'workspace_premium', color: 'secondary' },
  { kind: 'YPEFTHYNOTITA', label: 'Υπευθυνότητες', add: 'Υπευθυνότητα', icon: 'assignment_ind', color: 'primary' },
  { kind: 'EPITROPI', label: 'Επιτροπές', add: 'Επιτροπή', icon: 'groups', color: 'teal' },
] as const;

/** Σύνοψη πυξίδων από τις εγγραφές. */
function summarize(entries: EntryLite[]) {
  const c = (k: string) => entries.filter((e) => e.kind === k).length;
  const prosanatolismoi = c('PROSANATOLISMOS');
  const enotitesCovered = new Set(
    entries.filter((e) => e.kind === 'PROSANATOLISMOS' && e.category).map((e) => e.category),
  ).size;
  const ypefthynotites = c('YPEFTHYNOTITA');
  const epitropes = c('EPITROPI');
  const epitropiEidiki = entries.filter((e) => e.kind === 'EPITROPI' && e.category === EPITROPI_EIDIKI).length;
  const eidikefseis = c('EIDIKEFSI');

  const asimenia =
    enotitesCovered >= ASIMENIA_REQ.enotites &&
    ypefthynotites >= ASIMENIA_REQ.ypefthynotites &&
    epitropes >= ASIMENIA_REQ.epitropes;
  // Χρυσή: μετά την Ασημένια, 3 Προσανατολισμοί παραπάνω + 1 ειδική Επιτροπή + 1 Ειδίκευση.
  const extraProsan = Math.max(0, prosanatolismoi - ASIMENIA_REQ.enotites);
  const chrysi =
    asimenia &&
    extraProsan >= CHRYSI_REQ.prosanatolismoi &&
    epitropiEidiki >= CHRYSI_REQ.epitropiEidiki &&
    eidikefseis >= CHRYSI_REQ.eidikefseis;

  return {
    hasYposchesi: entries.some((e) => e.kind === 'YPOSCHESI'),
    prosanatolismoi,
    enotitesCovered,
    ypefthynotites,
    epitropes,
    epitropiEidiki,
    eidikefseis,
    extraProsan,
    pyxida: chrysi ? 2 : asimenia ? 1 : 0,
  };
}

function pyxidaColor(level: number): string {
  return level >= 2 ? 'amber-8' : level === 1 ? 'blue-grey-5' : 'grey-3';
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<MemberRow[]>('/proodos/card/MEGALOI_ODIGOI/members'),
  { cacheKey: 'proodos-megaloi' },
);
const members = computed(() => (data.value ?? []).map((m) => ({ ...m, summary: summarize(m.entries) })));

// ── Καρτέλα ──
const cardOpen = ref(false);
const cardLoading = ref(false);
const card = ref<Card | null>(null);
const cardSummary = computed(() => (card.value ? summarize(card.value.entries) : null));

async function openCard(memberId: string): Promise<void> {
  cardOpen.value = true;
  cardLoading.value = true;
  try {
    card.value = await get<Card>(`/proodos/card/member/${memberId}`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης.' });
    cardOpen.value = false;
  } finally {
    cardLoading.value = false;
  }
}

const yposchesi = computed(() => card.value?.entries.find((e) => e.kind === 'YPOSCHESI') ?? null);
function byEnotita(enotita: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === 'PROSANATOLISMOS' && e.category === enotita) ?? [];
}
function byKind(kind: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === kind) ?? [];
}

const nextHint = computed(() => {
  const s = cardSummary.value;
  if (!s) return '';
  const need = (total: number, have: number) => Math.max(0, total - have);
  if (s.pyxida === 0) {
    const parts = [
      need(ASIMENIA_REQ.enotites, s.enotitesCovered) && `${need(ASIMENIA_REQ.enotites, s.enotitesCovered)} ενότητες`,
      need(ASIMENIA_REQ.ypefthynotites, s.ypefthynotites) && `${need(ASIMENIA_REQ.ypefthynotites, s.ypefthynotites)} Υπευθυνότητα`,
      need(ASIMENIA_REQ.epitropes, s.epitropes) && `${need(ASIMENIA_REQ.epitropes, s.epitropes)} Επιτροπές`,
    ].filter(Boolean);
    return parts.length ? `Για την Ασημένια: ${parts.join(', ')} ακόμη` : 'Έτοιμος για την Ασημένια!';
  }
  if (s.pyxida === 1) {
    const parts = [
      need(CHRYSI_REQ.prosanatolismoi, s.extraProsan) && `${need(CHRYSI_REQ.prosanatolismoi, s.extraProsan)} Προσανατολισμοί`,
      need(CHRYSI_REQ.epitropiEidiki, s.epitropiEidiki) && `${need(CHRYSI_REQ.epitropiEidiki, s.epitropiEidiki)} ειδική Επιτροπή`,
      need(CHRYSI_REQ.eidikefseis, s.eidikefseis) && `${need(CHRYSI_REQ.eidikefseis, s.eidikefseis)} Ειδίκευση`,
    ].filter(Boolean);
    return parts.length ? `Για τη Χρυσή: ${parts.join(', ')} ακόμη` : 'Έτοιμος για τη Χρυσή!';
  }
  return 'Κατέκτησε Ασημένια και Χρυσή Πυξίδα!';
});

// ── Φόρμα ──
const formOpen = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const form = reactive<{ kind: string; category: string | null; title: string; passedAt: string; eidiki: boolean }>({
  kind: '',
  category: null,
  title: '',
  passedAt: '',
  eidiki: false,
});
const formTitle = computed(() =>
  form.kind === 'YPOSCHESI' ? 'Νέα: Υπόσχεση' : `Νέο: ${MO_ENTRY_KIND_LABEL[form.kind] ?? 'εγγραφή'}`,
);

function openForm(kind: string): void {
  form.kind = kind;
  form.category = kind === 'PROSANATOLISMOS' ? MO_ENOTITES[0] : null;
  form.title = kind === 'YPOSCHESI' ? 'Υπόσχεση' : '';
  form.passedAt = '';
  form.eidiki = false;
  formError.value = null;
  formOpen.value = true;
}

async function submitForm(): Promise<void> {
  if (!card.value || !form.kind) return;
  if (form.kind !== 'YPOSCHESI' && !form.title.trim()) {
    formError.value = 'Συμπλήρωσε όνομα.';
    return;
  }
  const category =
    form.kind === 'PROSANATOLISMOS'
      ? form.category
      : form.kind === 'EPITROPI' && form.eidiki
        ? EPITROPI_EIDIKI
        : undefined;
  saving.value = true;
  formError.value = null;
  try {
    await post(`/proodos/card/member/${card.value.member.id}/entry`, {
      kind: form.kind,
      category: category ?? undefined,
      title: form.title.trim() || 'Υπόσχεση',
      passedAt: form.passedAt || undefined,
    });
    formOpen.value = false;
    await refreshCard();
  } catch (err) {
    formError.value = err instanceof ApiError ? err.message : 'Αποτυχία προσθήκης.';
  } finally {
    saving.value = false;
  }
}

function removeEntry(entry: Entry): void {
  $q.dialog({
    title: 'Διαγραφή',
    message: `Να διαγραφεί «${entry.title}»;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      await del(`/proodos/card/entry/${entry.id}`);
      await refreshCard();
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία διαγραφής.' });
    }
  });
}

async function refreshCard(): Promise<void> {
  if (card.value) card.value = await get<Card>(`/proodos/card/member/${card.value.member.id}`);
  await reload();
}
</script>
