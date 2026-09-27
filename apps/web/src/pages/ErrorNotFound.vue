<template>
  <q-page class="column items-center justify-center q-pa-xl">
    <q-icon name="explore_off" size="80px" color="grey-5" />
    <div class="text-h4 q-mt-md">404</div>
    <div class="text-subtitle1 text-grey-7 q-mb-lg">Η σελίδα δεν βρέθηκε.</div>
    <q-btn color="primary" icon="home" label="Αρχική" :to="{ name: 'dashboard' }" />
  </q-page>
</template>
