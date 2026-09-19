import { describe, expect, it } from 'vitest';
import { ageInYears, ageToBirthDateBounds } from './age';

const today = new Date('2026-09-30T00:00:00Z');

describe('ageToBirthDateBounds', () => {
  it('επιστρέφει null χωρίς φίλτρο', () => {
    expect(ageToBirthDateBounds(undefined, undefined, today)).toBeNull();
  });

  it('το κάτω όριο ηλικίας γίνεται άνω όριο ημερομηνίας', () => {
    const bounds = ageToBirthDateBounds(11, undefined, today);
    expect(bounds?.lte?.toISOString()).toBe('2015-09-30T00:00:00.000Z');
    expect(bounds?.gt).toBeUndefined();
  });

  it('το άνω όριο ηλικίας περιλαμβάνει όλη τη χρονιά', () => {
    // ageMax=14 ⇒ μέλη 14 ετών και 11 μηνών περνούν το φίλτρο.
    const bounds = ageToBirthDateBounds(undefined, 14, today);
    expect(bounds?.gt?.toISOString()).toBe('2011-09-30T00:00:00.000Z');
  });

  it('τα όρια του κλάδου Οδηγών κρατούν 11 έως 14 ετών', () => {
    const bounds = ageToBirthDateBounds(11, 14, today);
    const inRange = (iso: string) =>
      new Date(iso) <= bounds!.lte! && new Date(iso) > bounds!.gt!;

    expect(inRange('2015-09-30')).toBe(true); // ακριβώς 11
    expect(inRange('2015-10-01')).toBe(false); // 10 ετών, πολύ μικρό
    expect(inRange('2011-10-01')).toBe(true); // 14 ετών και 11 μηνών
    expect(inRange('2011-09-29')).toBe(false); // μόλις έγινε 15
  });
});

describe('ageInYears', () => {
  it('επιστρέφει null χωρίς ημερομηνία γέννησης', () => {
    expect(ageInYears(null, today)).toBeNull();
  });

  it('δεν προσθέτει έτος πριν τα γενέθλια', () => {
    expect(ageInYears(new Date('2015-10-01T00:00:00Z'), today)).toBe(10);
  });

  it('προσθέτει έτος την ημέρα των γενεθλίων', () => {
    expect(ageInYears(new Date('2015-09-30T00:00:00Z'), today)).toBe(11);
  });
});
