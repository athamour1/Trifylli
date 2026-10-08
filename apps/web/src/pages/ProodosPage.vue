<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="page-title">Ατομική πρόοδος{{ inKlados ? ` — ${kladosLabel}` : '' }}</div>
      <q-select
        v-if="!inKlados"
        v-model="picked"
        :options="kladosOptions"
        label="Κλάδος"
        dense
        outlined
        emit-value
        map-options
        style="min-width: 200px"
      />
    </div>

    <!-- Οι Οδηγοί και οι Μεγάλοι Οδηγοί δεν έχουν σταθερό checklist: κάθε παιδί
         περνάει δικά του → ξεχωριστή καρτέλα αντί για πλέγμα. -->
    <OdigoiProodos v-if="klados === 'ODIGOI'" :klados="odigoiKlados" />
    <MegaloiProodos v-else-if="klados === 'MEGALOI_ODIGOI'" :klados="megaloiKlados" />
    <PouliaProodos v-else-if="klados === 'POULIA'" :klados="pouliaKlados" />
    <AsteriaProodos v-else-if="klados === 'ASTERIA'" :klados="asteriaKlados" />

    <PageState
      v-else
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!data?.members.length"
      empty-text="Δεν υπάρχουν μέλη ή στόχοι σε αυτόν τον κλάδο."
      empty-icon="trending_up"
      @retry="reload"
    >
      <!-- Πλέγμα μέλη × στόχοι: η μία εικόνα που χρειάζεται το συμβούλιο ομάδας. -->
      <div class="proodos-scroll">
        <table v-if="data" class="proodos-table">
          <thead>
            <tr>
              <th class="sticky-col">Μέλος</th>
              <th v-for="goal in data.goals" :key="goal.id" :title="goal.title">
                {{ goal.code }}
              </th>
              <th>Σύνολο</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in data.members" :key="member.memberId">
              <td class="sticky-col">
                <div class="text-body2">{{ member.lastName }} {{ member.firstName }}</div>
                <div class="text-caption text-grey-7">{{ member.subUnit ?? '—' }}</div>
              </td>
              <td v-for="cell in member.cells" :key="cell.goalId" class="text-center">
                <q-btn
                  round
                  dense
                  size="sm"
                  :flat="cell.status === 'DEN_XEKINISE'"
                  :unelevated="cell.status !== 'DEN_XEKINISE'"
                  :icon="STATUS_ICON[cell.status]"
                  :color="STATUS_COLOR[cell.status]"
                  :disable="!canWrite"
                  @click="cycle(member.memberId, cell)"
                >
                  <q-tooltip>{{ PROODOS_STATUS_LABEL[cell.status] }}</q-tooltip>
                </q-btn>
              </td>
              <td class="text-center">
                <q-badge
                  :color="member.progressPct >= 66 ? 'positive' : member.progressPct >= 33 ? 'warning' : 'grey-6'"
                  :label="`${member.progressPct}%`"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <q-expansion-item v-if="data" label="Επεξήγηση στόχων" icon="help_outline" class="q-mt-md">
        <q-list dense separator>
          <q-item v-for="goal in data.goals" :key="goal.id">
            <q-item-section avatar>
              <q-badge outline :label="goal.code" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ goal.title }}</q-item-label>
              <q-item-label caption>{{ goal.category ?? '—' }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-expansion-item>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { PROODOS_STATUS_LABEL, type KladosType, type ProodosStatus } from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import OdigoiProodos from '../components/OdigoiProodos.vue';
import MegaloiProodos from '../components/MegaloiProodos.vue';
import PouliaProodos from '../components/PouliaProodos.vue';
import AsteriaProodos from '../components/AsteriaProodos.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, get, put } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useKladosScope } from '../composables/useKladosScope';

/** Σταθερές τιμές για να περνούν τύπο-ασφαλώς τα props στις ειδικές καρτέλες. */
const odigoiKlados: KladosType = 'ODIGOI';
const megaloiKlados: KladosType = 'MEGALOI_ODIGOI';
const pouliaKlados: KladosType = 'POULIA';
const asteriaKlados: KladosType = 'ASTERIA';

interface Cell {
  goalId: string;
  status: ProodosStatus;
  completedAt: string | null;
  note: string | null;
}

interface Grid {
  kladosType: KladosType;
  goals: { id: string; code: string; title: string; category: string | null }[];
  members: {
    memberId: string;
    firstName: string;
    lastName: string;
    subUnit: string | null;
    cells: Cell[];
    completed: number;
    progressPct: number;
  }[];
}

const $q = useQuasar();
const auth = useAuthStore();
const {
  klados: routeKlados,
  inKlados,
  label: kladosLabel,
  options: kladosOptions,
} = useKladosScope();

const picked = ref<KladosType | null>(auth.kladoi[0]?.type ?? null);
const klados = computed(() => routeKlados.value ?? picked.value);

const canWrite = computed(() => (klados.value ? auth.can('proodos:write', klados.value) : false));

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<Grid>(`/proodos/klados/${klados.value}/grid`),
  { cacheKey: 'proodos', watchSources: [klados] },
);

/** Τα τρία στάδια κυκλικά: ένα πάτημα ανά αλλαγή, χωρίς διάλογο. */
const NEXT: Record<ProodosStatus, ProodosStatus> = {
  DEN_XEKINISE: 'SE_EXELIXI',
  SE_EXELIXI: 'OLOKLIROMENO',
  OLOKLIROMENO: 'DEN_XEKINISE',
};

async function cycle(memberId: string, cell: Cell): Promise<void> {
  const next = NEXT[cell.status];
  const previous = cell.status;
  cell.status = next; // αισιόδοξη ενημέρωση

  try {
    await put(`/proodos/member/${memberId}`, { goalId: cell.goalId, status: next });
  } catch (err) {
    cell.status = previous;
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία καταχώρησης.',
    });
  }
}

const STATUS_ICON: Record<ProodosStatus, string> = {
  DEN_XEKINISE: 'radio_button_unchecked',
  SE_EXELIXI: 'hourglass_bottom',
  OLOKLIROMENO: 'check',
};

const STATUS_COLOR: Record<ProodosStatus, string> = {
  DEN_XEKINISE: 'grey-5',
  SE_EXELIXI: 'warning',
  OLOKLIROMENO: 'positive',
};
</script>

<style scoped lang="scss">
// Ο πίνακας ξεφεύγει σε πλάτος με πολλούς στόχους· η στήλη ονομάτων μένει ορατή.
.proodos-scroll {
  overflow-x: auto;
}

.proodos-table {
  border-collapse: collapse;
  min-width: 100%;

  th,
  td {
    border: 1px solid var(--line-soft);
    padding: 4px 8px;
    white-space: nowrap;
  }

  th {
    background: var(--tint-soft);
    font-size: 0.75rem;
  }
}

.sticky-col {
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 1;
  text-align: left;
}
</style>
