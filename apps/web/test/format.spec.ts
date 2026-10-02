import { describe, expect, it } from 'vitest';
import { formatDateRange, formatDuration, formatEuro } from '../src/lib/format';

describe('formatDuration', () => {
  it('δείχνει λεπτά κάτω από την ώρα', () => {
    expect(formatDuration(45)).toBe('45΄');
  });

  it('συμπτύσσει τις ακέραιες ώρες', () => {
    expect(formatDuration(120)).toBe('2ώ');
  });

  it('συνδυάζει ώρες και λεπτά', () => {
    expect(formatDuration(105)).toBe('1ώ 45΄');
  });
});

describe('formatDateRange', () => {
  it('συμπτύσσει τη μονοήμερη σε μία ημερομηνία', () => {
    const day = '2026-11-14T08:00:00Z';
    expect(formatDateRange(day, '2026-11-14T19:00:00Z')).not.toContain('–');
  });

  it('δείχνει εύρος για πολυήμερη', () => {
    expect(formatDateRange('2027-07-05T00:00:00Z', '2027-07-12T00:00:00Z')).toContain('–');
  });
});

describe('formatEuro', () => {
  it('επιστρέφει παύλα για κενή τιμή', () => {
    expect(formatEuro(null)).toBe('—');
  });

  it('μορφοποιεί σε ευρώ', () => {
    expect(formatEuro(60)).toContain('60');
    expect(formatEuro(60)).toContain('€');
  });
});
