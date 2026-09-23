#!/usr/bin/env node
/**
 * Παίρνει ΜΙΑ φορά ένα offline refresh token από το Keycloak του e-SEO, ώστε ο
 * sync engine να αυθεντικοποιείται χωρίς να αποθηκεύεται ο κωδικός σου.
 *
 * Διαβάζει τα credentials από αρχείο (όχι από argv) για να μη διαρρεύσουν, και
 * ΔΕΝ τυπώνει ποτέ ολόκληρο token — το γράφει σε αρχείο και τυπώνει οδηγίες.
 *
 * Χρήση:
 *   1) φτιάξε  apps/api/scripts/.eseo-creds  με:
 *        ESEO_USERNAME=to_username_sou
 *        ESEO_PASSWORD=o_kodikos_sou
 *   2) node apps/api/scripts/eseo-offline-token.mjs
 *   3) αντίγραψε την τιμή από το .eseo-offline-token στο .env (ESEO_REFRESH_TOKEN)
 *      και σβήσε το .eseo-creds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const credsPath = process.argv[2] || join(here, '.eseo-creds');
const outPath = join(here, '..', '.eseo-offline-token');

const BASE = process.env.ESEO_BASE_URL?.replace(/\/$/, '') || 'https://eseo.seo.gr/app/eseo';
const REALM = process.env.ESEO_REALM || 'eseo';
const CLIENT_ID = process.env.ESEO_CLIENT_ID || 'ssoClient';
const TOKEN_URL = `${BASE}/auth/realms/${REALM}/protocol/openid-connect/token`;

let creds;
try {
  creds = Object.fromEntries(
    readFileSync(credsPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
} catch {
  console.error(`✗ Δεν βρέθηκε αρχείο credentials: ${credsPath}`);
  console.error('  Φτιάξε το με γραμμές ESEO_USERNAME=... και ESEO_PASSWORD=...');
  process.exit(1);
}

if (!creds.ESEO_USERNAME || !creds.ESEO_PASSWORD) {
  console.error('✗ Λείπει ESEO_USERNAME ή ESEO_PASSWORD από το αρχείο.');
  process.exit(1);
}

const res = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    // offline_access ⇒ ο Keycloak εκδίδει offline refresh token που επιβιώνει
    // του session και δεν λήγει με αδράνεια.
    scope: 'openid offline_access',
    username: creds.ESEO_USERNAME,
    password: creds.ESEO_PASSWORD,
  }),
});

if (!res.ok) {
  console.error(`✗ Αποτυχία: HTTP ${res.status}`);
  console.error('  ', (await res.text()).slice(0, 400));
  process.exit(2);
}

const data = await res.json();
if (!data.refresh_token) {
  console.error('✗ Το Keycloak δεν επέστρεψε refresh_token (offline_access δεν επιτρέπεται;).');
  process.exit(3);
}

writeFileSync(outPath, data.refresh_token + '\n', { mode: 0o600 });

const mask = (t) => `${t.slice(0, 6)}…${t.slice(-6)} (${t.length} chars)`;
console.log('✓ Offline refresh token γράφτηκε στο:');
console.log('   ' + outPath);
console.log('   ' + mask(data.refresh_token));
console.log('\nΕπόμενα βήματα:');
console.log('  • Βάλ\' το στο apps/api/.env  ως  ESEO_REFRESH_TOKEN=<η τιμή του αρχείου>');
console.log('  • Σβήσε το .eseo-creds (δεν το χρειάζεσαι πια).');
console.log('  • Το token είναι μυστικό — μην το κάνεις commit.');
