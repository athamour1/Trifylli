<template>
  <div>
    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!members.length"
      empty-text="Δεν υπάρχουν Οδηγοί σε αυτόν τον κλάδο."
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
              <q-chip dense square color="grey-2" text-color="grey-9" icon="hiking" :label="m.summary.monopatia">
                <q-tooltip>Μονοπάτια</q-tooltip>
              </q-chip>
              <q-chip dense square color="grey-2" text-color="grey-9" icon="workspace_premium" :label="m.summary.ptychia + m.summary.ptychiaOdigismou">
                <q-tooltip>Πτυχία</q-tooltip>
              </q-chip>
              <q-chip
                dense
                :color="m.summary.korufes > 0 ? 'primary' : 'grey-3'"
                :text-color="m.summary.korufes > 0 ? 'white' : 'grey-7'"
                icon="terrain"
                :label="m.summary.korufes > 0 ? KORUFI_LABELS[m.summary.korufes - 1] : '—'"
              >
                <q-tooltip>Κορυφές</q-tooltip>
              </q-chip>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>

    <!-- ── Καρτέλα μέλους ── -->
    <q-dialog v-model="cardOpen" @hide="card = null">
      <q-card style="min-width: min(560px, 94vw)">
        <q-card-section v-if="card && cardSummary" class="row items-center no-wrap">
          <div class="col">
            <div class="text-h6">{{ card.member.lastName }} {{ card.member.firstName }}</div>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-chip
                v-for="(label, i) in KORUFI_LABELS"
                :key="label"
                dense
                :color="i < cardSummary.korufes ? 'primary' : 'grey-3'"
                :text-color="i < cardSummary.korufes ? 'white' : 'grey-7'"
                icon="terrain"
                :label="label"
              />
            </div>
            <div v-if="nextHint" class="text-caption text-grey-7 q-mt-xs">{{ nextHint }}</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section v-if="card" class="q-gutter-md scroll" style="max-height: 70vh">
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
              flat
              dense
              no-caps
              color="klados"
              icon="add"
              label="Καταχώρηση Υπόσχεσης"
              @click="openForm('YPOSCHESI')"
            />
            <div v-else class="text-caption text-grey-6">Δεν έχει δοθεί.</div>
          </div>

          <!-- Μονοπάτια -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Μονοπάτια</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" label="Μονοπάτι" @click="openForm('MONOPATI')" />
            </div>
            <div v-for="theme in MONOPATI_THEMES" :key="theme" class="q-mb-sm">
              <div class="text-caption text-weight-medium text-grey-8">{{ theme }}</div>
              <q-list v-if="byTheme(theme).length" dense>
                <q-item v-for="e in byTheme(theme)" :key="e.id" class="q-px-none">
                  <q-item-section avatar><q-icon name="hiking" color="secondary" size="20px" /></q-item-section>
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

          <!-- Πτυχία -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Πτυχία</div>
              <div class="q-gutter-xs" v-if="canWrite">
                <q-btn flat dense no-caps color="klados" icon="add" label="Οδηγισμού" @click="openForm('PTYCHIO_ODIGISMOU')" />
                <q-btn flat dense no-caps color="klados" icon="add" label="Επιλογής" @click="openForm('PTYCHIO')" />
              </div>
            </div>
            <q-list v-if="ptychia.length" dense>
              <q-item v-for="e in ptychia" :key="e.id" class="q-px-none">
                <q-item-section avatar>
                  <q-icon name="workspace_premium" :color="e.kind === 'PTYCHIO_ODIGISMOU' ? 'accent' : 'secondary'" size="20px" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ e.title }}</q-item-label>
                  <q-item-label caption>
                    {{ e.kind === 'PTYCHIO_ODIGISMOU' ? 'Οδηγισμού' : 'Επιλογής' }}<span v-if="e.passedAt"> · {{ formatDate(e.passedAt) }}</span>
                  </q-item-label>
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
      <q-card style="min-width: min(420px, 92vw)">
        <q-card-section class="text-subtitle1 text-weight-medium">{{ formTitle }}</q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-if="form.kind === 'MONOPATI'"
            v-model="form.category"
            :options="[...MONOPATI_THEMES]"
            label="Θεματική ενότητα *"
            outlined
            dense
          />
          <q-input
            v-if="form.kind !== 'YPOSCHESI'"
            v-model="form.title"
            :label="form.kind === 'MONOPATI' ? 'Όνομα Μονοπατιού *' : 'Όνομα Πτυχίου *'"
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
  KORUFES_TOTAL,
  KORUFI_LABELS,
  KORUFI_REQUIREMENT,
  MONOPATI_THEMES,
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

/** Υπολογισμός σύνοψης (Κορυφές) από τις εγγραφές — ίδια λογική για λίστα & καρτέλα. */
function summarize(entries: EntryLite[]) {
  const c = (k: string) => entries.filter((e) => e.kind === k).length;
  const monopatia = c('MONOPATI');
  const ptychia = c('PTYCHIO');
  const ptychiaOdigismou = c('PTYCHIO_ODIGISMOU');
  const korufes = Math.min(
    Math.floor(monopatia / KORUFI_REQUIREMENT.monopatia),
    Math.floor(ptychia / KORUFI_REQUIREMENT.ptychia),
    Math.floor(ptychiaOdigismou / KORUFI_REQUIREMENT.ptychiaOdigismou),
    KORUFES_TOTAL,
  );
  return { hasYposchesi: entries.some((e) => e.kind === 'YPOSCHESI'), monopatia, ptychia, ptychiaOdigismou, korufes };
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<MemberRow[]>('/proodos/card/ODIGOI/members'),
  { cacheKey: 'proodos-odigoi' },
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
const ptychia = computed(
  () => card.value?.entries.filter((e) => e.kind === 'PTYCHIO' || e.kind === 'PTYCHIO_ODIGISMOU') ?? [],
);
function byTheme(theme: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === 'MONOPATI' && e.category === theme) ?? [];
}

const nextHint = computed(() => {
  const s = cardSummary.value;
  if (!s) return '';
  if (s.korufes >= 3) return 'Κατέκτησε και τις τρεις Κορυφές!';
  const target = s.korufes + 1;
  const need = (total: number, have: number) => Math.max(0, total - have);
  const parts = [
    need(target * 4, s.monopatia) && `${need(target * 4, s.monopatia)} Μονοπάτια`,
    need(target, s.ptychiaOdigismou) && `${need(target, s.ptychiaOdigismou)} Πτυχίο Οδηγισμού`,
    need(target, s.ptychia) && `${need(target, s.ptychia)} Πτυχίο επιλογής`,
  ].filter(Boolean);
  return parts.length
    ? `Για την ${KORUFI_LABELS[s.korufes]}: ${parts.join(', ')} ακόμη`
    : `Έτοιμος για την ${KORUFI_LABELS[s.korufes]}!`;
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
const formTitle = computed(() => {
  const map: Record<string, string> = {
    YPOSCHESI: 'Νέα: Υπόσχεση',
    MONOPATI: 'Νέο: Μονοπάτι',
    PTYCHIO: 'Νέο: Πτυχίο επιλογής',
    PTYCHIO_ODIGISMOU: 'Νέο: Πτυχίο Οδηγισμού',
  };
  return map[form.kind] ?? 'Νέα εγγραφή';
});

function openForm(kind: string): void {
  form.kind = kind;
  form.category = kind === 'MONOPATI' ? MONOPATI_THEMES[0] : null;
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
      category: form.kind === 'MONOPATI' ? form.category : undefined,
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
