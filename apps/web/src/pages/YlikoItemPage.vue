<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <q-btn flat dense no-caps icon="arrow_back" label="Πίσω" @click="goBack" />
    </div>

    <q-card flat bordered class="rounded-borders">
      <q-card-section>
        <YlikoDetail :yliko-id="id" :scope-klados="itemKlados" @loaded="onLoaded" @forbidden="onForbidden" />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { KladosType } from '@trifylli/shared';
import YlikoDetail from '../components/YlikoDetail.vue';
import { useKladosThemeStore } from '../stores/klados-theme';

const kladosTheme = useKladosThemeStore();

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));

// Η σελίδα του QR δεν έχει εμβέλεια διαδρομής· η φυσική εμβέλεια είναι ο ίδιος ο
// κλάδος του υλικού (ή Τοπικό για κεντρικό) — εκεί βάφεται η σελίδα και εκεί
// χρεώνεται τυχόν επισκευή.
const itemKlados = ref<KladosType | null>(null);
function onLoaded(klados: KladosType | null): void {
  itemKlados.value = klados;
  kladosTheme.declare(klados);
}

function onForbidden(): void {
  void router.replace({ name: 'forbidden', query: { from: route.fullPath } });
}

function goBack(): void {
  if (window.history.length > 1) router.back();
  else void router.push({ name: 'yliko' });
}
</script>
