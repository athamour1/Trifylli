<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated class="bg-klados text-klados-bar">
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Μενού" @click="drawer = !drawer" />

        <q-toolbar-title class="text-weight-medium">
          <span v-if="activeKlados" class="text-weight-regular">
            {{ activeKlados.label }} ·
          </span>
          {{ pageTitle }}
        </q-toolbar-title>

        <!-- Η κατάσταση δικτύου είναι μόνιμα ορατή: στην κατασκήνωση το
             «στάλθηκε;» είναι η πιο συχνή ερώτηση. -->
        <q-chip
          v-if="!offline.online || offline.hasPending"
          :color="offline.online ? 'warning' : 'grey-8'"
          text-color="white"
          :icon="offline.online ? 'cloud_upload' : 'cloud_off'"
          clickable
          @click="router.push({ name: 'sync' })"
        >
          {{ offline.online ? `${offline.pending} σε αναμονή` : 'Χωρίς σύνδεση' }}
        </q-chip>

        <q-btn flat dense round icon="account_circle">
          <q-menu>
            <q-list style="min-width: 240px">
              <q-item-label header>{{ auth.displayName }}</q-item-label>
              <q-item>
                <q-item-section>
                  <q-item-label caption>{{ auth.roleLabel }}</q-item-label>
                  <q-item-label caption>{{ auth.topiko?.name }}</q-item-label>
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item v-if="auth.currentPeriod">
                <q-item-section>
                  <q-item-label caption>Περίοδος</q-item-label>
                  <q-item-label>{{ auth.currentPeriod.label }}</q-item-label>
                </q-item-section>
              </q-item>
              <template v-if="session.enabled">
                <q-separator />
                <q-item clickable v-close-popup @click="confirmSignOut">
                  <q-item-section avatar><q-icon name="logout" /></q-item-section>
                  <q-item-section>Αποσύνδεση</q-item-section>
                </q-item>
              </template>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered :width="272">
      <q-list padding>
        <q-item clickable v-ripple :to="{ name: 'dashboard' }" exact>
          <q-item-section avatar><q-icon name="dashboard" /></q-item-section>
          <q-item-section>Αρχική</q-item-section>
        </q-item>

        <q-separator spaced />

        <!-- Ένα dropdown ανά κλάδο, με τις επιλογές του κλάδου μέσα.
             Ο υπερδιαχειριστής βλέπει και τους τέσσερις· ο διαχειριστής κλάδου
             μόνο τον δικό του, οπότε ανοίγει αυτόματα. -->
        <q-expansion-item
          v-for="klados in auth.kladoi"
          :key="klados.type"
          :icon="klados.icon"
          :label="klados.label"
          :header-style="{ color: inkOnWhiteLarge(klados.color) }"
          :style="kladosVars(klados.type)"
          :default-opened="auth.kladoi.length === 1 || activeKlados?.type === klados.type"
          expand-separator
        >
          <q-item
            v-for="link in kladosLinks"
            :key="`${klados.type}-${link.name}`"
            clickable
            v-ripple
            :inset-level="0.4"
            :to="{ name: link.name, params: { klados: klados.type } }"
            active-class="klados-active"
          >
            <q-item-section avatar>
              <q-icon :name="link.icon" size="20px" />
            </q-item-section>
            <q-item-section>{{ link.title }}</q-item-section>
          </q-item>
        </q-expansion-item>

        <!-- Το Τοπικό ως ένα dropdown, στο πράσινο της εφαρμογής. -->
        <q-expansion-item
          v-if="topikoLinks.length"
          icon="location_city"
          label="Τοπικό"
          :header-style="{ color: 'var(--q-primary)' }"
          :style="topikoVars"
          :default-opened="isTopikoRoute"
          expand-separator
        >
          <q-item
            v-for="link in topikoLinks"
            :key="link.name"
            clickable
            v-ripple
            :inset-level="0.4"
            :to="{ name: link.name }"
            active-class="klados-active"
          >
            <q-item-section avatar>
              <q-icon :name="link.icon" size="20px" />
            </q-item-section>
            <q-item-section>{{ link.title }}</q-item-section>
          </q-item>
        </q-expansion-item>

        <q-separator spaced />
        <q-item clickable v-ripple :to="{ name: 'sync' }">
          <q-item-section avatar>
            <q-icon name="sync" :color="offline.hasPending ? 'warning' : undefined" />
          </q-item-section>
          <q-item-section>Συγχρονισμός</q-item-section>
          <q-item-section v-if="offline.hasPending" side>
            <q-badge color="warning" :label="offline.pending" />
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <q-banner v-if="!offline.online" dense class="bg-grey-9 text-white offline-banner">
        <template #avatar><q-icon name="cloud_off" /></template>
        Λειτουργία χωρίς σύνδεση — βλέπετε αποθηκευμένα δεδομένα. Οι καταχωρήσεις θα σταλούν αυτόματα.
      </q-banner>

      <q-banner v-if="auth.error" dense class="bg-negative text-white">
        <template #avatar><q-icon name="error" /></template>
        {{ auth.error }}
        <template #action>
          <q-btn flat label="Δοκιμή ξανά" @click="auth.load()" />
        </template>
      </q-banner>

      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { KladosType } from '@trifylli/shared';
import { useQuasar } from 'quasar';
import { inkOnWhiteLarge } from '../lib/color';
import { applyKladosTheme, kladosVars } from '../lib/klados-theme';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';
import { useSessionStore } from '../stores/session';
import { KLADOS_LINKS, TOPIKO_LINKS } from '../router/routes';

const drawer = ref(false);
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const offline = useOfflineStore();
const session = useSessionStore();

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? 'Trifylli');

const kladosLinks = KLADOS_LINKS;

/** Ο κλάδος της τρέχουσας σελίδας, όταν βρισκόμαστε μέσα σε κλάδο. */
const activeKlados = computed(() => {
  const param = route.params.klados as KladosType | undefined;
  return param ? (auth.kladoi.find((k) => k.type === param) ?? null) : null;
});

/**
 * Το χρώμα της τρέχουσας σελίδας ακολουθεί τη διαδρομή.
 *
 * Παρακολουθούμε τη **διαδρομή** και όχι τον `activeKlados`: ανάμεσα σε δύο
 * σελίδες εκτός κλάδου ο κλάδος είναι `null` και στις δύο, οπότε ο watcher δεν
 * θα πυροδοτούνταν και το χρώμα της προηγούμενης σελίδας θα κολλούσε.
 *
 * Κάθε αλλαγή διαδρομής καθαρίζει· οι σελίδες λεπτομέρειας, που ζουν εκτός
 * `/k/:klados`, το ξαναβάφουν μόλις φορτώσουν τα δεδομένα τους.
 */
watch(
  () => route.fullPath,
  () => applyKladosTheme(activeKlados.value?.type ?? null),
  { immediate: true },
);

/**
 * Το τμήμα «Τοπικό» υπάρχει μόνο για τον υπερδιαχειριστή — ο διαχειριστής
 * κλάδου δεν έχει καμία από αυτές τις σελίδες, οπότε δεν του δείχνουμε κενή
 * ενότητα.
 */
const topikoLinks = computed(() => (auth.isSuperAdmin ? TOPIKO_LINKS : []));

/** Ανοίγει το dropdown «Τοπικό» όταν βρισκόμαστε σε σελίδα Τοπικού. */
const topikoRouteNames = new Set<string>(TOPIKO_LINKS.map((l) => l.name));
const isTopikoRoute = computed(() => topikoRouteNames.has(String(route.name)));

/** Χρώμα Τοπικού = πράσινο εφαρμογής, στη λογική των μεταβλητών κλάδου. */
const topikoVars: Record<string, string> = {
  '--klados-color': 'var(--q-primary)',
  '--klados-ink': 'var(--q-primary)',
  '--klados-ink-lg': 'var(--q-primary)',
  '--klados-on': '#fff',
  '--klados-on-bar': '#fff',
};

/**
 * Η αποσύνδεση με εκκρεμή ουρά χάνει δουλειά: τα δεδομένα ζουν στο IndexedDB
 * του browser και ο επόμενος χρήστης δεν πρέπει να τα στείλει με το δικό του
 * token. Ρωτάμε πρώτα.
 */
function confirmSignOut(): void {
  if (offline.hasPending) {
    $q.dialog({
      title: 'Υπάρχουν ασυγχρόνιστα δεδομένα',
      message: `${offline.pending} καταχωρήσεις δεν έχουν σταλεί ακόμη. Αποσύνδεση;`,
      cancel: { label: 'Άκυρο', flat: true },
      ok: { label: 'Αποσύνδεση', color: 'negative' },
    }).onOk(() => void session.signOut());
    return;
  }
  void session.signOut();
}
</script>
