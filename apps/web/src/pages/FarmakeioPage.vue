<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="page-title">Φαρμακείο</div>
      <q-btn
        v-if="auth.can('farmakeio:write')"
        color="primary"
        icon="sync"
        label="Συγχρονισμός"
        :loading="syncing"
        :disable="!data?.configured"
        @click="sync"
      >
        <q-tooltip v-if="!data?.configured">
          Το Ouchtracker δεν έχει ρυθμιστεί σε αυτό το περιβάλλον.
        </q-tooltip>
      </q-btn>
    </div>

    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <template v-if="data">
        <q-banner v-if="!data.configured" dense class="bg-blue-1 q-mb-md">
          <template #avatar><q-icon name="info" color="info" /></template>
          Το Ouchtracker δεν είναι συνδεδεμένο. Τα είδη παρακάτω είναι τοπικές εγγραφές.
        </q-banner>

        <div class="text-caption text-grey-7 q-mb-sm">
          Τελευταίος συγχρονισμός: {{ data.lastSyncedAt ? formatDateTime(data.lastSyncedAt) : '—' }}
        </div>

        <q-tabs v-model="tab" dense align="left" class="text-primary q-mb-md" narrow-indicator>
          <q-tab name="inventory" :label="`Απόθεμα (${data.items.length})`" />
          <q-tab name="incidents" :label="`Περιστατικά (${incidents.length})`" />
        </q-tabs>

        <q-tab-panels v-model="tab" animated>
          <q-tab-panel name="inventory" class="q-pa-none">
            <q-list bordered separator class="rounded-borders">
              <q-item
                v-for="item in data.items"
                :key="item.id"
                :class="item.expired ? 'bg-red-1' : item.expiringSoon || item.lowStock ? 'bg-orange-1' : ''"
              >
                <q-item-section avatar>
                  <q-icon
                    :name="item.expired ? 'dangerous' : item.lowStock ? 'production_quantity_limits' : 'medication'"
                    :color="item.expired ? 'negative' : item.lowStock || item.expiringSoon ? 'warning' : 'grey-7'"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ item.name }}</q-item-label>
                  <q-item-label caption>
                    <span v-if="item.expiresAt">Λήξη {{ formatDate(item.expiresAt) }}</span>
                    <span v-if="item.storageLocation"> · {{ item.storageLocation }}</span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="text-right">
                    <div class="text-weight-medium">{{ item.qty }} {{ item.unit ?? '' }}</div>
                    <div v-if="item.minQty !== null" class="text-caption text-grey-7">
                      κατώφλι {{ item.minQty }}
                    </div>
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <q-tab-panel name="incidents" class="q-pa-none">
            <PageState :empty="!incidents.length" empty-text="Κανένα περιστατικό." empty-icon="health_and_safety">
              <q-list bordered separator class="rounded-borders">
                <q-item v-for="i in incidents" :key="i.id">
                  <q-item-section avatar>
                    <q-icon name="healing" :color="i.resolvedAt ? 'positive' : 'warning'" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ i.summary }}</q-item-label>
                    <q-item-label caption>
                      {{ formatDateTime(i.occurredAt) }}
                      <span v-if="i.patient"> · {{ i.patient.lastName }} {{ i.patient.firstName }}</span>
                      <span v-if="i.drasi"> · {{ i.drasi.title }}</span>
                    </q-item-label>
                    <q-item-label v-if="i.treatment" caption>Αντιμετώπιση: {{ i.treatment }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge
                      :color="i.resolvedAt ? 'positive' : 'warning'"
                      :label="i.resolvedAt ? 'Έκλεισε' : 'Ανοιχτό'"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </PageState>
          </q-tab-panel>
        </q-tab-panels>
      </template>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, get, post } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { useAuthStore } from '../stores/auth';

interface Inventory {
  configured: boolean;
  lastSyncedAt: string | null;
  items: {
    id: string;
    name: string;
    qty: number;
    unit: string | null;
    minQty: number | null;
    storageLocation: string | null;
    expiresAt: string | null;
    expired: boolean;
    expiringSoon: boolean;
    lowStock: boolean;
  }[];
}

interface Incident {
  id: string;
  summary: string;
  treatment: string | null;
  occurredAt: string;
  resolvedAt: string | null;
  patient: { firstName: string; lastName: string } | null;
  drasi: { id: string; title: string } | null;
}

const $q = useQuasar();
const auth = useAuthStore();
const tab = ref('inventory');
const syncing = ref(false);
const incidents = ref<Incident[]>([]);

const { data, loading, error, stale, reload } = useAsyncData(() => get<Inventory>('/farmakeio'), {
  cacheKey: 'farmakeio',
});

onMounted(async () => {
  try {
    incidents.value = await get<Incident[]>('/farmakeio/incidents');
  } catch {
    incidents.value = [];
  }
});

async function sync(): Promise<void> {
  syncing.value = true;
  try {
    const result = await post<{ created: number; updated: number; archived: number }>('/farmakeio/sync');
    await reload();
    $q.notify({
      type: 'positive',
      message: `Συγχρονισμός: ${result.created} νέα, ${result.updated} ενημερώσεις.`,
      ...(result.archived > 0 ? { caption: `${result.archived} αρχειοθετήθηκαν.` } : {}),
    });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof ApiError ? err.message : 'Αποτυχία συγχρονισμού.',
    });
  } finally {
    syncing.value = false;
  }
}
</script>
