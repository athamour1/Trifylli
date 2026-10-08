<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="page-title">{{ inKlados ? `Ημερολόγιο — ${kladosLabel}` : 'Κεντρικό ημερολόγιο' }}</div>
      <SegmentedToggle
        v-model="view"
        dense
        unelevated
        toggle-color="klados"
        toggle-text-color="klados-on"
        :options="[
          { label: 'Λίστα', value: 'list', icon: 'list' },
          { label: 'Μήνας', value: 'month', icon: 'calendar_month' },
        ]"
      />
    </div>

    <div class="row q-col-gutter-sm q-mb-md items-center">
      <!-- Σε προβολή κλάδου δεν υπάρχει επιλογή: ο κλάδος είναι η διαδρομή. -->
      <div v-if="!inKlados" class="col-12 col-sm-4">
        <q-select
          v-model="picked"
          :options="kladosOptions"
          label="Κλάδος"
          dense
          outlined
          emit-value
          map-options
          clearable
        />
      </div>
      <div v-if="view === 'month'" class="col-12 col-sm-auto">
        <q-btn-group flat>
          <q-btn icon="chevron_left" @click="shiftMonth(-1)" />
          <q-btn :label="monthLabel" no-caps @click="goToday" />
          <q-btn icon="chevron_right" @click="shiftMonth(1)" />
        </q-btn-group>
      </div>
    </div>

    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="isEmpty"
      empty-text="Κανένα γεγονός σε αυτό το διάστημα."
      empty-icon="event_busy"
      @retry="reload"
    >
      <!-- Λίστα ανά ημέρα: αυτό κοιτάζει κανείς στο κινητό. -->
      <div v-if="view === 'list'">
        <div v-for="day in grouped" :key="day.date" class="q-mb-md">
          <div class="text-weight-medium text-klados q-mb-xs">{{ formatDayHeading(day.date) }}</div>
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="event in day.events" :key="event.id" clickable v-ripple :to="event.href">
              <q-item-section avatar>
                <q-avatar :color="event.color" text-color="white" size="32px" :icon="KIND_ICON[event.kind]" />
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ event.title }}</q-item-label>
                <q-item-label caption>
                  <span v-if="!event.allDay">{{ formatTime(event.start) }} · </span>
                  <span v-if="event.kladosType">{{ KLADOS_LABEL[event.kladosType] }}</span>
                  <span v-else>Τοπικό</span>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </div>

      <!-- Πλέγμα μήνα: για τον προγραμματισμό, όχι για την καθημερινή χρήση. -->
      <div v-else class="calendar-grid">
        <div v-for="name in WEEKDAYS" :key="name" class="calendar-weekday">{{ name }}</div>
        <div
          v-for="cell in monthCells"
          :key="cell.iso"
          class="calendar-cell"
          :class="{ 'calendar-cell--muted': !cell.inMonth, 'calendar-cell--today': cell.isToday }"
        >
          <div class="calendar-daynum">{{ cell.day }}</div>
          <router-link
            v-for="event in cell.events"
            :key="event.id"
            :to="event.href"
            class="calendar-event"
            :style="{ backgroundColor: event.color, color: readableOn(event.color) }"
            :title="event.title"
          >
            {{ event.title }}
          </router-link>
        </div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { KLADOS_LABEL, KLADOS_META, type CalendarEvent, type KladosType } from '@trifylli/shared';
import { readableOn } from '../lib/color';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { formatTime } from '../lib/format';
import { useKladosScope } from '../composables/useKladosScope';

const {
  klados: routeKlados,
  inKlados,
  label: kladosLabel,
  options: kladosOptions,
} = useKladosScope();

const view = ref<'list' | 'month'>('list');
/** Επιλογή του χρήστη — έχει νόημα μόνο στην προβολή Τοπικού. */
const picked = ref<KladosType | null>(null);
const anchor = ref(new Date());

/** Ο κλάδος της διαδρομής υπερισχύει της επιλογής. */
const effectiveKlados = computed(() => routeKlados.value ?? picked.value);

/** Το παράθυρο του αιτήματος: ο μήνας στην προβολή μήνα, 90 ημέρες στη λίστα. */
const range = computed(() => {
  if (view.value === 'month') {
    const start = new Date(anchor.value.getFullYear(), anchor.value.getMonth(), 1);
    const end = new Date(anchor.value.getFullYear(), anchor.value.getMonth() + 1, 0, 23, 59, 59);
    return { from: start, to: end };
  }
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 90);
  return { from, to };
});

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<CalendarEvent[]>('/calendar/events', {
      params: {
        from: range.value.from.toISOString(),
        to: range.value.to.toISOString(),
        ...(effectiveKlados.value ? { klados: effectiveKlados.value } : {}),
      },
    }),
  {
    cacheKey: 'calendar',
    watchSources: [view, effectiveKlados, anchor],
  },
);

const events = computed(() => data.value ?? []);
const isEmpty = computed(() => !loading.value && events.value.length === 0);

const grouped = computed(() => {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events.value) {
    const day = event.start.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, events: items }));
});

const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];

const monthLabel = computed(() =>
  anchor.value.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' }),
);

/**
 * Το πλέγμα ξεκινά πάντα Δευτέρα και γεμίζει πλήρεις εβδομάδες, ώστε οι στήλες
 * να ευθυγραμμίζονται ανεξάρτητα από τη μέρα που πέφτει η 1η του μήνα.
 */
const monthCells = computed(() => {
  const year = anchor.value.getFullYear();
  const month = anchor.value.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Δευτέρα = 0
  const start = new Date(year, month, 1 - offset);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events.value) {
    const day = event.start.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: iso === todayIso,
      events: byDay.get(iso) ?? [],
    };
  });
});

function shiftMonth(delta: number): void {
  anchor.value = new Date(anchor.value.getFullYear(), anchor.value.getMonth() + delta, 1);
}

function goToday(): void {
  anchor.value = new Date();
}

function formatDayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const KIND_ICON: Record<CalendarEvent['kind'], string> = {
  DRASI: 'hiking',
  SYGGENTRWSH: 'schedule',
  SYMVOULIO: 'forum',
};

// Το KLADOS_META χρησιμοποιείται από το API για τα χρώματα· εδώ μόνο ως τύπος.
void KLADOS_META;
</script>

<style scoped lang="scss">
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.calendar-weekday {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 0;
  color: var(--klados-ink);
}

.calendar-cell {
  min-height: 84px;
  border: 1px solid var(--line-soft);
  border-radius: 4px;
  padding: 2px 3px;
  overflow: hidden;

  &--muted {
    opacity: 0.4;
  }

  &--today {
    border-color: var(--klados-color);
    border-width: 2px;
  }
}

.calendar-daynum {
  font-size: 0.7rem;
  text-align: right;
  color: var(--text-soft);
}

.calendar-event {
  display: block;
  font-size: 0.65rem;
  line-height: 1.2;
  border-radius: 3px;
  padding: 1px 3px;
  margin-bottom: 2px;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
