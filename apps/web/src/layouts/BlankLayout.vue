<template>
  <!-- Λιτό layout για τις σελίδες της ροής σύνδεσης: ο χρήστης δεν έχει ακόμη
       προφίλ, οπότε δεν υπάρχει μενού να δείξουμε — αλλά το `q-page` χρειάζεται
       `q-layout` για να τοποθετηθεί. -->
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>
