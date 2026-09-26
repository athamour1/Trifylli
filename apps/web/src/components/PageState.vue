<template>
  <div>
    <q-banner v-if="stale" dense class="bg-grey-3 text-grey-9 q-mb-md">
      <template #avatar><q-icon name="history" /></template>
      Αποθηκευμένα δεδομένα — χωρίς σύνδεση δεν μπορούν να ανανεωθούν.
    </q-banner>

    <q-banner v-if="error" dense class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error_outline" /></template>
      {{ error }}
      <template #action>
        <q-btn flat dense label="Δοκιμή ξανά" @click="emit('retry')" />
      </template>
    </q-banner>

    <div v-if="loading" class="q-gutter-sm">
      <q-skeleton v-for="n in skeletons" :key="n" type="rect" height="56px" />
    </div>

    <div v-else-if="empty" class="column items-center q-pa-xl text-grey-7">
      <q-icon :name="emptyIcon" size="48px" class="q-mb-sm" />
      <div class="text-subtitle1">{{ emptyText }}</div>
      <slot name="empty-action" />
    </div>

    <slot v-else />
  </div>
</template>

<script setup lang="ts">
/** Κοινή μεταχείριση των τεσσάρων καταστάσεων κάθε οθόνης: φόρτωση, σφάλμα, κενό, δεδομένα. */
withDefaults(
  defineProps<{
    loading?: boolean;
    error?: string | null;
    stale?: boolean;
    empty?: boolean;
    emptyText?: string;
    emptyIcon?: string;
    skeletons?: number;
  }>(),
  {
    loading: false,
    error: null,
    stale: false,
    empty: false,
    emptyText: 'Δεν υπάρχουν εγγραφές.',
    emptyIcon: 'inbox',
    skeletons: 4,
  },
);

const emit = defineEmits<{ retry: [] }>();
</script>
