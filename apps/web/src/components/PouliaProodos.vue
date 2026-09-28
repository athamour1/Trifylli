<template>
  <div>
    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!members.length"
      empty-text="Δεν υπάρχουν Πουλιά σε αυτόν τον κλάδο."
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
              <q-chip dense square color="grey-2" text-color="grey-9" icon="directions_walk" :label="vimataTotal(m.summary)">
                <q-tooltip>Βήματα</q-tooltip>
              </q-chip>
              <q-chip
                dense
                :color="m.summary.ftero > 0 ? 'primary' : 'grey-3'"
                :text-color="m.summary.ftero > 0 ? 'white' : 'grey-7'"
                icon="military_tech"
                :label="m.summary.ftero > 0 ? FTERA_LABELS[m.summary.ftero - 1] : '—'"
              >
                <q-tooltip>Φτερά</q-tooltip>
              </q-chip>
              <q-icon v-if="m.summary.kitrinosKompos" name="emoji_events" color="amber-8" size="22px">
                <q-tooltip>Κίτρινος Κόμπος</q-tooltip>
              </q-icon>
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
                v-for="(label, i) in FTERA_LABELS"
                :key="label"
                dense
                :color="i < cardSummary.ftero ? 'primary' : 'grey-3'"
                :text-color="i < cardSummary.ftero ? 'white' : 'grey-7'"
                icon="military_tech"
                :label="label"
              />
              <q-chip
                dense
                :color="cardSummary.kitrinosKompos ? 'amber-8' : 'grey-3'"
                :text-color="cardSummary.kitrinosKompos ? 'white' : 'grey-7'"
                icon="emoji_events"
                label="Κίτρινος Κόμπος"
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

          <!-- Βήματα (ανά κεφάλαιο) -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Βήματα</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" label="Βήμα" @click="openForm('VIMA')" />
            </div>
            <div v-for="kef in POULIA_KEFALAIA" :key="kef" class="q-mb-sm">
              <div class="row items-center justify-between">
                <div class="text-caption text-weight-medium text-grey-8">{{ kef }}</div>
                <div class="text-caption text-grey-6">
                  {{ byKefalaio(kef).length }}<span v-if="kefTarget"> / {{ kefTarget }}</span>
                  <span class="text-grey-5"> (3 ανά Φτερό)</span>
                </div>
              </div>
              <q-list v-if="byKefalaio(kef).length" dense>
                <q-item v-for="e in byKefalaio(kef)" :key="e.id" class="q-px-none">
                  <q-item-section avatar><q-icon name="directions_walk" color="secondary" size="20px" /></q-item-section>
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

          <!-- Βήματα Κίτρινου Κόμπου -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Βήματα Κίτρινου Κόμπου</div>
              <q-btn v-if="canWrite" flat dense no-caps color="klados" icon="add" label="Βήμα Κ.Κ." @click="openForm('VIMA_KK')" />
            </div>
            <q-list v-if="byKind('VIMA_KK').length" dense>
              <q-item v-for="e in byKind('VIMA_KK')" :key="e.id" class="q-px-none">
                <q-item-section avatar><q-icon name="emoji_events" color="amber-8" size="20px" /></q-item-section>
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

          <!-- Πτυχία -->
          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="section-title">Πτυχία</div>
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
            v-if="form.kind === 'VIMA'"
            v-model="form.category"
            :options="[...POULIA_KEFALAIA]"
            label="Κεφάλαιο *"
            outlined
            dense
          />
          <q-input
            v-if="form.kind !== 'YPOSCHESI'"
            v-model="form.title"
            :label="`Όνομα ${POULIA_ENTRY_KIND_LABEL[form.kind] ?? ''} *`"
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
  FTERA_LABELS,
  FTERO_REQ,
  POULIA_ENTRY_KIND_LABEL,
  POULIA_KEFALAIA,
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
type Summary = ReturnType<typeof summarize>;

const $q = useQuasar();
const auth = useAuthStore();
const canWrite = computed(() => auth.can('proodos:write', props.klados));

/** Σύνοψη Φτερών/Κίτρινου Κόμπου από τις εγγραφές. */
function summarize(entries: EntryLite[]) {
  const perKef = POULIA_KEFALAIA.map(
    (kef) => entries.filter((e) => e.kind === 'VIMA' && e.category === kef).length,
  );
  const minKef = perKef.length ? Math.min(...perKef) : 0;
  const vimaKK = entries.filter((e) => e.kind === 'VIMA_KK').length;
  const ptychia = entries.filter((e) => e.kind === 'PTYCHIO').length;
  const ftero = minKef >= FTERO_REQ.ftero2PerKefalaio ? 2 : minKef >= FTERO_REQ.ftero1PerKefalaio ? 1 : 0;
  return {
    hasYposchesi: entries.some((e) => e.kind === 'YPOSCHESI'),
    perKef,
    minKef,
    vimaKK,
    ptychia,
    ftero,
    kitrinosKompos: vimaKK >= FTERO_REQ.kitrinosKompos,
  };
}

function vimataTotal(s: Summary): number {
  return s.perKef.reduce((a, b) => a + b, 0);
}

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<MemberRow[]>('/proodos/card/POULIA/members'),
  { cacheKey: 'proodos-poulia' },
);
const members = computed(() => (data.value ?? []).map((m) => ({ ...m, summary: summarize(m.entries) })));

// ── Καρτέλα ──
const cardOpen = ref(false);
const cardLoading = ref(false);
const card = ref<Card | null>(null);
const cardSummary = computed(() => (card.value ? summarize(card.value.entries) : null));
/** Στόχος Βημάτων ανά κεφάλαιο για το ΤΡΕΧΟΝ Φτερό (3 για το 1ο, 6 για το 2ο). */
const kefTarget = computed(() => {
  const f = cardSummary.value?.ftero ?? 0;
  return f >= 2 ? null : f === 1 ? FTERO_REQ.ftero2PerKefalaio : FTERO_REQ.ftero1PerKefalaio;
});

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
function byKefalaio(kef: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === 'VIMA' && e.category === kef) ?? [];
}
function byKind(kind: string): Entry[] {
  return card.value?.entries.filter((e) => e.kind === kind) ?? [];
}

const nextHint = computed(() => {
  const s = cardSummary.value;
  if (!s) return '';
  const parts: string[] = [];
  if (s.ftero < 2) {
    const target = s.ftero === 0 ? FTERO_REQ.ftero1PerKefalaio : FTERO_REQ.ftero2PerKefalaio;
    const need = s.perKef.reduce((sum, c) => sum + Math.max(0, target - c), 0);
    const label = s.ftero === 0 ? '1ο Φτερό' : '2ο Φτερό';
    parts.push(need > 0 ? `${label}: ${need} Βήματα ακόμη` : `Έτοιμο για το ${label}!`);
  }
  if (!s.kitrinosKompos) {
    const need = Math.max(0, FTERO_REQ.kitrinosKompos - s.vimaKK);
    parts.push(`Κίτρινος Κόμπος: ${need} Βήμα Κ.Κ. ακόμη`);
  }
  return parts.join(' · ');
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
  form.kind === 'YPOSCHESI' ? 'Νέα: Υπόσχεση' : `Νέο: ${POULIA_ENTRY_KIND_LABEL[form.kind] ?? 'εγγραφή'}`,
);

function openForm(kind: string): void {
  form.kind = kind;
  form.category = kind === 'VIMA' ? POULIA_KEFALAIA[0] : null;
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
      category: form.kind === 'VIMA' ? form.category : undefined,
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
