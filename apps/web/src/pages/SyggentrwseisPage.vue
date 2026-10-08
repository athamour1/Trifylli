<template>
  <q-page padding>
    <div class="tf-actions">
      <q-btn
        v-if="canWrite"
        color="klados"
        text-color="klados-on"
        icon="add"
        label="Νέα"
        :loading="creating"
        :disable="!effectiveKlados"
        @click="create"
      >
        <q-tooltip v-if="!effectiveKlados">Διάλεξε πρώτα κλάδο.</q-tooltip>
      </q-btn>
    </div>

    <q-select
      v-if="!inKlados"
      v-model="picked"
      :options="kladosOptions"
      label="Κλάδος"
      dense
      outlined
      emit-value
      map-options
      clearable
      class="q-mb-md"
      style="max-width: 320px"
    />

    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!data?.length"
      empty-text="Καμία συγκέντρωση."
      empty-icon="schedule"
      @retry="reload"
    >
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="s in data" :key="s.id" clickable v-ripple @click="open(s.id)">
          <!-- Η κατάσταση του παρουσιολογίου ζει στο εικονίδιο: τα σήματα
               έδωσαν τη θέση τους στις ενέργειες. -->
          <q-item-section avatar>
            <q-avatar
              :style="kladosVars(s.klados.type)"
              :class="
                s._count.parousies > 0 ? 'bg-klados text-klados-on' : 'bg-grey-5 text-white'
              "
              :icon="s._count.parousies > 0 ? 'fact_check' : 'schedule'"
              size="36px"
            >
              <q-tooltip>
                {{ s._count.parousies > 0 ? 'Παρουσιολόγιο συμπληρωμένο' : 'Παρουσιολόγιο εκκρεμεί' }}
              </q-tooltip>
            </q-avatar>
          </q-item-section>

          <q-item-section>
            <q-item-label>{{ s.title ?? 'Συγκέντρωση' }}</q-item-label>
            <q-item-label caption>
              {{ formatDate(s.date) }} · {{ KLADOS_LABEL[s.klados.type] }}
              <span v-if="s.drasi"> · {{ s.drasi.title }}</span>
              <span v-if="s._count.timeline"> · {{ s._count.timeline }} κομμάτια</span>
            </q-item-label>
          </q-item-section>

          <q-item-section side>
            <div class="row items-center no-wrap">
              <q-btn
                flat
                dense
                round
                icon="fact_check"
                :style="kladosVars(s.klados.type)"
                :class="s._count.parousies > 0 ? 'text-klados' : ''"
                @click.stop="openParousiologio(s.id)"
              >
                <q-tooltip>Παρουσιολόγιο</q-tooltip>
              </q-btn>
              <q-btn flat dense round icon="visibility" @click.stop="open(s.id, 'view')">
                <q-tooltip>Προβολή</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canWrite"
                flat
                dense
                round
                icon="edit"
                @click.stop="open(s.id)"
              >
                <q-tooltip>Επεξεργασία</q-tooltip>
              </q-btn>
              <q-btn flat dense round icon="picture_as_pdf" @click.stop="open(s.id, 'print')">
                <q-tooltip>Εξαγωγή PDF</q-tooltip>
              </q-btn>
              <q-btn
                v-if="canWrite"
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
import { KLADOS_LABEL, type KladosType } from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, del, get, post } from '../lib/api';
import { formatDate } from '../lib/format';
import { kladosVars } from '../lib/klados-theme';
import { useAuthStore } from '../stores/auth';
import { useKladosScope } from '../composables/useKladosScope';

interface SyggentrwshRow {
  id: string;
  title: string | null;
  date: string;
  klados: { type: KladosType };
  drasi: { id: string; title: string } | null;
  _count: { parousies: number; timeline: number };
}

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const {
  klados: routeKlados,
  inKlados,
  options: kladosOptions,
} = useKladosScope();

const canWrite = computed(() => auth.can('syggentrwsh:write'));

const picked = ref<KladosType | null>(null);
const effectiveKlados = computed(() => routeKlados.value ?? picked.value);

const creating = ref(false);

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<SyggentrwshRow[]>('/syggentrwseis', {
      params: effectiveKlados.value ? { klados: effectiveKlados.value } : {},
    }),
  { cacheKey: 'syggentrwseis', watchSources: [effectiveKlados] },
);

/**
 * Δημιουργεί τη συγκέντρωση και πάει στη σελίδα σχεδιασμού.
 *
 * Καμία ενδιάμεση φόρμα: τίτλος, ημερομηνία και στόχος συμπληρώνονται εκεί που
 * συμπληρώνεται και το πρόγραμμα. Η εγγραφή γεννιέται με τη σημερινή ημερομηνία
 * ώστε να υπάρχει κάτι να σωθεί από την πρώτη στιγμή.
 */
async function create(): Promise<void> {
  const kladosType = effectiveKlados.value;
  if (!kladosType) return;

  creating.value = true;
  try {
    const created = await post<{ id: string }>('/syggentrwseis', {
      kladosType,
      // Μεσημέρι: η `date` κρατά την ημέρα, και καμία μετατροπή ζώνης δεν
      // μετακινεί το μεσημέρι σε άλλη μέρα.
      date: new Date(`${today()}T12:00:00`).toISOString(),
    });
    await router.push({ name: 'syggentrwsh', params: { id: created.id } });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία δημιουργίας.',
    });
  } finally {
    creating.value = false;
  }
}

/**
 * Ανοίγει τη σελίδα σχεδιασμού σε μία από τρεις καταστάσεις.
 *
 * Όλες καταλήγουν στην ίδια σελίδα — εκεί ζει ο σχεδιασμός, το φύλλο εκτύπωσης
 * και τα δεδομένα. Η λίστα απλώς λέει με τι διάθεση την ανοίγουμε.
 */
function open(id: string, mode?: 'view' | 'print'): void {
  void router.push({
    name: 'syggentrwsh',
    params: { id },
    ...(mode ? { query: { [mode]: '1' } } : {}),
  });
}

function openParousiologio(id: string): void {
  void router.push({ name: 'parousiologio', params: { id } });
}

function confirmDelete(row: SyggentrwshRow): void {
  $q.dialog({
    title: 'Διαγραφή συγκέντρωσης',
    message: `Η «${row.title ?? 'Συγκέντρωση'}» της ${formatDate(row.date)} θα αρχειοθετηθεί και θα φύγει από τη λίστα. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
    persistent: true,
  }).onOk(() => void remove(row.id));
}

async function remove(id: string): Promise<void> {
  try {
    await del(`/syggentrwseis/${id}`);
    await reload();
    $q.notify({ type: 'positive', message: 'Η συγκέντρωση διαγράφηκε.' });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία διαγραφής.',
    });
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
