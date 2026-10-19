<template>
  <q-dialog :model-value="open" persistent>
    <q-card class="tracking-notice">
      <q-card-section>
        <div class="text-h6">Καταγραφή χρήσης</div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <p>Για να βρίσκουμε και να διορθώνουμε γρήγορα προβλήματα, η εφαρμογή καταγράφει:</p>
        <ul>
          <li v-if="replay">
            <strong>τις συνεδρίες σου</strong>: ό,τι βλέπεις και κάνεις στην οθόνη, μαζί με ό,τι γράφεις στα πεδία·
          </li>
          <li v-if="analytics"><strong>ανώνυμα στατιστικά</strong> επισκέψεων, χωρίς cookies·</li>
          <li><strong>σφάλματα</strong> και τεχνικά στοιχεία (σελίδα, browser, έκδοση).</li>
        </ul>
        <p class="q-mb-none">
          Τα βλέπει μόνο ο υπεύθυνος του συστήματος του Τοπικού, μένουν στον δικό μας server και σβήνονται μέσα σε
          30 ημέρες.
        </p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn unelevated color="klados" label="Κατάλαβα, συνεχίζω" :loading="saving" @click="accept" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../stores/auth';
import { replayConfigured, startReplay } from '../lib/replay';
import { UMAMI_URL, UMAMI_WEBSITE_ID } from '../lib/runtime-config';

/**
 * Η ενημέρωση για καταγραφή συνεδριών (replay) και analytics: μία φορά ανά
 * λογαριασμό και έκδοση κειμένου (`trackingNotice` του /me — η αποδοχή γράφεται
 * στον server). Το replay ξεκινά μόνο μετά την αποδοχή. Όταν δεν είναι ρυθμισμένο
 * ούτε replay ούτε analytics, δεν εμφανίζεται καθόλου.
 */
const $q = useQuasar();
const auth = useAuthStore();
const saving = ref(false);

const replay = replayConfigured();
const analytics = !!UMAMI_URL && !!UMAMI_WEBSITE_ID;
const open = computed(() => (replay || analytics) && auth.trackingNoticePending);

function startIfAccepted(): void {
  const user = auth.user;
  if (!user || !replay || auth.profile?.trackingNotice?.accepted !== true) return;
  void startReplay({ id: user.id, email: user.email, name: auth.displayName });
}

async function accept(): Promise<void> {
  saving.value = true;
  try {
    await auth.acceptTrackingNotice();
    startIfAccepted();
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν αποθηκεύτηκε — δοκίμασε ξανά.' });
  } finally {
    saving.value = false;
  }
}

// Λογαριασμός που έχει ήδη αποδεχτεί: το replay ξεκινά μόλις φορτώσει το προφίλ.
watch(() => auth.profile?.trackingNotice?.accepted, startIfAccepted, { immediate: true });
</script>

<style scoped>
.tracking-notice {
  max-width: 480px;
}
</style>
