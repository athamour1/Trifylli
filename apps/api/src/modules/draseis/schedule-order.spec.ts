import { describe, expect, it } from 'vitest';
import { moveAfter } from './schedule-order';

describe('μετακίνηση στοιχείου μέσα στην ημέρα', () => {
  it('μετά από άλλο στοιχείο, ή πρώτο', () => {
    expect(moveAfter(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveAfter(['a', 'b', 'c'], 'c', null)).toEqual(['c', 'a', 'b']);
    expect(moveAfter(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('η σειρά των άλλων μένει όπως είναι στον server — και ό,τι πρόσθεσε κάποιος στο μεταξύ', () => {
    // Η σελίδα είχε a, b, c· στο μεταξύ μπήκε το n. Η μετακίνηση του c δεν το χάνει.
    expect(moveAfter(['a', 'b', 'n', 'c'], 'c', 'a')).toEqual(['a', 'c', 'b', 'n']);
  });

  it('στοιχείο ή «μετά από» που δεν είναι στην ημέρα: null', () => {
    expect(moveAfter(['a', 'b'], 'x', 'a')).toBeNull();
    expect(moveAfter(['a', 'b'], 'a', 'x')).toBeNull();
    expect(moveAfter(['a', 'b'], 'a', 'a')).toBeNull();
  });
});
