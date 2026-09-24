<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useOfflineStore } from './stores/offline';

const offline = useOfflineStore();

// Η ουρά ξεκινά με την εφαρμογή, όχι με το πρώτο άνοιγμα οθόνης: μετά από
// επανεκκίνηση σε κατασκήνωση θέλουμε να φύγουν τα δεδομένα μόλις βρεθεί δίκτυο.
onMounted(() => {
  void offline.init();
});
</script>
