<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated class="bg-klados text-klados-bar" :class="{ 'is-scrolled': scrolled }">
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
              <q-separator />
              <q-item clickable v-close-popup :to="{ name: 'settings' }">
                <q-item-section avatar><q-icon name="settings" /></q-item-section>
                <q-item-section>Ρυθμίσεις</q-item-section>
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

    <!-- Σε μεγάλες οθόνες το συρτάρι «αιωρείται» (βλ. app.scss, «Πλωτά πάνελ»):
         τα 12px επιπλέον πλάτος είναι το κενό αριστερά του, ώστε η Quasar να
         υπολογίζει σωστά το περιθώριο της σελίδας και την απόκρυψη. -->
    <q-drawer ref="drawerRef" v-model="drawer" show-if-above bordered :width="$q.screen.lt.md ? 272 : 284">
      <!-- Ο περιέκτης του μενού είναι το σημείο αναφοράς του «χαπιού» που γλιστρά
           στο ενεργό στοιχείο (useSlidingThumb). Μετριέται αυτός και όχι το
           συρτάρι, ώστε να πιάνει και το άνοιγμα/κλείσιμο ενοτήτων κλάδου. -->
      <div ref="menuEl" class="drawer-menu" :class="{ 'drawer-menu--ready': menuReady }">
        <span class="drawer-menu__thumb" :style="menuThumb" aria-hidden="true" />
      <q-list padding>
        <q-item clickable v-ripple :to="{ name: 'dashboard' }" exact active-class="klados-active">
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
          :header-style="{ color: 'var(--klados-ink-lg)' }"
          :style="kladosVars(klados.type)"
          :model-value="openSection === klados.type"
          expand-separator
          @update:model-value="(v: boolean) => toggleSection(klados.type, v)"
        >
          <q-item
            v-for="link in kladosLinks"
            :key="`${klados.type}-${link.name}`"
            clickable
            v-ripple
            :inset-level="0.4"
            :to="{ name: link.name, params: { klados: klados.type } }"
            active-class="klados-active"
            :class="{ 'klados-active': detailLink === link.name && contextKlados === klados.type }"
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
          :model-value="openSection === 'topiko'"
          expand-separator
          @update:model-value="(v: boolean) => toggleSection('topiko', v)"
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
        <q-item clickable v-ripple :to="{ name: 'sync' }" active-class="klados-active">
          <q-item-section avatar>
            <q-icon name="sync" :color="offline.hasPending ? 'warning' : undefined" />
          </q-item-section>
          <q-item-section>Συγχρονισμός</q-item-section>
          <q-item-section v-if="offline.hasPending" side>
            <q-badge color="warning" :label="offline.pending" />
          </q-item-section>
        </q-item>
      </q-list>
      </div>
    </q-drawer>

    <q-page-container ref="pageContainer">
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

      <!-- Μικρή μετάβαση ανάμεσα σε σελίδες (βλ. app.scss «Κίνηση»): fade με
           ελαφρύ ανέβασμα, 160ms — αρκετή για να «κουμπώνει» η αλλαγή, όχι τόση
           ώστε να την περιμένεις. -->
      <!-- `key` στο id της διαδρομής: οι σελίδες λεπτομέρειας (δράση, συγκέντρωση,
           συμβούλιο, μέλος) διαβάζουν το id μία φορά, και από δράση σε δράση το Vue
           Router ξαναχρησιμοποιεί το ίδιο component — έμεναν τα δεδομένα της
           προηγούμενης. Η αλλαγή ενότητας μέσα στην ίδια δράση κρατά το ίδιο key. -->
      <router-view v-slot="{ Component, route: viewRoute }">
        <transition name="tf-page" mode="out-in">
          <component :is="Component" :key="String(viewRoute.params.id ?? viewRoute.name)" />
        </transition>
      </router-view>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { KladosType } from '@trifylli/shared';
import { useQuasar, type QDrawer } from 'quasar';
import { kladosVars } from '../lib/klados-theme';
import { useKladosThemeStore } from '../stores/klados-theme';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';
import { useSessionStore } from '../stores/session';
import { KLADOS_LINKS, TOPIKO_LINKS } from '../router/routes';
import { useSlidingThumb } from '../composables/useSlidingThumb';

const drawer = ref(false);
const route = useRoute();

/** Το χάπι του ενεργού στοιχείου στο μενού — βλ. useSlidingThumb. */
const menuEl = ref<HTMLElement | null>(null);
const { thumbStyle: menuThumb, ready: menuReady } = useSlidingThumb(menuEl, '.klados-active');

/**
 * «Ζελέ» στο άνοιγμα του συρταριού: η κλάση μπαίνει μόνο όσο κρατά η κίνηση,
 * ώστε το overshoot (βλ. app.scss) να μην αγγίζει το κλείσιμο ούτε τις αλλαγές
 * μεγέθους παραθύρου, όπου ένα «μπινγκ» θα ήταν εκνευριστικό.
 * Απευθείας στο DOM: η QDrawer δεν περνά `class` στο root της, οπότε ένα
 * `:class` στο template δεν φτάνει πουθενά.
 */
const drawerRef = ref<QDrawer | null>(null);
let drawerBounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(drawer, (open) => {
  const el = drawerRef.value?.$el as HTMLElement | undefined;
  if (!el) return;
  if (drawerBounceTimer) clearTimeout(drawerBounceTimer);
  // Άνοιγμα: overshoot. Κλείσιμο: «φόρα» προς τα μέσα και μετά έξω (το
  // overshoot προς τα έξω θα γινόταν εκτός οθόνης, αόρατο).
  el.classList.toggle('drawer-bounce', open);
  el.classList.toggle('drawer-bounce-out', !open);
  drawerBounceTimer = setTimeout(() => el.classList.remove('drawer-bounce', 'drawer-bounce-out'), 900);
});

/**
 * Η μπάρα παίρνει βαθύτερη σκιά μόλις το περιεχόμενο κυλήσει από κάτω της — το
 * σήμα «υπάρχει κι άλλο πάνω». Το scroll ζει στον q-page-container (app.scss),
 * όχι στο window, γι' αυτό ακούμε εκεί.
 */
const scrolled = ref(false);
const pageContainer = ref<{ $el: HTMLElement } | null>(null);
function onPageScroll(event: Event): void {
  scrolled.value = (event.target as HTMLElement).scrollTop > 4;
}
onMounted(() => {
  const el = pageContainer.value?.$el;
  // capture: το scroll δεν κάνει bubble, και σε μεγάλες οθόνες κυλάει η κάρτα
  // της σελίδας (παιδί του περιέκτη), όχι ο ίδιος ο περιέκτης.
  if (el) el.addEventListener('scroll', onPageScroll, { passive: true, capture: true });
});
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
 * θα πυροδοτούνταν και το χρώμα της προηγούμενης σελίδας θα κολλούσε. Τις
 * σελίδες λεπτομέρειας τις χειρίζεται το store (βλ. `useKladosThemeStore`).
 */
const kladosTheme = useKladosThemeStore();
watch(
  () => route.fullPath,
  () => kladosTheme.follow(route, activeKlados.value?.type ?? null),
  { immediate: true },
);

/**
 * Σελίδες λεπτομέρειας εκτός `/k/:klados` → ποιος σύνδεσμος του κλάδου τους
 * «ανήκει». Ο κλάδος τους δεν είναι στη διαδρομή· τον μαθαίνουμε από το θέμα
 * που βάφει η ίδια η σελίδα μόλις φορτώσει (`kladosTheme.klados`).
 */
const DETAIL_LINK: Record<string, string> = {
  drasi: 'klados-draseis',
  'drasi-programmatiko': 'klados-draseis',
  syggentrwsh: 'klados-syggentrwseis',
  parousiologio: 'klados-syggentrwseis',
  symvoulio: 'klados-symvoulia',
  melos: 'klados-meloi',
  'yliko-item': 'klados-yliko',
};
const detailLink = computed(() => DETAIL_LINK[String(route.name)] ?? null);
/** Ο κλάδος «πού είμαστε»: από τη διαδρομή, αλλιώς από το θέμα της σελίδας λεπτομέρειας. */
const contextKlados = computed<KladosType | null>(() => activeKlados.value?.type ?? (detailLink.value ? kladosTheme.klados : null));

/**
 * Το τμήμα «Τοπικό» υπάρχει μόνο για τον υπερδιαχειριστή — ο διαχειριστής
 * κλάδου δεν έχει καμία από αυτές τις σελίδες, οπότε δεν του δείχνουμε κενή
 * ενότητα.
 */
const topikoLinks = computed(() => (auth.isSuperAdmin ? TOPIKO_LINKS : []));

/** Ανοίγει το dropdown «Τοπικό» όταν βρισκόμαστε σε σελίδα Τοπικού. */
const topikoRouteNames = new Set<string>(TOPIKO_LINKS.map((l) => l.name));
const isTopikoRoute = computed(() => topikoRouteNames.has(String(route.name)));

/**
 * Το συρτάρι λειτουργεί ως ακορντεόν: ανοιχτή είναι το πολύ μία ενότητα κάθε
 * στιγμή. Κρατάμε ποια είναι ανοιχτή σε ένα μόνο ref· όταν ανοίγει μία, η
 * προηγούμενη κλείνει. `null` = όλες κλειστές.
 */
function initialSection(): string | null {
  if (auth.kladoi.length === 1) return auth.kladoi[0]?.type ?? null;
  if (activeKlados.value) return activeKlados.value.type;
  if (isTopikoRoute.value) return 'topiko';
  return null;
}
const openSection = ref<string | null>(initialSection());

function toggleSection(key: string, open: boolean): void {
  if (open) openSection.value = key;
  else if (openSection.value === key) openSection.value = null;
}

/**
 * Κατά την πλοήγηση σε σελίδα κλάδου ή Τοπικού ανοίγουμε τη σχετική ενότητα,
 * ώστε ο χρήστης να βλέπει πού βρίσκεται· χειροκίνητες αλλαγές εκτός διαδρομής
 * παραμένουν σεβαστές.
 */
watch(
  () => (contextKlados.value ?? (isTopikoRoute.value ? 'topiko' : null)),
  (section) => {
    if (section) openSection.value = section;
  },
);

/** Χρώμα Τοπικού = πράσινο εφαρμογής, στη λογική των μεταβλητών κλάδου. */
const topikoVars: Record<string, string> = {
  '--klados-color': 'var(--q-primary)',
  '--klados-ink': 'var(--topiko-ink)',
  '--klados-ink-lg': 'var(--topiko-ink)',
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
