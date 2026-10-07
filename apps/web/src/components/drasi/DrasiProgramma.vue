<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <div class="text-caption text-grey-7 col">
        Κάθε ημέρα έχει το δικό της ωρολόγιο — με υπεύθυνο διεξαγωγής και υλοποίησης ανά κομμάτι, markdown
        περιγραφή και απαιτούμενο υλικό. Ανοίγει στη σελίδα σχεδιασμού.
      </div>
      <q-btn
        v-if="canWrite"
        color="klados"
        text-color="klados-on"
        unelevated
        icon="calendar_add_on"
        :label="days.length ? 'Συμπλήρωση ημερών' : 'Δημιουργία ημερών'"
        :loading="creating"
        @click="createDays"
      />
    </div>

    <q-inner-loading :showing="loading" />

    <div v-if="!loading && !days.length" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="schedule" size="40px" class="block q-mb-sm" />
      Δεν υπάρχει πρόγραμμα ακόμη.
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item v-for="(d, i) in days" :key="d.id" clickable :to="{ name: 'syggentrwsh', params: { id: d.id } }">
        <q-item-section avatar>
          <q-avatar size="40px" class="bg-klados text-klados-on text-weight-bold">{{ i + 1 }}</q-avatar>
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ d.title ?? formatDate(d.date) }}</q-item-label>
          <q-item-label caption>
            {{ formatDate(d.date) }}
            <span v-if="d.startTime"> · {{ formatTime(d.startTime) }}</span>
            <span v-if="d.location"> · {{ d.location }}</span>
            <span v-if="d.responsibles.length"> · {{ d.responsibles.join(', ') }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row items-center q-gutter-xs">
            <q-badge v-if="d.blocks" outline color="grey-7" :label="`${d.blocks} κομμάτια · ${formatDuration(d.totalDurationMin)}`" />
            <q-badge v-else outline color="orange-7" label="κενό" />
            <q-btn flat dense round icon="fact_check" color="klados" :to="{ name: 'parousiologio', params: { id: d.id } }" @click.stop>
              <q-tooltip>Παρουσιολόγιο ημέρας</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { DrasiDayView } from '@trifylli/shared';
import { ApiError, get, post } from '../../lib/api';
import { formatDate, formatDuration, formatTime } from '../../lib/format';

const props = defineProps<{ drasiId: string; canWrite: boolean }>();
const $q = useQuasar();
const loading = ref(false);
const creating = ref(false);
const days = ref<DrasiDayView[]>([]);

async function reload(): Promise<void> {
  loading.value = true;
  try {
    days.value = await get<DrasiDayView[]>(`/draseis/${props.drasiId}/days`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης προγράμματος.' });
  } finally {
    loading.value = false;
  }
}
onMounted(reload);

async function createDays(): Promise<void> {
  creating.value = true;
  try {
    const r = await post<{ created: number }>(`/draseis/${props.drasiId}/days`, {});
    $q.notify({ type: r.created ? 'positive' : 'info', message: r.created ? `Δημιουργήθηκαν ${r.created} ημέρες.` : 'Όλες οι ημέρες υπάρχουν ήδη.' });
    await reload();
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
  } finally {
    creating.value = false;
  }
}
</script>
