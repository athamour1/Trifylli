#!/usr/bin/env node
/**
 * Δοκιμή φόρτου της συνεργασίας (βλ. docs/synergasia.md, Φ6): N «καρτέλες» — η
 * καθεμία με δικό της WebSocket, όπως ένας browser — ανοίγουν το ίδιο κοινό
 * έγγραφο και γράφουν μαζί, με κέρσορα, για λίγο. Στο τέλος ελέγχει ότι όλες
 * καταλήγουν στο ίδιο κείμενο και λέει πόσο κράτησαν συγχρονισμός και σύγκλιση.
 *
 *   COLLAB_TOKEN=<access token> node scripts/collab-load.mjs \
 *     --url ws://localhost:3000/api/collab --origin http://localhost:8080 \
 *     --doc drasi:<id>:item:<id> --field description --clients 30 --seconds 60
 *
 * Το token: ενός λογαριασμού που γράφει στο έγγραφο (π.χ. από το sessionStorage
 * του browser, `oidc.user:…` → `access_token`). Η μνήμη του API φαίνεται στη
 * γραμμή `collab-stats` του log και στο `docker stats`.
 */
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as Y from 'yjs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []),
);
const URL_ = args.url ?? 'ws://localhost:3000/api/collab';
const ORIGIN = args.origin ?? 'http://localhost:8080';
const DOC = args.doc;
const FIELD = args.field ?? 'description';
const CLIENTS = Number(args.clients ?? 30);
const SECONDS = Number(args.seconds ?? 60);
const TOKEN = process.env.COLLAB_TOKEN;
if (!DOC || !TOKEN) {
  console.error('Χρειάζονται --doc <όνομα εγγράφου> και COLLAB_TOKEN.');
  process.exit(2);
}

class OriginSocket extends WebSocket {
  constructor(url, protocols) {
    super(url, protocols, { origin: ORIGIN });
  }
}

const until = (check, ms) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve(Date.now() - started);
      if (Date.now() - started > ms) return reject(new Error('λήξη χρόνου'));
      setTimeout(tick, 20);
    };
    tick();
  });

const started = Date.now();
const clients = [];
for (let i = 0; i < CLIENTS; i += 1) {
  const socket = new HocuspocusProviderWebsocket({ url: URL_, WebSocketPolyfill: OriginSocket, maxAttempts: 3 });
  const document = new Y.Doc();
  const failures = [];
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: DOC,
    document,
    token: JSON.stringify({ t: TOKEN, g: '', p: 1 }),
    onAuthenticationFailed: ({ reason }) => failures.push(reason),
  });
  provider.attach();
  clients.push({ socket, document, provider, failures, text: () => document.getText(FIELD).toString() });
}

try {
  const syncMs = await until(() => clients.every((c) => c.provider.isSynced || c.failures.length), 30_000);
  const failed = clients.filter((c) => c.failures.length);
  if (failed.length) throw new Error(`απορρίφθηκαν ${failed.length}: ${failed[0].failures[0]}`);
  console.log(`${CLIENTS} συνδέσεις συγχρονίστηκαν σε ${syncMs} ms`);

  // Κάθε καρτέλα γράφει ένα γράμμα κάθε ~400 ms σε τυχαία θέση και μετακινεί τον κέρσορα.
  let typed = 0;
  const stopAt = Date.now() + SECONDS * 1000;
  await Promise.all(
    clients.map(async (client, index) => {
      while (Date.now() < stopAt) {
        const text = client.document.getText(FIELD);
        const at = Math.floor(Math.random() * (text.length + 1));
        text.insert(at, String.fromCharCode(945 + (index % 24)));
        client.provider.setAwarenessField('cursor', { at, index });
        typed += 1;
        await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 200));
      }
    }),
  );
  console.log(`γράφτηκαν ${typed} γράμματα σε ${SECONDS} s (${Math.round(typed / SECONDS)}/s συνολικά)`);

  const convergeMs = await until(() => {
    const first = clients[0].text();
    return clients.every((c) => c.text() === first && c.provider.unsyncedChanges === 0);
  }, 60_000);
  console.log(`όλες ίδιες σε ${convergeMs} ms μετά το τέλος — ${clients[0].text().length} χαρακτήρες`);
} catch (error) {
  console.error(`ΑΠΟΤΥΧΙΑ: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    client.provider.destroy();
    client.socket.destroy();
  }
  console.log(`σύνολο ${Math.round((Date.now() - started) / 1000)} s`);
  setTimeout(() => process.exit(), 200);
}
