<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div>
        <div class="page-title">Καλώς ήρθες, {{ auth.user?.firstName }}</div>
        <div class="text-caption text-grey-7">{{ auth.roleLabel }} · {{ auth.topiko?.name }}</div>
      </div>
    </div>

    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="stat-card">
            <q-card-section>
              <q-icon name="event_upcoming" class="stat-icon text-primary" />
              <div class="stat-label">Επερχόμενα (7 ημέρες)</div>
              <div class="stat-value text-primary">{{ data?.upcoming.length ?? 0 }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="stat-card">
            <q-card-section>
              <q-icon name="hiking" class="stat-icon text-secondary" />
              <div class="stat-label">Δράσεις σε εξέλιξη</div>
              <div class="stat-value text-secondary">{{ data?.ongoingDraseis ?? 0 }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="stat-card" :class="{ 'bg-orange-1': (data?.unplannedSyggentrwseis ?? 0) > 0 }">
            <q-card-section>
              <q-icon name="edit_calendar" class="stat-icon text-warning" />
              <div class="stat-label">Συγκεντρώσεις χωρίς πρόγραμμα</div>
              <div class="stat-value text-warning">{{ data?.unplannedSyggentrwseis ?? 0 }}</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="stat-card" :class="{ 'bg-blue-1': offline.hasPending }">
            <q-card-section>
              <q-icon :name="offline.hasPending ? 'cloud_upload' : 'cloud_done'" class="stat-icon text-info" />
              <div class="stat-label">Σε αναμονή συγχρονισμού</div>
              <div class="stat-value" :class="offline.hasPending ? 'text-info' : 'text-grey-6'">{{ offline.pending }}</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div class="section-title q-mt-lg q-mb-sm">Τι έρχεται</div>

      <q-list v-if="data?.upcoming.length" bordered separator class="rounded-borders">
        <q-item
          v-for="event in data.upcoming"
          :key="`${event.kind}-${event.id}`"
          clickable
          v-ripple
          :to="event.href"
        >
          <q-item-section avatar>
            <q-avatar :color="event.color" text-color="white" :icon="KIND_ICON[event.kind]" size="36px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ event.title }}</q-item-label>
            <q-item-label caption>
              {{ formatDateTime(event.start) }}
              <span v-if="event.kladosType"> · {{ KLADOS_LABEL[event.kladosType] }}</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge outline :label="KIND_LABEL[event.kind]" />
          </q-item-section>
        </q-item>
      </q-list>

      <div v-else class="text-grey-7 q-pa-md">Καμία δραστηριότητα την επόμενη εβδομάδα.</div>

      <div class="section-title q-mt-lg q-mb-sm">Γρήγορες ενέργειες</div>
      <!-- Ένα σετ ανά κλάδο: ο διαχειριστής κλάδου βλέπει ένα, ο υπερδιαχειριστής
           τέσσερα και δεν χρειάζεται να διαλέξει κλάδο μέσα στη σελίδα. -->
      <div v-for="klados in auth.kladoi" :key="klados.type" class="q-mb-sm">
        <div class="text-caption text-grey-7 q-mb-xs">{{ klados.label }}</div>
        <div class="q-gutter-sm">
          <q-btn
            color="primary"
            icon="fact_check"
            label="Συγκεντρώσεις"
            :to="{ name: 'klados-syggentrwseis', params: { klados: klados.type } }"
          />
          <q-btn
            color="secondary"
            icon="inventory_2"
            label="Υλικό"
            :to="{ name: 'klados-yliko', params: { klados: klados.type } }"
          />
          <q-btn
            outline
            icon="event"
            label="Ημερολόγιο"
            :to="{ name: 'klados-calendar', params: { klados: klados.type } }"
          />
        </div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { KLADOS_LABEL, type CalendarEvent } from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';
import { formatDateTime } from '../lib/format';

interface Dashboard {
  upcoming: CalendarEvent[];
  ongoingDraseis: number;
  unplannedSyggentrwseis: number;
}

const auth = useAuthStore();
const offline = useOfflineStore();

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<Dashboard>('/calendar/dashboard'),
  { cacheKey: 'dashboard' },
);

const KIND_ICON: Record<CalendarEvent['kind'], string> = {
  DRASI: 'hiking',
  SYGGENTRWSH: 'schedule',
  SYMVOULIO: 'forum',
};

const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  DRASI: 'Δράση',
  SYGGENTRWSH: 'Συγκέντρωση',
  SYMVOULIO: 'Συμβούλιο',
};
</script>
