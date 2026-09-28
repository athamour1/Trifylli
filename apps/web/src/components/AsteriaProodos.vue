<template>
  <div>
    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!members.length"
      empty-text="Δεν υπάρχουν Αστέρια σε αυτόν τον κλάδο."
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
              <q-chip
                dense
                :color="m.summary.star ? 'amber-8' : 'grey-2'"
                :text-color="m.summary.star ? 'white' : 'grey-9'"
                icon="star"
                :label="m.summary.star ? 'Αστέρι' : `${m.summary.aktines}/7`"
              >
                <q-tooltip>Ακτίνες «για να Γίνω Αστέρι»</q-tooltip>
              </q-chip>
              <q-chip dense square color="grey-2" text-color="grey-9" icon="workspace_premium" :label="`${m.summary.ptychia}/9`">
                <q-tooltip>Πτυχία</q-tooltip>
              </q-chip>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>

    <!-- ── Καρτέλα μέλους ── -->
    <q-dialog v-model="cardOpen" @hide="card = null">
      <q-card style="min-width: min(580px, 95vw)">
        <q-card-section v-if="card && cardSummary" class="row items-center no-wrap">
          <div class="col">
            <div class="text-h6">{{ card.member.lastName }} {{ card.member.firstName }}</div>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-chip
                dense
                :color="cardSummary.star ? 'amber-8' : 'grey-3'"
                :text-color="cardSummary.star ? 'white' : 'grey-7'"
                icon="star"
                :label="cardSummary.star ? 'Αστέρι (7/7)' : `Ακτίνες ${cardSummary.aktines}/7`"
              />
              <q-chip
                dense
                :color="cardSummary.hasYposchesi ? 'primary' : 'grey-3'"
                :text-color="cardSummary.hasYposchesi ? 'white' : 'grey-7'"
                icon="verified"
                label="Υπόσχεση"
              />
              <q-chip dense color="grey-3" text-color="grey-8" icon="workspace_premium" :label="`Πτυχία ${cardSummary.ptychia}/9`" />
            </div>
            <div v-if="nextHint" class="text-caption text-grey-7 q-mt-xs">{{ nextHint }}</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section v-if="card" class="q-gutter-md scroll" style="max-height: 72vh">
          <!-- Για να Γίνω Αστέρι (7 ακτίνες) -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Για να Γίνω Αστέρι</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" label="Δραστηριότητα" @click="openForm('AKTINA')" />
            </div>
            <div v-for="aktina in ASTERI_AKTINES" :key="aktina" class="q-mb-sm">
              <div class="row items-center no-wrap">
                <q-icon :name="byAktina(aktina).length ? 'check_circle' : 'radio_button_unchecked'" :color="byAktina(aktina).length ? 'positive' : 'grey-5'" size="18px" class="q-mr-xs" />
                <div class="text-caption text-weight-medium text-grey-8">{{ aktina }}</div>
              </div>
              <q-list v-if="byAktina(aktina).length" dense>
                <q-item v-for="e in byAktina(aktina)" :key="e.id" class="q-px-none">
                  <q-item-section avatar><q-icon name="auto_awesome" color="amber-8" size="20px" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ e.title }}</q-item-label>
                    <q-item-label caption>{{ e.passedAt ? formatDate(e.passedAt) : '—' }}</q-item-label>
                  </q-item-section>
                  <q-item-section side v-if="canWrite">
                    <q-btn flat dense round icon="delete" color="negative" size="sm" @click="removeEntry(e)" />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </div>

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
            <div v-if="!cardSummary?.star" class="text-caption text-orange-8 q-mt-xs">
              Η Υπόσχεση δίνεται αφού ολοκληρωθούν και οι 7 ακτίνες.
            </div>
          </div>

          <!-- Πτυχία -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Πτυχία ({{ cardSummary?.ptychia ?? 0 }}/9)</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" label="Πτυχίο" @click="openForm('PTYCHIO')" />
            </div>
            <q-list v-if="byKind('PTYCHIO').length" dense>
              <q-item v-for="e in byKind('PTYCHIO')" :key="e.id" class="q-px-none">
                <q-item-section avatar><q-icon name="workspace_premium" color="secondary" size="20px" /></q-item-section>
                <q-item-section>
                  <q-item-label>{{ e.title }}</q-item-label>
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
            v-if="form.kind === 'AKTINA'"
            v-model="form.category"
            :options="[...ASTERI_AKTINES]"
            label="Ακτίνα *"
            outlined
            dense
          />
          <q-input
            v-if="form.kind !== 'YPOSCHESI'"
            v-model="form.title"
            :label="form.kind === 'AKTINA' ? 'Δραστηριότητα *' : 'Όνομα Πτυχίου *'"
            outlined
            dense
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
  ASTERI_AKTINES,
  ASTERI_ENTRY_KIND_LABEL,
  ASTERI_PTYCHIA_TOTAL,
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

/** Σύνοψη: πόσες ακτίνες καλύφθηκαν + Πτυχία. */
function summarize(entries: EntryLite[]) {
  const aktines = new Set(
    entries.filter((e) => e.kind === 'AKTINA' && e.category).map((e) => e.category),
  ).size;
  const ptychia = entries.filter((e) => e.kind === 'PTYCHIO').length;
  return {
    hasYposchesi: entries.some((e) => e.kind === 'YPOSCHESI'),
    aktines,
    star: aktines >= ASTERI_AKTINES.length,
    ptychia,
  };
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<MemberRow[]>('/proodos/card/ASTERIA/members'),
  { cacheKey: 'proodos-asteria' },
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
function byAktina(aktina: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === 'AKTINA' && e.category === aktina) ?? [];
}
function byKind(kind: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === kind) ?? [];
}

const nextHint = computed(() => {
  const s = cardSummary.value;
  if (!s) return '';
  if (!s.star) return `Για την Υπόσχεση: ${ASTERI_AKTINES.length - s.aktines} ακτίνες ακόμη`;
  if (!s.hasYposchesi) return 'Έτοιμο για Υπόσχεση!';
  return s.ptychia >= ASTERI_PTYCHIA_TOTAL ? 'Ολοκλήρωσε και τα 9 Πτυχία!' : `Πτυχία: ${s.ptychia}/9`;
});

// ── Φόρμα ──
const formOpen = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const form = reactive<{ kind: string; category: string | null; title: string; passedAt: string }>({
  kind: '',
  category: null,
  title: '',
  passedAt: '',
});
const formTitle = computed(() =>
  form.kind === 'YPOSCHESI' ? 'Νέα: Υπόσχεση' : `Νέο: ${ASTERI_ENTRY_KIND_LABEL[form.kind] ?? 'εγγραφή'}`,
);

function openForm(kind: string): void {
  form.kind = kind;
  form.category = kind === 'AKTINA' ? ASTERI_AKTINES[0] : null;
  form.title = kind === 'YPOSCHESI' ? 'Υπόσχεση' : '';
  form.passedAt = '';
  formError.value = null;
  formOpen.value = true;
}

async function submitForm(): Promise<void> {
  if (!card.value || !form.kind) return;
  if (form.kind !== 'YPOSCHESI' && !form.title.trim()) {
    formError.value = 'Συμπλήρωσε όνομα.';
    return;
  }
  saving.value = true;
  formError.value = null;
  try {
    await post(`/proodos/card/member/${card.value.member.id}/entry`, {
      kind: form.kind,
      category: form.kind === 'AKTINA' ? form.category : undefined,
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
