<template>
  <q-page padding>
    <!-- Επισκόπηση όλων των ταμείων (μόνο υπερδιαχειριστής, στην προβολή Τοπικού) -->
    <div v-if="!inKlados && overview.length" class="row q-col-gutter-md q-mb-lg">
      <div v-for="o in overview" :key="o.label" class="col-6 col-sm-4 col-md-3">
        <q-card flat bordered class="full-height">
          <q-card-section class="q-pb-xs">
            <div class="text-caption text-grey-7">{{ o.label }}</div>
            <div class="text-h6" :class="o.balance < 0 ? 'text-negative' : 'text-weight-bold'" :style="o.balance >= 0 ? balanceStyle(o.kladosType) : {}">
              {{ formatEuro(o.balance) }}
            </div>
          </q-card-section>
          <q-card-section class="q-pt-none text-caption text-grey-7">
            <span class="text-positive">+{{ formatEuro(o.income) }}</span>
            ·
            <span class="text-negative">−{{ formatEuro(o.expense) }}</span>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <TreasuryView :klados="klados" />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { KLADOS_META, type KladosType } from '@trifylli/shared';
import TreasuryView from '../components/TreasuryView.vue';
import { useKladosScope } from '../composables/useKladosScope';
import { useAuthStore } from '../stores/auth';
import { get } from '../lib/api';
import { formatEuro } from '../lib/format';
import { inkOnWhite } from '../lib/color';

const { klados, inKlados } = useKladosScope();
const auth = useAuthStore();

interface Overview {
  kladosType: KladosType | null;
  label: string;
  income: number;
  expense: number;
  balance: number;
}
const overview = ref<Overview[]>([]);

onMounted(async () => {
  if (!inKlados.value && auth.isSuperAdmin) {
    try {
      overview.value = await get<Overview[]>('/treasury/overview');
    } catch {
      overview.value = [];
    }
  }
});

/** Το θετικό υπόλοιπο στο (αναγνώσιμο) χρώμα του κλάδου· το αρνητικό μένει κόκκινο (class). */
function balanceStyle(kladosType: KladosType | null): Record<string, string> {
  if (!kladosType) return {};
  return { color: inkOnWhite(KLADOS_META[kladosType].color) };
}
</script>
