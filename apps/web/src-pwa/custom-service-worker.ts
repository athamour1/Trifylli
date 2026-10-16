/**
 * Service worker της PWA.
 *
 * Η στρατηγική διαφέρει ανά είδος αιτήματος, γιατί δεν έχουν όλα την ίδια
 * ανοχή στην παλαιότητα:
 *
 *  * **App shell** — precache. Η εφαρμογή πρέπει να ανοίγει χωρίς δίκτυο.
 *  * **GET του API** — NetworkFirst με σύντομο timeout: προτιμάμε φρέσκα
 *    δεδομένα, αλλά σε αδύναμο σήμα (κατασκήνωση) δεν περιμένουμε λεπτά.
 *  * **Γραφές (POST/PUT/PATCH/DELETE)** — δεν αγγίζονται καθόλου. Τις
 *    διαχειρίζεται η ουρά της εφαρμογής (`stores/offline.ts`), που ξέρει τη
 *    σημασιολογία τους (π.χ. `recordedAt` στο παρουσιολόγιο). Ένα background
 *    sync στο επίπεδο του SW θα τις έστελνε τυφλά, με λάθος σειρά.
 */
/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core/types';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation: **NetworkFirst**. Έτσι ένα reload παίρνει πάντα το φρέσκο
// index.html (άρα τα τελευταία hashed chunks) όταν υπάρχει δίκτυο· χωρίς δίκτυο
// πέφτει στην τελευταία cached έκδοση. Παλιότερα ήταν precache-first, που
// κρατούσε κολλημένη την παλιά έκδοση μέχρι χειροκίνητο καθάρισμα.
if (process.env.MODE !== 'ssr' || process.env.PROD) {
  registerRoute(
    new NavigationRoute(
      new NetworkFirst({
        cacheName: 'trifylli-shell',
        networkTimeoutSeconds: 3,
        plugins: [new CacheableResponsePlugin({ statuses: [200] })] as WorkboxPlugin[],
      }),
      { denylist: [/sw\.js$/, /workbox-(.)*\.js$/, /^\/api\//] },
    ),
  );
}

// Το `config.js` (ρυθμίσεις χρόνου εκτέλεσης) ΔΕΝ γίνεται precache (βλ.
// `quasar.config` globIgnores) — αλλιώς ένα installed PWA θα κρατούσε τις
// build-time τιμές. NetworkFirst: φρέσκο όταν υπάρχει δίκτυο, αλλιώς το τελευταίο.
registerRoute(
  ({ url }) => url.pathname === '/config.js',
  new NetworkFirst({
    cacheName: 'trifylli-config',
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })] as WorkboxPlugin[],
  }),
);

// Τα GET του API εντοπίζονται από το path (`/api/...`) και όχι από πλήρες URL,
// ώστε να μην εξαρτάται ο SW από build-time API_URL — το API URL είναι πλέον
// runtime. Πιάνει και cross-origin (π.χ. https://api.domain/api/...).
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'trifylli-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      // Μία εβδομάδα: όσο κρατά μια κατασκήνωση.
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ] as WorkboxPlugin[],
  }),
);

registerRoute(
  ({ request }) => request.destination === 'font' || request.destination === 'image',
  new CacheFirst({
    cacheName: 'trifylli-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ] as WorkboxPlugin[],
  }),
);

// ── Ειδοποιήσεις (Web Push) ──
// Το μήνυμα λέει μόνο τι και πού (ποτέ ονόματα παιδιών ή υγεία)· το πάτημα
// ανοίγει το σημείο — σε ανοιχτό παράθυρο της εφαρμογής αν υπάρχει.
self.addEventListener('push', (event) => {
  let data: { title?: string | undefined; body?: string | undefined; link?: string | undefined } = {};
  try {
    data = (event.data?.json() as typeof data | undefined) ?? {};
  } catch {
    data = { title: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Trifylli', {
      ...(data.body ? { body: data.body } : {}),
      icon: '/icons/icon-192.png',
      data: { link: data.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data as { link?: string } | null)?.link || '/';
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin) as WindowClient | undefined;
      if (open) {
        await open.focus();
        await open.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
