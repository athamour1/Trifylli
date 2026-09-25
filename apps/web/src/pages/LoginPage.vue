<template>
  <!--
    Δεν υπάρχει κουμπί «σύνδεση» στη συνηθισμένη περίπτωση.

    Ο χρήστης δεν διάλεξε να βρεθεί εδώ — τον έστειλε ο guard επειδή δεν έχει
    συνεδρία. Ένα ενδιάμεσο κλικ δεν προσθέτει καμία πληροφορία· απλώς κόβει τη
    ροή. Γι' αυτό η ανακατεύθυνση ξεκινά αμέσως και η οθόνη δείχνει ότι κάτι
    φορτώνει, όχι ότι κάτι περιμένει.

    Το κουμπί εμφανίζεται μόνο όταν χρειάζεται πραγματικά απόφαση: αποτυχία
    ανακατεύθυνσης, ή λογαριασμός που δεν υπάρχει.
  -->
  <AuthSplash
    :message="message"
    :error="blockingError"
    :error-title="errorTitle"
  >
    <template #actions>
      <q-btn
        color="primary"
        icon="login"
        :label="reason === 'forbidden' ? 'Σύνδεση με άλλον λογαριασμό' : 'Δοκιμή ξανά'"
        :loading="busy"
        @click="signIn"
      />
    </template>
  </AuthSplash>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AuthSplash from '../components/AuthSplash.vue';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const session = useSessionStore();

const busy = ref(false);
const redirectError = ref<string | null>(null);

/** `forbidden` ⇒ το token ήταν έγκυρο αλλά ο λογαριασμός δεν υπάρχει/ανακλήθηκε. */
const reason = computed(() => route.query.reason as string | undefined);

const message = computed(() => 'Μεταφορά στη σελίδα σύνδεσης…');

const errorTitle = computed(() =>
  reason.value === 'forbidden' ? 'Δεν έχετε πρόσβαση' : 'Η σύνδεση δεν ξεκίνησε',
);

const blockingError = computed(() => {
  if (reason.value === 'forbidden') {
    return (
      'Η ταυτοποίηση πέτυχε, αλλά δεν υπάρχει λογαριασμός για εσάς σε αυτό το Τοπικό. ' +
      'Ζητήστε από τον υπερδιαχειριστή να σας προσθέσει.'
    );
  }
  return redirectError.value ?? session.error;
});

async function signIn(): Promise<void> {
  busy.value = true;
  redirectError.value = null;
  try {
    await session.signIn((route.query.returnTo as string | undefined) ?? '/');
  } catch (error) {
    redirectError.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  // Με `reason=forbidden` η επανάληψη θα ξανααποτύχει με τον ίδιο λογαριασμό:
  // εκεί ο χρήστης πρέπει να διαβάσει και να αποφασίσει.
  if (reason.value === 'forbidden' || !session.enabled) return;
  void signIn();
});
</script>
