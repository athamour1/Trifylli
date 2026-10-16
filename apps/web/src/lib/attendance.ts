import type { ParousiaStatus } from '@trifylli/shared';

/** Σήμανση που περιμένει να σταλεί — με τη στιγμή που πατήθηκε. */
export interface PendingMark {
  status: ParousiaStatus;
  recordedAt: string;
}

/**
 * Ό,τι φεύγει: μόνο οι σημάνσεις που άλλαξαν, η καθεμία με την ώρα της. Αν η
 * σελίδα έστελνε όλο το φύλλο της οθόνης, δύο στελέχη που σημειώνουν μαζί θα
 * έσβηνε το ένα τα παιδιά του άλλου με την παλιά του εικόνα.
 */
export function markEntries(pending: ReadonlyMap<string, PendingMark>): { memberId: string; status: ParousiaStatus; recordedAt: string }[] {
  return [...pending].map(([memberId, mark]) => ({ memberId, status: mark.status, recordedAt: mark.recordedAt }));
}

/** Μετά από επιτυχή αποστολή: φεύγουν όσες στάλθηκαν και δεν ξαναπατήθηκαν στο μεταξύ. */
export function settle(pending: Map<string, PendingMark>, sent: readonly { memberId: string; recordedAt: string }[]): void {
  for (const entry of sent) if (pending.get(entry.memberId)?.recordedAt === entry.recordedAt) pending.delete(entry.memberId);
}

/** Οι σημάνσεις της οθόνης: ό,τι έχει ο server, με τις δικές μας που δεν στάλθηκαν από πάνω. */
export function mergeMarks(
  server: readonly { memberId: string; status: ParousiaStatus | null }[],
  pending: ReadonlyMap<string, PendingMark>,
): Record<string, ParousiaStatus | undefined> {
  return Object.fromEntries(server.map((entry) => [entry.memberId, pending.get(entry.memberId)?.status ?? entry.status ?? undefined]));
}
