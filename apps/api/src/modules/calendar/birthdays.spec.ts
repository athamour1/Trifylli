import { describe, expect, it } from 'vitest';
import { addDays, birthdayOccurrences, birthdaysIn } from './birthdays';

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

describe('γενέθλια γύρω από συγκέντρωση / κατά τη δράση', () => {
  const people = [
    { id: 'u-2', firstName: 'Σοφία', lastName: 'Νίκα', birthDate: born('1995-10-25') },
    { id: 'u-1', firstName: 'Μαρία', lastName: 'Παππά', birthDate: born('2016-10-22') },
    { id: 'u-1', firstName: 'Μαρία', lastName: 'Παππά', birthDate: born('2016-10-22') },
    { id: 'u-3', firstName: 'Ελένη', lastName: 'Ζήση', birthDate: born('2016-10-26') },
    { id: 'u-4', firstName: 'Άννα', lastName: 'Χωρίς', birthDate: null },
  ];

  it('3 μέρες πριν έως 3 μετά: μία φορά ο καθένας, με τη σειρά της μέρας', () => {
    const meeting = new Date('2026-10-23T12:00:00Z');
    expect(birthdaysIn(people, addDays(meeting, -3), addDays(meeting, 3))).toEqual([
      { userId: 'u-1', firstName: 'Μαρία', lastName: 'Παππά', day: '2026-10-22', age: 10 },
      { userId: 'u-2', firstName: 'Σοφία', lastName: 'Νίκα', day: '2026-10-25', age: 31 },
      { userId: 'u-3', firstName: 'Ελένη', lastName: 'Ζήση', day: '2026-10-26', age: 10 },
    ]);
  });

  it('η 4η μέρα μετά μένει έξω', () => {
    const meeting = new Date('2026-10-22T12:00:00Z');
    expect(birthdaysIn(people, addDays(meeting, -3), addDays(meeting, 3)).map((b) => b.userId)).toEqual(['u-1', 'u-2']);
  });
});
