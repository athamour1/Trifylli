<template>
  <AuthSplash message="Ολοκλήρωση σύνδεσης…" :error="error" error-title="Η σύνδεση απέτυχε">
    <template #actions>
      <q-btn color="primary" label="Δοκιμή ξανά" :to="{ name: 'login' }" />
    </template>
  </AuthSplash>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthSplash from '../components/AuthSplash.vue';
import { completeLogin, login } from '../lib/oidc';
import { useAuthStore } from '../stores/auth';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const auth = useAuthStore();
const error = ref<string | null>(null);

/**
 * Σφάλματα του oidc-client-ts που σημαίνουν «δεν βρήκα την αίτηση που ξεκίνησε
 * αυτή τη σύνδεση», όχι «η σύνδεση απορρίφθηκε».
 *
 * Συμβαίνει όταν η επιστροφή προσγειώνεται αλλού από εκεί που ξεκίνησε: ο
 * χρήστης άνοιξε τον σύνδεσμο «ορισμός κωδικού» από το email σε άλλη καρτέλα ή
 * άλλη συσκευή, άργησε τόσο που η αίτηση καθαρίστηκε, ή καθάρισε τα δεδομένα
 * του browser στο ενδιάμεσο.
 */
function isStaleStateError(message: string): boolean {
  return /no matching state found|no state in response|state not found/i.test(message);
}

/**
 * Φρουρός βρόχου: η επανάληψη επιτρέπεται **μία** φορά ανά καρτέλα.
 *
 * Αν το Authentik μας στέλνει πίσω και δεύτερη φορά με άκυρο state, το
 * πρόβλημα δεν λύνεται με άλλη ανακατεύθυνση — τότε ο χρήστης πρέπει να δει
 * μήνυμα αντί να πηγαινοέρχεται.
 */
const RETRY_KEY = 'trifylli:authRetry';

function alreadyRetried(): boolean {
  try {
    return window.sessionStorage.getItem(RETRY_KEY) === '1';
  } catch {
    return false;
  }
}

function markRetry(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(RETRY_KEY, '1');
    else window.sessionStorage.removeItem(RETRY_KEY);
  } catch {
    // Ιδιωτική περιήγηση: χωρίς φρουρό, αλλά και χωρίς βρόχο — η δεύτερη
    // αποτυχία θα δείξει απλώς το μήνυμα.
  }
}

/**
 * Η σελίδα επιστροφής από το Authentik.
 *
 * Ανταλλάσσει τον κωδικό με tokens και **φορτώνει το προφίλ πριν** την
 * ανακατεύθυνση. Η σειρά έχει σημασία για δύο λόγους: χωρίς έγκυρο token το
 * `/me` θα γύριζε 401 και ο χρήστης θα ξαναρχόταν εδώ σε βρόχο· και αν
 * προχωρούσαμε πριν φορτώσει το προφίλ, η σελίδα προορισμού θα εμφανιζόταν
 * στιγμιαία άδεια. Έτσι ο χρήστης βλέπει τη δουλειά του ήδη γεμάτη.
 */
onMounted(async () => {
  try {
    const { user, returnTo } = await completeLogin();
    markRetry(false);
    session.setUser(user);

    await auth.load();
    if (auth.error) {
      // Ταυτοποιήθηκε αλλά δεν έχει λογαριασμό: καθαρό μήνυμα αντί για κενή οθόνη.
      await session.signOutLocally();
      await router.replace({ name: 'login', query: { reason: 'forbidden' } });
      return;
    }

    await router.replace(returnTo);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Χαμένη αίτηση σύνδεσης: ο χρήστης έχει ήδη συνεδρία στο Authentik (μόλις
    // όρισε κωδικό ή συνδέθηκε), οπότε μια **νέα** αίτηση γυρίζει αμέσως πίσω
    // χωρίς να ξαναγράψει τίποτα. Σκέτο μήνυμα λάθους εδώ θα ήταν αδιέξοδο για
    // κάτι που διορθώνεται μόνο του.
    if (isStaleStateError(message) && !alreadyRetried()) {
      markRetry(true);
      await login();
      return;
    }

    markRetry(false);
    error.value = message;
  }
});
</script>
