import type { RouteRecordRaw } from 'vue-router';
import type { Capability } from '@trifylli/shared';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    icon?: string;
    /** Το δικαίωμα που κρύβει τη διαδρομή από το μενού. */
    capability?: Capability;
    /** Μόνο ο υπερδιαχειριστής. */
    superAdmin?: boolean;
    /** Προσβάσιμη χωρίς συνεδρία (σελίδες της ροής σύνδεσης). */
    public?: boolean;
  }
}

/**
 * Οι σελίδες που εμφανίζονται **μέσα σε έναν κλάδο**.
 *
 * Ζουν κάτω από `/k/:klados/...` ώστε το μενού να μπορεί να τις παραθέσει μία
 * φορά ανά κλάδο. Οι ίδιες component-σελίδες εξυπηρετούν και την προβολή
 * Τοπικού: διαβάζουν τον κλάδο από `route.params.klados` όταν υπάρχει.
 */
export const KLADOS_LINKS = [
  { name: 'klados-calendar', path: 'calendar', title: 'Ημερολόγιο', icon: 'event' },
  { name: 'klados-syggentrwseis', path: 'syggentrwseis', title: 'Συγκεντρώσεις', icon: 'schedule' },
  { name: 'klados-meloi', path: 'meloi', title: 'Μέλη', icon: 'badge' },
  { name: 'klados-proodos', path: 'proodos', title: 'Ατομική πρόοδος', icon: 'trending_up' },
  { name: 'klados-draseis', path: 'draseis', title: 'Δράσεις', icon: 'hiking' },
  { name: 'klados-symvoulia', path: 'symvoulia', title: 'Συμβούλια', icon: 'forum' },
  { name: 'klados-yliko', path: 'yliko', title: 'Υλικό', icon: 'inventory_2' },
  { name: 'klados-farmakeia', path: 'farmakeia', title: 'Φαρμακεία', icon: 'local_pharmacy' },
  { name: 'klados-syndromes', path: 'syndromes', title: 'Συνδρομές', icon: 'euro' },
  { name: 'klados-tamio', path: 'tamio', title: 'Ταμείο', icon: 'account_balance_wallet' },
] as const;

/** Οι σελίδες επιπέδου Τοπικού — όλες μόνο για τον υπερδιαχειριστή. */
export const TOPIKO_LINKS = [
  { name: 'calendar', title: 'Κεντρικό ημερολόγιο', icon: 'calendar_month' },
  { name: 'kladoi', title: 'Κλάδοι', icon: 'groups' },
  { name: 'symvoulia', title: 'Συμβούλια', icon: 'forum' },
  { name: 'yliko', title: 'Κεντρική αποθήκη', icon: 'warehouse' },
  { name: 'meloi', title: 'Μητρώο μελών', icon: 'contacts' },
  { name: 'syndromes', title: 'Συνδρομές', icon: 'euro' },
  { name: 'tamio', title: 'Ταμείο Τοπικού', icon: 'account_balance' },
  { name: 'farmakeio', title: 'Φαρμακείο', icon: 'medical_services' },
  { name: 'farmakeia', title: 'Φαρμακεία', icon: 'local_pharmacy' },
  { name: 'integrations', title: 'Ενσωματώσεις', icon: 'cloud_sync' },
  { name: 'accounts', title: 'Λογαριασμοί', icon: 'admin_panel_settings' },
] as const;

const kladosChildren: RouteRecordRaw[] = [
  {
    path: 'calendar',
    name: 'klados-calendar',
    component: () => import('../pages/CalendarPage.vue'),
    meta: { title: 'Ημερολόγιο', capability: 'calendar:read' },
  },
  {
    path: 'syggentrwseis',
    name: 'klados-syggentrwseis',
    component: () => import('../pages/SyggentrwseisPage.vue'),
    meta: { title: 'Συγκεντρώσεις', capability: 'calendar:read' },
  },
  {
    path: 'meloi',
    name: 'klados-meloi',
    component: () => import('../pages/MeloiPage.vue'),
    meta: { title: 'Μέλη', capability: 'meloi:read' },
  },
  {
    path: 'proodos',
    name: 'klados-proodos',
    component: () => import('../pages/ProodosPage.vue'),
    meta: { title: 'Ατομική πρόοδος', capability: 'meloi:read' },
  },
  {
    path: 'draseis',
    name: 'klados-draseis',
    component: () => import('../pages/DraseisPage.vue'),
    meta: { title: 'Δράσεις', capability: 'calendar:read' },
  },
  {
    // Wizard 4 βημάτων· με `?id=` συνεχίζει ένα προσχέδιο.
    path: 'draseis/nea',
    name: 'klados-drasi-nea',
    component: () => import('../pages/DrasiWizardPage.vue'),
    meta: { title: 'Νέα δράση', capability: 'drasi:write' },
  },
  {
    path: 'symvoulia',
    name: 'klados-symvoulia',
    component: () => import('../pages/SymvouliaPage.vue'),
    meta: { title: 'Συμβούλια', capability: 'calendar:read' },
  },
  {
    path: 'yliko',
    name: 'klados-yliko',
    component: () => import('../pages/YlikoPage.vue'),
    meta: { title: 'Υλικό', capability: 'yliko:read' },
  },
  {
    path: 'farmakeia',
    name: 'klados-farmakeia',
    component: () => import('../pages/PharmaciesPage.vue'),
    meta: { title: 'Φαρμακεία', capability: 'farmakeio:read' },
  },
  {
    path: 'syndromes',
    name: 'klados-syndromes',
    component: () => import('../pages/SyndromesPage.vue'),
    meta: { title: 'Συνδρομές', capability: 'syndromes:read' },
  },
  {
    path: 'tamio',
    name: 'klados-tamio',
    component: () => import('../pages/TamioPage.vue'),
    meta: { title: 'Ταμείο', capability: 'treasury:read' },
  },
];

const routes: RouteRecordRaw[] = [
  // ── Ροή OIDC — σε λιτό layout: ο χρήστης δεν έχει ακόμη προφίλ ──
  //
  // Ξεχωριστές ρίζες (`/login`, `/auth`) και όχι κοινή `/` με το MainLayout:
  // δύο records με το ίδιο `path: '/'` σημαίνει ότι η bare διαδρομή ταιριάζει
  // με το πρώτο, οπότε η Αρχική θα έβγαινε κενή μέσα στο λιτό layout.
  {
    path: '/login',
    component: () => import('../layouts/BlankLayout.vue'),
    children: [
      {
        path: '',
        name: 'login',
        component: () => import('../pages/LoginPage.vue'),
        meta: { title: 'Σύνδεση', public: true },
      },
    ],
  },
  {
    path: '/auth',
    component: () => import('../layouts/BlankLayout.vue'),
    children: [
      {
        path: 'callback',
        name: 'auth-callback',
        component: () => import('../pages/AuthCallbackPage.vue'),
        meta: { title: 'Σύνδεση', public: true },
      },
      {
        path: 'silent',
        name: 'auth-silent',
        component: () => import('../pages/AuthSilentPage.vue'),
        meta: { public: true },
      },
      {
        // Front-channel Single Logout: το Authentik τη φορτώνει σε κρυφό iframe.
        // Δημόσια (χωρίς guard): ο χρήστης αποσυνδέεται, δεν έχει πια συνεδρία.
        path: 'frontchannel-logout',
        name: 'auth-frontchannel-logout',
        component: () => import('../pages/AuthFrontchannelLogoutPage.vue'),
        meta: { public: true },
      },
    ],
  },

  {
    // Το έντυπο του γονέα: χωρίς συνεδρία, χωρίς μενού — μόνο το token του συνδέσμου.
    path: '/forms',
    component: () => import('../layouts/BlankLayout.vue'),
    children: [
      {
        path: ':token',
        name: 'form-fill',
        component: () => import('../pages/FormFillPage.vue'),
        meta: { title: 'Έντυπο', public: true },
      },
    ],
  },
  {
    // Η αξιολόγηση με δημόσιο σύνδεσμο (παιδιά χωρίς λογαριασμό) — ίδιο μοντέλο με τα έντυπα.
    path: '/review',
    component: () => import('../layouts/BlankLayout.vue'),
    children: [
      {
        path: ':token',
        name: 'review-fill',
        component: () => import('../pages/ReviewFillPage.vue'),
        meta: { title: 'Αξιολόγηση', public: true },
      },
    ],
  },

  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('../pages/DashboardPage.vue'),
        meta: { title: 'Αρχική', icon: 'dashboard' },
      },

      // ── Ανά κλάδο ──
      { path: 'k/:klados', children: kladosChildren },

      // ── Λεπτομέρειες (κοινές, με έλεγχο εμβέλειας από το API) ──
      {
        path: 'syggentrwseis/:id',
        name: 'syggentrwsh',
        component: () => import('../pages/SyggentrwshPage.vue'),
        meta: { title: 'Σχεδιασμός συγκέντρωσης' },
      },
      {
        path: 'syggentrwseis/:id/parousiologio',
        name: 'parousiologio',
        component: () => import('../pages/ParousiologioPage.vue'),
        meta: { title: 'Παρουσιολόγιο' },
      },
      {
        path: 'draseis/:id/:section?',
        name: 'drasi',
        component: () => import('../pages/DrasiPage.vue'),
        meta: { title: 'Δράση' },
      },
      {
        path: 'draseis/:id/programma/:itemId',
        name: 'drasi-programmatiko',
        component: () => import('../pages/DrasiProgrammatikoPage.vue'),
        meta: { title: 'Προγραμματικό' },
      },
      {
        path: 'symvoulia/:id',
        name: 'symvoulio',
        component: () => import('../pages/SymvoulioPage.vue'),
        meta: { title: 'Συμβούλιο' },
      },
      {
        path: 'meloi/:id',
        name: 'melos',
        component: () => import('../pages/MelosPage.vue'),
        meta: { title: 'Καρτέλα μέλους' },
      },
      {
        path: 'yliko/item/:id',
        name: 'yliko-item',
        component: () => import('../pages/YlikoItemPage.vue'),
        meta: { title: 'Καρτέλα υλικού', capability: 'yliko:read' },
      },

      // ── Επίπεδο Τοπικού ──
      {
        path: 'calendar',
        name: 'calendar',
        component: () => import('../pages/CalendarPage.vue'),
        meta: { title: 'Κεντρικό ημερολόγιο', icon: 'calendar_month', superAdmin: true },
      },
      {
        path: 'kladoi',
        name: 'kladoi',
        component: () => import('../pages/KladoiPage.vue'),
        meta: { title: 'Κλάδοι', icon: 'groups', superAdmin: true },
      },
      {
        path: 'symvoulia',
        name: 'symvoulia',
        component: () => import('../pages/SymvouliaPage.vue'),
        meta: { title: 'Συμβούλια', icon: 'forum', superAdmin: true },
      },
      {
        path: 'yliko',
        name: 'yliko',
        component: () => import('../pages/YlikoPage.vue'),
        meta: { title: 'Κεντρική αποθήκη', icon: 'warehouse', superAdmin: true },
      },
      {
        path: 'meloi',
        name: 'meloi',
        component: () => import('../pages/MeloiPage.vue'),
        meta: { title: 'Μητρώο μελών', icon: 'contacts', superAdmin: true },
      },
      {
        path: 'syndromes',
        name: 'syndromes',
        component: () => import('../pages/SyndromesPage.vue'),
        meta: { title: 'Συνδρομές', icon: 'euro', superAdmin: true },
      },
      {
        path: 'tamio',
        name: 'tamio',
        component: () => import('../pages/TamioPage.vue'),
        meta: { title: 'Ταμείο Τοπικού', icon: 'account_balance', superAdmin: true },
      },
      {
        path: 'farmakeio',
        name: 'farmakeio',
        component: () => import('../pages/FarmakeioPage.vue'),
        meta: { title: 'Φαρμακείο', icon: 'medical_services', superAdmin: true },
      },
      {
        path: 'farmakeia',
        name: 'farmakeia',
        component: () => import('../pages/PharmaciesPage.vue'),
        meta: { title: 'Φαρμακεία', icon: 'local_pharmacy', superAdmin: true },
      },
      {
        path: 'integrations',
        name: 'integrations',
        component: () => import('../pages/IntegrationsPage.vue'),
        meta: { title: 'Ενσωματώσεις', icon: 'cloud_sync', superAdmin: true },
      },
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('../pages/AccountsPage.vue'),
        meta: { title: 'Λογαριασμοί', icon: 'admin_panel_settings', superAdmin: true },
      },

      {
        path: 'sync',
        name: 'sync',
        component: () => import('../pages/SyncPage.vue'),
        meta: { title: 'Συγχρονισμός', icon: 'sync' },
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('../pages/ErrorNotFound.vue'),
  },
];

export default routes;
