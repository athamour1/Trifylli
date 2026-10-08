<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div>
        <div class="page-title">Καλώς ήρθες, {{ auth.user?.firstName }}</div>
        <div class="text-caption text-grey-7">{{ auth.roleLabel }} · {{ auth.topiko?.name }}</div>
      </div>
    </div>

    <!-- Οι δράσεις όπου είμαι στέλεχος — για τον εξωτερικό, το μόνο που υπάρχει. -->
    <template v-if="myDraseis.length || auth.isExternal">
      <div class="section-title q-mb-sm">Οι δράσεις μου</div>
      <div v-if="!myDraseis.length" class="text-caption text-grey-7 q-mb-lg">Καμία ανοιχτή δράση αυτή τη στιγμή.</div>
      <div v-else class="tf-card-grid q-mb-lg" style="--tf-min: 260px">
        <div v-for="d in myDraseis" :key="d.id">
          <q-card
            flat bordered class="full-height cursor-pointer my-drasi" :style="kladosVars(d.klados)"
            role="link" tabindex="0" @click="router.push({ name: 'drasi', params: { id: d.id } })"
            @keydown.enter.prevent="router.push({ name: 'drasi', params: { id: d.id } })"
          >
            <q-card-section>
              <div class="row items-center no-wrap">
                <q-icon name="hiking" size="20px" class="q-mr-sm my-drasi__icon" />
                <div class="text-subtitle1 text-weight-medium ellipsis col">{{ d.title }}</div>
                <q-badge v-if="d.status === 'KLEISTI'" color="grey-7" label="Κλειστή" />
              </div>
              <div class="text-caption text-grey-7 q-mt-xs">{{ formatDateRange(d.dateStart, d.dateEnd) }}</div>
              <div v-if="d.roles.length" class="row q-gutter-xs q-mt-sm">
                <q-chip v-for="r in d.roles" :key="r" dense square class="q-ma-none my-drasi__role" :label="DRASI_ROLE_LABEL[r]" />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </template>

    <PageState v-if="!auth.isExternal" :loading="loading" :error="error" :stale="stale" @retry="reload">
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
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DRASI_ROLE_LABEL, KLADOS_LABEL, type CalendarEvent, type MyDrasiView } from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';
import { formatDateRange, formatDateTime } from '../lib/format';
import { kladosVars } from '../lib/klados-theme';

interface Dashboard {
  upcoming: CalendarEvent[];
  ongoingDraseis: number;
  unplannedSyggentrwseis: number;
}

const auth = useAuthStore();
const offline = useOfflineStore();

const router = useRouter();
// Ο εξωτερικός δεν έχει ημερολόγιο κλάδου — μόνο τις δράσεις του.
const { data, loading, error, stale, reload } = useAsyncData(
  () => get<Dashboard>('/calendar/dashboard'),
  { cacheKey: 'dashboard', immediate: !auth.isExternal },
);
const myDraseis = ref<MyDrasiView[]>([]);
onMounted(async () => {
  try {
    myDraseis.value = await get<MyDrasiView[]>('/draseis/mine');
  } catch {
    // Χωρίς τη λίστα, η Αρχική δουλεύει όπως πριν.
  }
});

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

<style scoped>
.my-drasi__icon {
  color: var(--klados-ink, var(--q-primary));
}
.my-drasi__role {
  border-radius: 8px;
  color: var(--klados-ink, var(--q-primary));
  background: color-mix(in srgb, var(--klados-color, var(--q-primary)) 12%, transparent);
}
</style>
