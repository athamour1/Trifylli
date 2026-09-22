/**
 * Υπολογισμός διαθεσιμότητας υλικού — καθαρή λογική, χωρίς βάση.
 *
 * Το κρίσιμο σημείο: η δεσμευμένη ποσότητα μέσα σε ένα διάστημα **δεν** είναι το
 * άθροισμα των επικαλυπτόμενων δεσμεύσεων. Δύο δεσμεύσεις που πέφτουν μέσα στο
 * ζητούμενο παράθυρο αλλά δεν επικαλύπτονται μεταξύ τους (π.χ. Σάββατο και
 * Κυριακή) χρησιμοποιούν το ίδιο υλικό διαδοχικά. Άθροιση θα εμφάνιζε το υλικό
 * εξαντλημένο χωρίς λόγο.
 *
 * Σωστή απάντηση: η **μέγιστη ταυτόχρονη** δέσμευση μέσα στο παράθυρο, που
 * βρίσκεται με sweep line πάνω στα άκρα των διαστημάτων.
 */

export interface Interval {
  from: Date;
  to: Date;
}

export interface Reservation extends Interval {
  qty: number;
}

/** Επικάλυψη ημι-ανοιχτών διαστημάτων `[from, to)`: γειτονικά δεν συγκρούονται. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.from < b.to && b.from < a.to;
}

/** Το κοινό μέρος δύο διαστημάτων, ή `null` όταν δεν τέμνονται. */
export function intersect(a: Interval, b: Interval): Interval | null {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return from < to ? { from, to } : null;
}

/**
 * Η μέγιστη ταυτόχρονη δεσμευμένη ποσότητα μέσα στο `window`.
 *
 * Κάθε δέσμευση περικόπτεται στο παράθυρο πρώτα, ώστε ένα διάστημα που απλώς
 * ακουμπά το παράθυρο να μη μετράει.
 */
export function peakReserved(reservations: readonly Reservation[], window: Interval): number {
  type Event = { at: Date; delta: number };
  const events: Event[] = [];

  for (const reservation of reservations) {
    if (reservation.qty <= 0) continue;
    const clipped = intersect(reservation, window);
    if (!clipped) continue;
    events.push({ at: clipped.from, delta: reservation.qty });
    events.push({ at: clipped.to, delta: -reservation.qty });
  }

  // Οι λήξεις προηγούνται των εκκινήσεων στο ίδιο χρονικό σημείο: μια δέσμευση
  // που τελειώνει στις 18:00 ελευθερώνει το υλικό για μια που ξεκινά στις 18:00.
  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

/** Πόσα τεμάχια μένουν ελεύθερα στο παράθυρο. Δεν πέφτει ποτέ κάτω από 0. */
export function availableQty(
  totalQty: number,
  reservations: readonly Reservation[],
  window: Interval,
): number {
  return Math.max(0, totalQty - peakReserved(reservations, window));
}

/**
 * Οι δεσμεύσεις που εμποδίζουν ένα αίτημα — δηλαδή όσες επικαλύπτονται με το
 * παράθυρο, ταξινομημένες κατά φθίνουσα ποσότητα, για να ξέρει ο χρήστης σε
 * ποιον κλάδο να μιλήσει πρώτα.
 */
export function blockingReservations<T extends Reservation>(
  reservations: readonly T[],
  window: Interval,
): T[] {
  return reservations.filter((r) => r.qty > 0 && overlaps(r, window)).sort((a, b) => b.qty - a.qty);
}
