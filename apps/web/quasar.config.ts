import { defineConfig } from '#q-app/wrappers';
import { fileURLToPath } from 'node:url';

/**
 * Το `quasar.config.ts` τρέχει σε Node **πριν** το dotenv του Vite, οπότε το
 * `.env` δεν έχει φορτωθεί ακόμη όταν διαβάζουμε τις μεταβλητές παρακάτω.
 * Χωρίς αυτή τη γραμμή, ένα `pnpm build` χωρίς inline μεταβλητές παράγει σιωπηλά
 * bundle με απενεργοποιημένο το OIDC — και η εφαρμογή τρώει 401 παντού.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));
} catch {
  // Δεν υπάρχει .env: σε CI/Docker οι μεταβλητές έρχονται από το περιβάλλον.
}

export default defineConfig((ctx) => ({
  boot: ['fonts', 'api', 'auth'],

  css: ['app.scss'],

  extras: ['roboto-font', 'material-icons'],

  build: {
    target: { browser: ['es2022', 'firefox115', 'chrome115', 'safari15'], node: 'node20' },
    typescript: { strict: true, vueShim: true },
    vueRouterMode: 'history',

    env: {
      // Το API base URL είναι build-time· σε Docker περνιέται ως build arg.
      API_URL: process.env.VITE_API_URL ?? 'http://localhost:3000/api',
      // ── OIDC (Authentik) ──
      // Με κενό `OIDC_CLIENT_ID` η εφαρμογή τρέχει σε λειτουργία development και
      // χρησιμοποιεί το `x-dev-email` αντί για πραγματικό login.
      OIDC_AUTHORITY: process.env.VITE_OIDC_AUTHORITY ?? '',
      OIDC_CLIENT_ID: process.env.VITE_OIDC_CLIENT_ID ?? '',
      OIDC_LOGOUT_FLOW: process.env.VITE_OIDC_LOGOUT_FLOW ?? 'trifylli-invalidation',

      // Δοκιμή ρόλων χωρίς Authentik: η τιμή πρέπει να αντιστοιχεί σε υπαρκτό
      // λογαριασμό, αλλιώς το API απαντά 403 όπως και σε production.
      DEV_EMAIL: process.env.VITE_DEV_EMAIL ?? '',
      // URL του frontend του OuchTracker — στόχος των deep-links των φαρμακείων.
      OUCHTRACKER_URL: process.env.VITE_OUCHTRACKER_URL ?? '',
    },

    alias: {
      '@trifylli/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },

  devServer: {
    port: 9000,
    open: false,
  },

  framework: {
    config: {
      brand: {
        primary: '#2e7d32',
        secondary: '#6d4c41',
        accent: '#f9a825',
        dark: '#1d1d1d',
        positive: '#2e7d32',
        negative: '#c62828',
        info: '#0277bd',
        warning: '#ef6c00',
      },
      notify: { position: 'top', timeout: 3000 },
    },
    lang: 'el',
    plugins: ['Notify', 'Dialog', 'Loading', 'LocalStorage'],
  },

  animations: [],

  pwa: {
    // injectManifest: γράφουμε δικό μας service worker, γιατί η στρατηγική
    // cache διαφέρει ανά endpoint (βλ. src-pwa/custom-service-worker.ts).
    workboxMode: 'InjectManifest',
    injectPwaMetaTags: true,
    swFilename: 'sw.js',
    manifestFilename: 'manifest.json',
    // Το config.js (runtime ρυθμίσεις) ΔΕΝ μπαίνει στο precache — αλλιώς ένα
    // installed PWA θα κρατούσε τις build-time τιμές αντί των runtime.
    extendInjectManifestOptions(cfg) {
      cfg.globIgnores = [...(cfg.globIgnores ?? []), 'config.js'];
    },
    extendManifestJson(json) {
      Object.assign(json, {
        name: 'Trifylli — Τοπικό Τμήμα Σ.Ε.Ο.',
        short_name: 'Trifylli',
        description: 'Διαχείριση κλάδων, υλικού, δράσεων και μελών',
        lang: 'el',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#2e7d32',
        start_url: '/',
      });
    },
  },

  sourceFiles: {
    rootComponent: 'src/App.vue',
    router: 'src/router/index',
    store: 'src/stores/index',
  },
}));
