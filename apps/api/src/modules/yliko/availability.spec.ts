import { describe, expect, it } from 'vitest';
import { availableQty, blockingReservations, intersect, overlaps, peakReserved } from './availability';

const at = (iso: string) => new Date(`2026-05-01T${iso}:00Z`);
const day = (d: number) => new Date(`2026-05-${String(d).padStart(2, '0')}T00:00:00Z`);

describe('overlaps', () => {
  it('θεωρεί τα γειτονικά διαστήματα μη επικαλυπτόμενα', () => {
    expect(overlaps({ from: at('10:00'), to: at('12:00') }, { from: at('12:00'), to: at('14:00') })).toBe(false);
  });

  it('εντοπίζει μερική επικάλυψη', () => {
    expect(overlaps({ from: at('10:00'), to: at('13:00') }, { from: at('12:00'), to: at('14:00') })).toBe(true);
  });

  it('εντοπίζει εγκλεισμό', () => {
    expect(overlaps({ from: at('10:00'), to: at('18:00') }, { from: at('12:00'), to: at('13:00') })).toBe(true);
  });
});

describe('intersect', () => {
  it('επιστρέφει null όταν δεν τέμνονται', () => {
    expect(intersect({ from: day(1), to: day(2) }, { from: day(3), to: day(4) })).toBeNull();
  });

  it('περικόπτει στο κοινό μέρος', () => {
    const result = intersect({ from: day(1), to: day(5) }, { from: day(3), to: day(9) });
    expect(result).toEqual({ from: day(3), to: day(5) });
  });
});

describe('peakReserved', () => {
  const window = { from: day(1), to: day(10) };

  it('δεν αθροίζει διαδοχικές δεσμεύσεις', () => {
    // Δύο σκηνές δεσμευμένες σε διαφορετικά σαββατοκύριακα είναι η ίδια σκηνή δύο φορές.
    const reservations = [
      { from: day(1), to: day(3), qty: 4 },
      { from: day(5), to: day(7), qty: 4 },
    ];
    expect(peakReserved(reservations, window)).toBe(4);
  });

  it('αθροίζει τις πραγματικά ταυτόχρονες', () => {
    const reservations = [
      { from: day(1), to: day(6), qty: 4 },
      { from: day(5), to: day(7), qty: 3 },
    ];
    expect(peakReserved(reservations, window)).toBe(7);
  });

  it('αγνοεί δεσμεύσεις εκτός παραθύρου', () => {
    expect(peakReserved([{ from: day(20), to: day(22), qty: 99 }], window)).toBe(0);
  });

  it('μετρά μόνο το μέρος που πέφτει μέσα στο παράθυρο', () => {
    const reservations = [{ from: day(8), to: day(20), qty: 5 }];
    expect(peakReserved(reservations, { from: day(1), to: day(9) })).toBe(5);
    expect(peakReserved(reservations, { from: day(1), to: day(8) })).toBe(0);
  });

  it('βρίσκει την κορυφή και όταν είναι στη μέση', () => {
    const reservations = [
      { from: day(1), to: day(9), qty: 2 },
      { from: day(3), to: day(5), qty: 3 },
      { from: day(4), to: day(6), qty: 1 },
    ];
    // Στις 4→5 τρέχουν όλες: 2 + 3 + 1
    expect(peakReserved(reservations, window)).toBe(6);
  });
});

describe('availableQty', () => {
  it('δεν επιστρέφει ποτέ αρνητική ποσότητα', () => {
    const reservations = [{ from: day(1), to: day(5), qty: 10 }];
    expect(availableQty(4, reservations, { from: day(1), to: day(5) })).toBe(0);
  });

  it('αφήνει ελεύθερο ό,τι δεν είναι δεσμευμένο ταυτόχρονα', () => {
    const reservations = [
      { from: day(1), to: day(3), qty: 6 },
      { from: day(3), to: day(5), qty: 6 },
    ];
    expect(availableQty(8, reservations, { from: day(1), to: day(5) })).toBe(2);
  });
});

describe('blockingReservations', () => {
  it('φέρνει πρώτη τη μεγαλύτερη δέσμευση', () => {
    const reservations = [
      { from: day(1), to: day(4), qty: 2, label: 'Πουλιά' },
      { from: day(2), to: day(3), qty: 5, label: 'Οδηγοί' },
      { from: day(9), to: day(10), qty: 9, label: 'Αστέρια' },
    ];
    const blocking = blockingReservations(reservations, { from: day(1), to: day(5) });
    expect(blocking.map((r) => r.label)).toEqual(['Οδηγοί', 'Πουλιά']);
  });
});
