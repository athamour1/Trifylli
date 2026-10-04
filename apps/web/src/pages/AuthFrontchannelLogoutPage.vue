<template>
  <!-- Χωρίς UI: η σελίδα τρέχει μέσα σε κρυφό iframe του Authentik. -->
  <div />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

/**
 * Front-channel Single Logout.
 *
 * Το Authentik (2025.10+) φορτώνει αυτή τη διαδρομή σε κρυφό iframe όταν ο
 * χρήστης αποσυνδέεται από οποιαδήποτε εφαρμογή του ίδιου SSO, περνώντας
 * `?iss=&sid=`. Δεν μας χρειάζονται οι παράμετροι: αρκεί να τερματίσουμε τη δική
 * μας συνεδρία.
 *
 * Το iframe έχει δικό του, άδειο `sessionStorage` — δεν φτάνει τη συνεδρία OIDC
 * της κύριας καρτέλας (που ζει στο sessionStorage εκείνης). Γι' αυτό σηκώνουμε
 * ένα σήμα στο **localStorage** (κοινό σε όλες τις καρτέλες ίδιας προέλευσης):
 * η κύρια καρτέλα το ακούει με `storage` event και αποσυνδέεται άμεσα
 * (βλ. `stores/session.ts`).
 */
onMounted(() => {
  try {
    localStorage.setItem('trifylli:slo', String(Date.now()));
  } catch {
    // Ιδιωτική περιήγηση: δεν μπορούμε να στείλουμε σήμα· η κύρια καρτέλα θα
    // αποσυνδεθεί στην επόμενη αποτυχημένη σιωπηλή ανανέωση.
  }
});
</script>
