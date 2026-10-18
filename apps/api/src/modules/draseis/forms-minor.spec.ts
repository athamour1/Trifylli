import { describe, expect, it } from 'vitest';
import { minorAt } from './draseis-forms.service';

const START = new Date('2026-11-14');

describe('ανήλικος στα έντυπα της δράσης', () => {
  it('στέλεχος χωρίς ημερομηνία γέννησης: ενήλικος — μόνο έντυπο υγείας στελέχους', () => {
    expect(minorAt(null, START, 'STELEXOS')).toBe(false);
  });

  it('παιδί χωρίς ημερομηνία γέννησης: ανήλικο — καλύτερα ένα έντυπο παραπάνω', () => {
    expect(minorAt(null, START, 'MELOS')).toBe(true);
  });

  it('με ημερομηνία γέννησης μετράει η ηλικία, και για στέλεχος 17 ετών', () => {
    expect(minorAt(new Date('2009-06-01'), START, 'STELEXOS')).toBe(true);
    expect(minorAt(new Date('2000-06-01'), START, 'STELEXOS')).toBe(false);
    expect(minorAt(new Date('2007-06-01'), START, 'MELOS')).toBe(false);
  });
});
