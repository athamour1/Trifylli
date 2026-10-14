import { describe, expect, it } from 'vitest';
import { responsiblesLabel } from '../src/components/drasi/types';

describe('responsiblesLabel', () => {
  it('ένας υπεύθυνος, ή κανένας ακόμα: ενικός', () => {
    expect(responsiblesLabel(1)).toBe('Υπεύθυνος');
    expect(responsiblesLabel(0)).toBe('Υπεύθυνος');
  });

  it('από δύο και πάνω: πληθυντικός', () => {
    expect(responsiblesLabel(2)).toBe('Υπεύθυνοι');
    expect(responsiblesLabel(5)).toBe('Υπεύθυνοι');
  });
});
