import { describe, expect, it } from 'vitest';
import { birthdayOccurrences } from './birthdays';

const born = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('γενέθλια στο ημερολόγιο', () => {
  it('η ηλικία που κλείνει, μέσα στον μήνα', () => {
    expect(
      birthdayOccurrences(born('2016-10-22'), new Date('2026-09-30T21:00:00Z'), new Date('2026-10-31T21:59:59Z')),
    ).toEqual([{ day: '2026-10-22', age: 10 }]);
  });

  it('τα σημερινά γενέθλια μένουν, ακόμα κι αν η λίστα ζητά από «τώρα»', () => {
    expect(
      birthdayOccurrences(born('2016-10-20'), new Date('2026-10-20T15:30:00Z'), new Date('2027-01-18T15:30:00Z')),
    ).toEqual([{ day: '2026-10-20', age: 10 }]);
  });

  it('διάστημα που περνά στη νέα χρονιά', () => {
    expect(
      birthdayOccurrences(born('2015-01-05'), new Date('2026-11-01T00:00:00Z'), new Date('2027-01-30T00:00:00Z')),
    ).toEqual([{ day: '2027-01-05', age: 12 }]);
  });

  it('29/2: τα μη δίσεκτα έτη στις 28/2', () => {
    expect(
      birthdayOccurrences(born('2016-02-29'), new Date('2027-02-01T00:00:00Z'), new Date('2027-03-01T00:00:00Z')),
    ).toEqual([{ day: '2027-02-28', age: 11 }]);
    expect(
      birthdayOccurrences(born('2016-02-29'), new Date('2028-02-01T00:00:00Z'), new Date('2028-03-01T00:00:00Z')),
    ).toEqual([{ day: '2028-02-29', age: 12 }]);
  });

  it('τίποτα εκτός διαστήματος ή πριν από τα πρώτα γενέθλια', () => {
    expect(
      birthdayOccurrences(born('2016-12-01'), new Date('2026-10-01T00:00:00Z'), new Date('2026-10-31T00:00:00Z')),
    ).toEqual([]);
    expect(
      birthdayOccurrences(born('2026-10-10'), new Date('2026-10-01T00:00:00Z'), new Date('2026-10-31T00:00:00Z')),
    ).toEqual([]);
  });
});
