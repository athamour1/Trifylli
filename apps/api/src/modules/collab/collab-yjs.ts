import { COLLAB_GENERATION_KEY, COLLAB_META, type CollabTokenPayload } from '@trifylli/shared';
import type { Doc } from 'yjs';

/**
 * Πρώτο γέμισμα ενός εγγράφου από τη βάση — **μόνο** ο server το κάνει.
 *
 * Αν γέμιζε ο client, δύο που ανοίγουν μαζί θα έγραφαν το ίδιο κείμενο από δύο
 * ανεξάρτητες εισαγωγές και η ένωσή τους θα ήταν διπλό κείμενο. Για τον ίδιο
 * λόγο το γέμισμα παίρνει νέα γενιά: ένα αντίγραφο συσκευής από προηγούμενο
 * γέμισμα δεν πρέπει να ενωθεί με αυτό.
 */
export function seedDocument(doc: Doc, values: Record<string, string>, generation: string): void {
  doc.transact(() => {
    doc.getMap(COLLAB_META).set(COLLAB_GENERATION_KEY, generation);
    for (const [field, value] of Object.entries(values)) {
      if (value) doc.getText(field).insert(0, value);
    }
  });
}

/** Οι απλές τιμές των πεδίων — ό,τι γράφεται στην οντότητα. */
export function readFields(doc: Doc, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, doc.getText(field).toString()]));
}

/** Το token του client: JSON με το access token, τη γενιά της συσκευής και το πρωτόκολλο. */
export function parseCollabToken(raw: string): CollabTokenPayload | null {
  if (!raw || raw.length > 16_384) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { t, g, p } = value as Record<string, unknown>;
  if (typeof t !== 'string' || !t || typeof g !== 'string' || g.length > 64 || typeof p !== 'number') return null;
  return { t, g, p };
}
