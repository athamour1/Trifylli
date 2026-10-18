<template>
  <!-- Συμβούλιο κλάδου ή Τοπικού. Τα συμβούλια μιας δράσης ανοίγουν μέσα στη δράση (βλ. DrasiPage). -->
  <q-page padding>
    <SymvoulioView :symvoulio-id="String(route.params.id)" />
  </q-page>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import SymvoulioView from '../components/SymvoulioView.vue';

const route = useRoute();
</script>
