<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="page-title">Συμβούλια</div>

      <q-btn
        v-if="inKlados && canWriteKlados"
        color="klados"
        text-color="klados-on"
        icon="add"
        label="Νέο"
        :loading="creating"
        @click="createKlados"
      />
      <q-btn-dropdown
        v-else-if="!inKlados && canWriteTopiko"
        color="klados"
        text-color="klados-on"
        icon="add"
        label="Νέο"
        :loading="creating"
        no-caps
      >
        <q-list>
          <q-item v-for="t in TOPIKO_SYMVOULIA" :key="t" clickable v-close-popup @click="createTopiko(t)">
            <q-item-section>{{ SYMVOULIO_TYPE_LABEL[t] }}</q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>

    <q-tabs
      v-if="!inKlados"
      v-model="level"
      dense
      align="left"
      class="text-klados q-mb-md"
      narrow-indicator
    >
      <q-tab name="all" label="Όλα" />
      <q-tab name="klados" label="Κλάδων" />
      <q-tab name="topiko" label="Τοπικού" />
      <q-tab name="stelexon" label="Στελεχών" />
    </q-tabs>

    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!visible.length"
      empty-text="Κανένα συμβούλιο."
      empty-icon="forum"
      @retry="reload"
    >
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="s in visible" :key="s.id" clickable v-ripple @click="open(s.id)">
          <q-item-section avatar>
            <q-avatar
              :style="kladosVars(s.klados?.type)"
              :class="s.finalized ? 'bg-grey-6 text-white' : 'bg-klados text-klados-on'"
              size="36px"
              :icon="s.finalized ? 'lock' : 'edit_note'"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ s.title ?? s.typeLabel }}</q-item-label>
            <q-item-label caption>
              {{ s.typeLabel }} · {{ formatDate(s.date) }}
              <span v-if="s.klados"> · {{ KLADOS_LABEL[s.klados.type] }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap">
              <q-badge
                v-if="s._count.participants"
                outline
                color="klados"
                class="q-mr-sm"
                :label="`${s._count.participants} στελέχη`"
              />
              <q-badge v-if="s.finalized" color="grey-7" class="q-mr-sm" label="Οριστικό" />

              <q-btn flat dense round icon="visibility" @click.stop="open(s.id, 'view')">
                <q-tooltip>Προβολή</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canWriteRow(s) && !s.finalized"
                flat
                dense
                round
                icon="edit"
                @click.stop="open(s.id)"
              >
                <q-tooltip>Επεξεργασία</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canWriteRow(s)"
                flat
                dense
                round
                icon="delete"
                color="negative"
                @click.stop="confirmDelete(s)"
              >
                <q-tooltip>Διαγραφή</q-tooltip>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  SYMVOULIO_TYPE_LABEL,
  SymvoulioType,
  TOPIKO_SYMVOULIA,
  type KladosType,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, del, get, post } from '../lib/api';
import { formatDate } from '../lib/format';
import { kladosVars } from '../lib/klados-theme';
import { useAuthStore } from '../stores/auth';
import { useKladosScope } from '../composables/useKladosScope';

interface SymvoulioRow {
  id: string;
  type: SymvoulioType;
  typeLabel: string;
  title: string | null;
  date: string;
  finalized: boolean;
  klados: { type: KladosType } | null;
  _count: { participants: number };
}

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const { klados, inKlados } = useKladosScope();

// Δημιουργία: συμβούλιο κλάδου μέσα στον κλάδο· συμβούλιο Τοπικού/Στελεχών μόνο ο υπερδιαχειριστής.
const canWriteKlados = computed(() => (klados.value ? auth.can('symvoulio:klados:write', klados.value) : false));
const canWriteTopiko = computed(() => auth.can('symvoulio:topiko:write'));

/** Δικαίωμα επεξεργασίας ανά γραμμή — ανάλογα με το επίπεδο του συμβουλίου. */
function canWriteRow(row: SymvoulioRow): boolean {
  return (TOPIKO_SYMVOULIA as readonly string[]).includes(row.type)
    ? auth.can('symvoulio:topiko:write')
    : auth.can('symvoulio:klados:write', row.klados?.type ?? undefined);
}

const creating = ref(false);
const level = ref<'all' | 'klados' | 'topiko' | 'stelexon'>('all');

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<SymvoulioRow[]>('/symvoulia', {
      params: klados.value ? { klados: klados.value } : {},
    }),
  { cacheKey: 'symvoulia', watchSources: [klados] },
);

const visible = computed(() => {
  const rows = data.value ?? [];
  if (level.value === 'klados') return rows.filter((r) => r.type === SymvoulioType.KLADOU);
  if (level.value === 'topiko') return rows.filter((r) => r.type === SymvoulioType.TOPIKOU);
  if (level.value === 'stelexon') return rows.filter((r) => r.type === SymvoulioType.STELEXON);
  return rows;
});

/** Ανοίγει το συμβούλιο για επεξεργασία ή μόνο για διάβασμα. */
function open(id: string, mode?: 'view'): void {
  void router.push({
    name: 'symvoulio',
    params: { id },
    ...(mode ? { query: { view: '1' } } : {}),
  });
}

function confirmDelete(row: SymvoulioRow): void {
  $q.dialog({
    title: 'Διαγραφή συμβουλίου',
    message: `Το «${row.title ?? row.typeLabel}» της ${formatDate(row.date)} θα αρχειοθετηθεί και θα φύγει από τη λίστα. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
    persistent: true,
  }).onOk(() => void remove(row.id));
}

async function remove(id: string): Promise<void> {
  try {
    await del(`/symvoulia/${id}`);
    await reload();
    $q.notify({ type: 'positive', message: 'Το συμβούλιο διαγράφηκε.' });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία διαγραφής.',
    });
  }
}

/**
 * Δημιουργεί το συμβούλιο και πάει κατευθείαν σε αυτό.
 *
 * Χωρίς ενδιάμεση φόρμα, όπως και στις συγκεντρώσεις: τίτλος και ημερομηνία
 * συμπληρώνονται εκεί που γράφεται και η ατζέντα.
 */
function createKlados(): void {
  if (klados.value) void doCreate(SymvoulioType.KLADOU, klados.value);
}
function createTopiko(type: SymvoulioType): void {
  void doCreate(type);
}

async function doCreate(type: SymvoulioType, kladosType?: KladosType): Promise<void> {
  creating.value = true;
  try {
    const created = await post<{ id: string }>('/symvoulia', {
      type,
      ...(kladosType ? { kladosType } : {}),
      // Μεσημέρι: η ημερομηνία κρατά την ημέρα και καμία ζώνη δεν τη μετακινεί.
      date: new Date(`${today()}T12:00:00`).toISOString(),
    });
    await router.push({ name: 'symvoulio', params: { id: created.id } });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία δημιουργίας.',
    });
  } finally {
    creating.value = false;
  }
}

/** «YYYY-MM-DD» τοπικά — όχι μέσω UTC, που θα άλλαζε μέρα το βράδυ. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
</script>
