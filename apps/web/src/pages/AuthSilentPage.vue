<template>
  <!-- Φορτώνεται μέσα σε κρυφό iframe· δεν βλέπει τίποτα ο χρήστης. -->
  <div />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { completeSilentRenew } from '../lib/oidc';

onMounted(() => {
  void completeSilentRenew().catch((error: unknown) => {
    // Το σφάλμα φτάνει στο parent window μέσω του UserManager· εδώ αρκεί log.
    console.error('Σιωπηλή ανανέωση απέτυχε:', error);
  });
});
</script>
