<template>
  <!--
    Η οθόνη που γεφυρώνει την εφαρμογή με το Authentik.

    Δείχνει το ίδιο λογότυπο, τα ίδια χρώματα και την ίδια τυπογραφία με τη
    σελίδα σύνδεσης του Authentik, ώστε η μετάβαση να μοιάζει με φόρτωση και όχι
    με αλλαγή προϊόντος.
  -->
  <q-page class="column items-center justify-center q-pa-lg auth-splash">
    <div class="column items-center">
      <q-avatar size="72px" color="primary" text-color="white" icon="eco" />
      <div class="text-h5 q-mt-md text-weight-medium">Trifylli</div>
      <div class="text-caption text-grey-7">Διαχείριση Τοπικού Τμήματος Σ.Ε.Ο.</div>

      <q-linear-progress
        v-if="!error"
        indeterminate
        color="primary"
        class="q-mt-lg"
        style="width: 220px"
        rounded
      />
      <div v-if="!error" class="text-caption text-grey-6 q-mt-sm">{{ message }}</div>
    </div>

    <q-card v-if="error" flat bordered class="q-mt-lg" style="max-width: 420px">
      <q-card-section class="row items-start no-wrap">
        <q-icon name="error_outline" color="negative" size="28px" class="q-mr-md" />
        <div>
          <div class="text-subtitle2">{{ errorTitle }}</div>
          <div class="text-body2 text-grey-8 q-mt-xs">{{ error }}</div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <slot name="actions" />
      </q-card-actions>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string;
    error?: string | null;
    errorTitle?: string;
  }>(),
  {
    message: 'Σύνδεση…',
    error: null,
    errorTitle: 'Κάτι πήγε στραβά',
  },
);
</script>

<style scoped lang="scss">
/* Το ίδιο ήρεμο φόντο με τη σελίδα σύνδεσης του Authentik, ώστε η μετάβαση να
   μη «χτυπά» οπτικά. */
.auth-splash {
  background: linear-gradient(135deg, #f1f3f2 0%, #e3ebe4 100%);
}
</style>
