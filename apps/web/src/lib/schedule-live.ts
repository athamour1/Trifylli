/**
 * Η δράση ζωντανά (Φ12): οι ώρες με την καθυστέρηση, τι γίνεται τώρα και τι
 * ακολουθεί. Οι προγραμματισμένες ώρες έρχονται από τον server· η καθυστέρηση
 * είναι λεπτά ανά στοιχείο (`delayMin`).
 */

/** Ίδιος κανόνας με τον server: όσα δηλώθηκαν σε αυτό ή σε προηγούμενο στοιχείο της ημέρας. */
export function delaysOf(itemIds: readonly string[], delays: readonly { itemId: string; minutes: number }[]): Map<string, number> {
  const declared = new Map<string, number>();
  for (const delay of delays) declared.set(delay.itemId, (declared.get(delay.itemId) ?? 0) + delay.minutes);
  const out = new Map<string, number>();
  let running = 0;
  for (const id of itemIds) {
    running += declared.get(id) ?? 0;
    out.set(id, running);
  }
  return out;
}

export interface LiveItem<T> {
  id: string;
  item: T;
  /** Με την καθυστέρηση. */
  start: Date;
  end: Date;
  delayMin: number;
}

export interface LiveDay<T> {
  /** `before` πριν αρχίσει η ημέρα, `during` μέσα σε στοιχείο, `between` σε κενό, `after` μετά. */
  state: 'empty' | 'before' | 'during' | 'between' | 'after';
  current: LiveItem<T> | null;
  /** Πόσα λεπτά μένουν στο τωρινό. */
  remainingMin: number;
  /** Όσα ακολουθούν, με τη σειρά τους. */
  next: LiveItem<T>[];
}

/**
 * Η ημέρα ζωντανά. Τα στοιχεία είναι συνεχόμενα (το καθένα αρχίζει όπου τελειώνει
 * το προηγούμενο), οπότε ένα στοιχείο κρατά ως την (διορθωμένη) αρχή του
 * επόμενου: «καθυστερούμε 15΄» από το επόμενο = το τωρινό κρατά 15΄ παραπάνω.
 */
export function liveDay<T extends { id: string; startsAt: string; endsAt: string; delayMin: number }>(items: readonly T[], now: Date): LiveDay<T> {
  const starts = items.map((item) => new Date(new Date(item.startsAt).getTime() + item.delayMin * 60_000));
  const live = items.map((item, index) => ({
    id: item.id,
    item,
    start: starts[index]!,
    end: starts[index + 1] ?? new Date(new Date(item.endsAt).getTime() + item.delayMin * 60_000),
    delayMin: item.delayMin,
  }));
  if (!live.length) return { state: 'empty', current: null, remainingMin: 0, next: [] };
  const t = now.getTime();
  const current = live.find((entry) => entry.start.getTime() <= t && t < entry.end.getTime()) ?? null;
  const next = live.filter((entry) => entry.start.getTime() > t);
  const state = current ? 'during' : t < live[0]!.start.getTime() ? 'before' : next.length ? 'between' : 'after';
  return { state, current, remainingMin: current ? Math.ceil((current.end.getTime() - t) / 60_000) : 0, next };
}
