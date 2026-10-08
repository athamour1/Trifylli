<template>
  <q-page padding>
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row items-center">
        <q-icon
          :name="offline.online ? 'cloud_done' : 'cloud_off'"
          :color="offline.online ? 'positive' : 'grey-7'"
          size="32px"
          class="q-mr-md"
        />
        <div class="col">
          <div class="text-subtitle1">
            {{ offline.online ? 'Συνδεδεμένο' : 'Χωρίς σύνδεση' }}
          </div>
          <div class="text-caption text-grey-7">
            {{ offline.pending }} σε αναμονή · {{ offline.failed.length }} απέτυχαν
            <span v-if="offline.lastSyncAt"> · τελευταία προσπάθεια {{ formatDateTime(offline.lastSyncAt) }}</span>
          </div>
        </div>
        <q-btn
          color="primary"
          icon="sync"
          label="Συγχρονισμός τώρα"
          :loading="offline.syncing"
          :disable="!offline.online || offline.outbox.length === 0"
          @click="offline.flush()"
        />
      </q-card-section>
    </q-card>

    <div v-if="offline.outbox.length === 0" class="column items-center q-pa-xl text-grey-7">
      <q-icon name="check_circle" size="48px" color="positive" class="q-mb-sm" />
      <div class="text-subtitle1">Όλα συγχρονισμένα.</div>
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item v-for="item in offline.outbox" :key="item.id">
        <q-item-section avatar>
          <q-icon
            :name="item.attempts >= 5 ? 'error' : 'pending'"
            :color="item.attempts >= 5 ? 'negative' : 'warning'"
          />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ describe(item) }}</q-item-label>
          <q-item-label caption>
            {{ formatDateTime(item.createdAt) }}
            <span v-if="item.attempts > 0"> · {{ item.attempts }} προσπάθειες</span>
          </q-item-label>
          <q-item-label v-if="item.lastError" caption class="text-negative">
            {{ item.lastError }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-xs">
            <q-btn
              v-if="item.attempts >= 5"
              dense
              flat
              round
              icon="refresh"
              color="primary"
              @click="offline.retry(item.id)"
            >
              <q-tooltip>Δοκιμή ξανά</q-tooltip>
            </q-btn>
            <q-btn dense flat round icon="delete" color="negative" @click="confirmDiscard(item.id)">
              <q-tooltip>Απόρριψη</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <q-card flat bordered class="q-mt-lg">
      <q-card-section class="text-subtitle2 text-weight-medium">Πώς λειτουργεί</q-card-section>
      <q-separator />
      <q-card-section class="text-body2 text-grey-8">
        <p>
          Ό,τι καταχωρείτε χωρίς σύνδεση μπαίνει σε ουρά και στέλνεται αυτόματα μόλις
          επιστρέψει το δίκτυο.
        </p>
        <p>
          Για τα παρουσιολόγια κρατιέται η ώρα συμπλήρωσης στη συσκευή, όχι η ώρα αποστολής:
          μια καθυστερημένη αποστολή δεν σβήνει νεότερη διόρθωση που έγινε online.
        </p>
        <p class="q-mb-none">
          Καταχωρήσεις που απορρίφθηκαν από τον server (π.χ. έλλειψη δικαιώματος) δεν
          ξαναδοκιμάζονται αυτόματα — χρειάζονται δική σας απόφαση.
        </p>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import type { OutboxItem } from '@trifylli/shared';
import { formatDateTime } from '../lib/format';
import { useOfflineStore } from '../stores/offline';

const $q = useQuasar();
const offline = useOfflineStore();

/** Μεταφράζει μια εγγραφή ουράς σε κάτι αναγνωρίσιμο από τον χρήστη. */
function describe(item: OutboxItem): string {
  if (item.url.includes('/parousiologio/')) return 'Παρουσιολόγιο συγκέντρωσης';
  if (item.url.includes('/yliko/checkouts')) return 'Δέσμευση υλικού';
  if (item.url.includes('/proodos/')) return 'Καταχώρηση προόδου';
  if (item.url.includes('/symvoulia/')) return 'Πρακτικά συμβουλίου';
  if (item.url.includes('/plan')) return 'Σχεδιασμός συγκέντρωσης';
  return `${item.method} ${item.url}`;
}

function confirmDiscard(id: string): void {
  $q.dialog({
    title: 'Απόρριψη καταχώρησης',
    message: 'Η καταχώρηση θα διαγραφεί οριστικά και δεν θα σταλεί. Συνέχεια;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Απόρριψη', color: 'negative' },
  }).onOk(() => void offline.discard(id));
}
</script>
