/**
 * Τα αντίγραφα των κοινών εγγράφων στη συσκευή (IndexedDB) — χωριστά από το
 * `collab.ts`, ώστε η αποσύνδεση να τα σβήνει χωρίς να φορτώνει τη βιβλιοθήκη της
 * σύνδεσης σε κάθε σελίδα.
 */

/** Το πρόθεμα των αντιγράφων στη συσκευή — τα σβήνει η αποσύνδεση. */
export const COLLAB_DB_PREFIX = 'trifylli-collab:';
/** Τα ονόματα των αντιγράφων, για browsers χωρίς `indexedDB.databases()`. */
const KNOWN_KEY = 'trifylli:collab-docs';

let closeConnection: (() => void) | null = null;

/** Η σύνδεση δηλώνει πώς κλείνει, για να την κλείσει η αποσύνδεση. */
export function onCollabPurge(close: () => void): void {
  closeConnection = close;
}

/** Σημειώνει ότι υπάρχει αντίγραφο στη συσκευή — για να το βρει η αποσύνδεση. */
export function rememberCollabDb(name: string): void {
  try {
    const known = new Set<string>(JSON.parse(localStorage.getItem(KNOWN_KEY) ?? '[]') as string[]);
    if (known.has(name)) return;
    known.add(name);
    localStorage.setItem(KNOWN_KEY, JSON.stringify([...known]));
  } catch {
    // Χωρίς localStorage μένει μόνο το `indexedDB.databases()`.
  }
}

/**
 * Αποσύνδεση: κλείνει η σύνδεση και σβήνουν τα αντίγραφα των κοινών εγγράφων —
 * κοινές συσκευές, δεδομένα παιδιών, όπως το cache και η ουρά.
 */
export async function purgeCollab(): Promise<void> {
  closeConnection?.();
  closeConnection = null;

  const names = new Set<string>();
  try {
    for (const name of JSON.parse(localStorage.getItem(KNOWN_KEY) ?? '[]') as string[]) names.add(name);
    localStorage.removeItem(KNOWN_KEY);
  } catch {
    // βλ. rememberCollabDb
  }
  try {
    for (const db of (await indexedDB.databases?.()) ?? []) {
      if (db.name?.startsWith(COLLAB_DB_PREFIX)) names.add(db.name);
    }
  } catch {
    // Παλιός browser: φτάνει η λίστα του localStorage.
  }
  await Promise.all(
    [...names].map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          } catch {
            resolve();
          }
        }),
    ),
  );
}
