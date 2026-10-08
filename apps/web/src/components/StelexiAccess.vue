<template>
  <div>
    <div class="text-caption text-grey-7 q-mb-md">
      Κάθε στέλεχος μπορεί να μπει στην πλατφόρμα με email από το e-SEO. Η ενεργοποίηση στέλνει σύνδεσμο ορισμού
      κωδικού. Τι βλέπει και τι αλλάζει το ορίζουν ο βαθμός του (ο Αρχηγός διαχειρίζεται τον κλάδο) και οι υπευθυνότητές
      του στο αρχηγείο.
    </div>

    <!-- Φίλτρα: κλάδος και κατάσταση -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <q-chip
        v-for="k in kladoiPresent" :key="k"
        clickable dense
        :outline="kladosFilter !== k"
        :style="kladosFilter === k ? { background: KLADOS_META[k].color, color: readableOn(KLADOS_META[k].color) } : { color: inkOf(k) }"
        :label="KLADOS_LABEL[k]"
        @click="kladosFilter = kladosFilter === k ? null : k"
      />
      <q-space />
      <SegmentedToggle
        v-model="statusFilter"
        dense unelevated no-caps
        toggle-color="primary"
        :options="[
          { label: `Όλα (${rows.length})`, value: 'ALL' },
          { label: `Χωρίς πρόσβαση (${count('NONE')})`, value: 'NONE' },
          { label: `Προσκλήθηκαν (${count('INVITED')})`, value: 'INVITED' },
          { label: `Ενεργά (${count('ACTIVE')})`, value: 'ACTIVE' },
        ]"
      />
    </div>

    <!-- Μπάρα μαζικής ενέργειας — εμφανίζεται μόλις επιλεγεί κάποιος -->
    <transition name="tf-bulk">
      <div v-if="selected.length" class="bulk-bar row items-center q-mb-md">
        <q-icon name="checklist" size="20px" class="q-mr-sm" />
        <div class="col">Επιλεγμένα: <b>{{ selected.length }}</b></div>
        <q-btn flat dense no-caps label="Καθαρισμός" class="q-mr-sm" @click="selected = []" />
        <q-btn unelevated no-caps color="primary" icon="forward_to_inbox" :label="`Ενεργοποίηση (${selected.length})`" :loading="busy" @click="confirmActivate(selected)" />
      </div>
    </transition>

    <PageState :loading="loading" :error="error" :empty="!visible.length" empty-text="Κανένα στέλεχος σε αυτό το φίλτρο." empty-icon="groups" @retry="load">
      <q-list bordered separator class="rounded-borders">
        <q-item v-if="selectable.length" dense class="bg-transparent">
          <q-item-section side>
            <q-checkbox
              :model-value="allState"
              color="primary"
              dense
              @update:model-value="toggleAll"
            />
          </q-item-section>
          <q-item-section class="text-caption text-grey-7">Επιλογή όλων όσων μπορούν να ενεργοποιηθούν εδώ ({{ selectable.length }})</q-item-section>
        </q-item>

        <q-item v-for="r in visible" :key="r.userId" :class="{ 'row--disabled': !canSelect(r) }">
          <q-item-section side>
            <q-checkbox v-model="selected" :val="r.userId" color="primary" dense :disable="!canSelect(r)" />
          </q-item-section>
          <q-item-section>
            <q-item-label>
              <router-link :to="{ name: 'melos', params: { id: r.userId } }" class="name-link">{{ r.lastName }} {{ r.firstName }}</router-link>
            </q-item-label>
            <q-item-label caption>
              <span v-if="r.email">{{ r.email }}</span>
              <span v-else class="text-warning">Χωρίς email στο e-SEO</span>
            </q-item-label>
            <div class="row q-gutter-xs q-mt-xs">
              <q-chip
                v-for="k in r.kladoi" :key="k.klados"
                dense square class="q-ma-none klados-chip"
                :style="{ '--chip': KLADOS_META[k.klados].color }"
                :icon="k.rank === 'ARCHIGOS' ? 'star' : undefined"
                :label="`${KLADOS_LABEL[k.klados]}${k.rank ? ` · ${LEADER_RANK_LABEL[k.rank]}` : ''}`"
              />
            </div>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap q-gutter-sm">
              <q-badge :color="STATUS[r.status].color" :label="STATUS[r.status].label" class="status-badge">
                <q-tooltip v-if="r.status === 'ACTIVE' && r.lastLoginAt">Τελευταία σύνδεση: {{ formatDateTime(r.lastLoginAt) }}</q-tooltip>
              </q-badge>
              <q-btn
                v-if="r.status === 'NONE' || r.status === 'INVITED'"
                flat round dense icon="forward_to_inbox" color="primary"
                :loading="busy && pending.includes(r.userId)"
                @click="confirmActivate([r.userId])"
              >
                <q-tooltip>{{ r.status === 'NONE' ? 'Ενεργοποίηση' : 'Ξανά αποστολή πρόσκλησης' }}</q-tooltip>
              </q-btn>
              <q-btn v-if="r.status === 'ACTIVE' || r.status === 'INVITED'" flat round dense icon="person_off" color="negative" @click="confirmRevoke(r)">
                <q-tooltip>Αφαίρεση πρόσβασης</q-tooltip>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  KLADOS_META,
  LEADER_RANK_LABEL,
  sortKladoi,
  type KladosType,
  type StelexiActivationResult,
  type StelexosAccessRow,
  type StelexosAccessStatus,
} from '@trifylli/shared';
import PageState from './PageState.vue';
import { ApiError, del, get, post } from '../lib/api';
import { inkOnWhite, readableOn } from '../lib/color';
import { formatDateTime } from '../lib/format';

const $q = useQuasar();

const STATUS: Record<StelexosAccessStatus, { label: string; color: string }> = {
  ADMIN: { label: 'Διαχειριστής', color: 'secondary' },
  ACTIVE: { label: 'Ενεργό', color: 'positive' },
  INVITED: { label: 'Προσκλήθηκε', color: 'orange-8' },
  NONE: { label: 'Χωρίς πρόσβαση', color: 'grey-7' },
  NO_EMAIL: { label: 'Χωρίς email', color: 'grey-5' },
};

const rows = ref<StelexosAccessRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);
const pending = ref<string[]>([]);
const selected = ref<string[]>([]);
const kladosFilter = ref<KladosType | null>(null);
const statusFilter = ref<'ALL' | StelexosAccessStatus>('ALL');

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    rows.value = await get<StelexosAccessRow[]>('/accounts/stelexi');
    // Ό,τι δεν είναι πια επιλέξιμο (π.χ. μόλις ενεργοποιήθηκε) βγαίνει από την επιλογή.
    selected.value = selected.value.filter((id) => rows.value.some((r) => r.userId === id && canSelect(r)));
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Η λίστα δεν φόρτωσε.';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const inkOf = (k: KladosType): string => inkOnWhite(KLADOS_META[k].color);
const count = (status: StelexosAccessStatus): number => rows.value.filter((r) => r.status === status).length;
const kladoiPresent = computed(() => sortKladoi([...new Set(rows.value.flatMap((r) => r.kladoi.map((k) => k.klados)))]));

/** Επιλέξιμοι: όσοι δεν έχουν πρόσβαση ή περιμένουν ακόμα (ξανά αποστολή). */
const canSelect = (r: StelexosAccessRow): boolean => r.status === 'NONE' || r.status === 'INVITED';

const visible = computed(() =>
  rows.value.filter(
    (r) =>
      (!kladosFilter.value || r.kladoi.some((k) => k.klados === kladosFilter.value)) &&
      (statusFilter.value === 'ALL' || r.status === statusFilter.value),
  ),
);
const selectable = computed(() => visible.value.filter(canSelect));
const allState = computed<boolean | null>(() => {
  const n = selectable.value.filter((r) => selected.value.includes(r.userId)).length;
  return n === 0 ? false : n === selectable.value.length ? true : null;
});
function toggleAll(): void {
  const ids = selectable.value.map((r) => r.userId);
  selected.value = allState.value === true ? selected.value.filter((id) => !ids.includes(id)) : [...new Set([...selected.value, ...ids])];
}

function confirmActivate(ids: string[]): void {
  const names = rows.value.filter((r) => ids.includes(r.userId));
  const resend = names.every((r) => r.status === 'INVITED');
  $q.dialog({
    title: ids.length === 1 ? (resend ? 'Ξανά αποστολή πρόσκλησης' : 'Ενεργοποίηση στελέχους') : `Ενεργοποίηση ${ids.length} στελεχών`,
    message:
      ids.length === 1
        ? `Θα σταλεί email ορισμού κωδικού στο ${names[0]?.email}.`
        : `Θα σταλεί email ορισμού κωδικού σε ${ids.length} στελέχη. Όσα δεν είχαν πρόσβαση την αποκτούν τώρα.`,
    cancel: { flat: true, noCaps: true, label: 'Άκυρο' },
    ok: { unelevated: true, noCaps: true, color: 'primary', label: 'Αποστολή' },
  }).onOk(() => void activate(ids));
}

async function activate(ids: string[]): Promise<void> {
  busy.value = true;
  pending.value = ids;
  try {
    const { results } = await post<StelexiActivationResult>('/accounts/stelexi/activate', { userIds: ids });
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (ok) $q.notify({ type: 'positive', icon: 'forward_to_inbox', message: ok === 1 ? 'Στάλθηκε η πρόσκληση.' : `Στάλθηκαν ${ok} προσκλήσεις.` });
    if (failed.length) {
      const nameOf = (id: string) => {
        const r = rows.value.find((x) => x.userId === id);
        return r ? `${r.lastName} ${r.firstName}` : id;
      };
      $q.notify({
        type: 'warning',
        timeout: 8000,
        multiLine: true,
        message: `Δεν στάλθηκαν ${failed.length}: ${failed.map((f) => `${nameOf(f.userId)} (${f.error})`).join(' · ')}`,
      });
    }
    selected.value = selected.value.filter((id) => !results.some((r) => r.ok && r.userId === id));
    await load();
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Η ενεργοποίηση απέτυχε.' });
  } finally {
    busy.value = false;
    pending.value = [];
  }
}

function confirmRevoke(r: StelexosAccessRow): void {
  $q.dialog({
    title: 'Αφαίρεση πρόσβασης',
    message: `Ο/Η ${r.lastName} ${r.firstName} δεν θα μπορεί πια να μπει. Μένει στο μητρώο όπως είναι, και μπορεί να ενεργοποιηθεί ξανά.`,
    cancel: { flat: true, noCaps: true, label: 'Άκυρο' },
    ok: { unelevated: true, noCaps: true, color: 'negative', label: 'Αφαίρεση' },
  }).onOk(() => {
    void (async () => {
      try {
        await del(`/accounts/${r.userId}`);
        $q.notify({ type: 'positive', message: 'Η πρόσβαση αφαιρέθηκε.' });
        await load();
      } catch (err) {
        $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
      }
    })();
  });
}

defineExpose({ reload: load });
</script>

<style scoped lang="scss">
.bulk-bar {
  padding: 10px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--q-primary) 12%, var(--surface, #fff));
  border: 1px solid color-mix(in srgb, var(--q-primary) 35%, transparent);
}
.klados-chip {
  border-radius: 8px;
  font-size: 12px;
  color: color-mix(in srgb, var(--chip) 75%, currentColor);
  background: color-mix(in srgb, var(--chip) 14%, transparent);
}
.name-link {
  color: inherit;
  text-decoration: none;
  font-weight: 500;
  &:hover {
    text-decoration: underline;
  }
}
.status-badge {
  padding: 4px 8px;
  border-radius: 999px;
}
.row--disabled {
  opacity: 0.75;
}

.tf-bulk-enter-active,
.tf-bulk-leave-active {
  transition:
    opacity var(--dur-short, 150ms) var(--ease-standard, ease),
    transform var(--dur-short, 150ms) var(--ease-standard, ease);
}
.tf-bulk-enter-from,
.tf-bulk-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
