import type { CollabChange } from '@trifylli/shared';
import { CLIENT_ID } from './client-id';

/** Το μήνυμα του server (βλ. `CollabChange`) — `null` αν δεν έχει τη σωστή μορφή. */
export function parseChange(payload: string): CollabChange | null {
  try {
    const value = JSON.parse(payload) as unknown;
    if (typeof value !== 'object' || value === null) return null;
    const { topic, by, origin } = value as Record<string, unknown>;
    if (typeof topic !== 'string') return null;
    return { topic, by: typeof by === 'string' ? by : null, origin: typeof origin === 'string' ? origin : null };
  } catch {
    return null;
  }
}

/**
 * Αν μια σελίδα (ή καρτέλα της δράσης) πρέπει να ξαναφορτώσει: η αλλαγή δεν ήρθε
 * από αυτή την καρτέλα και αφορά κάποιο από τα θέματά της. Το «*» σημαίνει ότι
 * η σύνδεση ξανάνοιξε και μπορεί να χάθηκαν μηνύματα — ξαναφορτώνουν όλοι.
 */
export function concernsMe(change: CollabChange, topics: readonly string[]): boolean {
  if (change.origin === CLIENT_ID) return false;
  return change.topic === '*' || topics.includes(change.topic);
}
