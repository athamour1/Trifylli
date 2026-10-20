import type { CollabChange } from '@trifylli/shared';

/**
 * Το «άλλαξε αυτό» του Τοπικού (βλ. `collabDocument.topiko`): το δωμάτιο το
 * ανοίγει μία φορά το layout (`TopikoLive`) και οι σελίδες ακούνε εδώ, με
 * `useTopikoReload`. Σταθερό κανάλι, ώστε μια σελίδα να γράφεται πριν ακόμα
 * φορτώσει το προφίλ (και άρα το Τοπικό).
 */
const handlers = new Set<(change: CollabChange) => void>();

export function subscribeTopiko(handler: (change: CollabChange) => void): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitTopiko(change: CollabChange): void {
  for (const handler of handlers) handler(change);
}
