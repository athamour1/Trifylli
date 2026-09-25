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
import { completeLogin } from '../lib/oidc';
import { useAuthStore } from '../stores/auth';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const auth = useAuthStore();
const error = ref<string | null>(null);

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
    error.value = err instanceof Error ? err.message : String(err);
  }
});
</script>
