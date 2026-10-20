import { describe, expect, it } from 'vitest';
import { mealPortions } from './meal-portions';

describe('μερίδες κύριου και παράλληλων', () => {
  const all = ['a', 'b', 'c', 'd', 'e'];
  it('κύριο = όλοι μείον όσοι έχουν παράλληλο', () => {
    expect(mealPortions(all, [{ participantIds: ['a', 'b'] }, { participantIds: ['c'] }])).toEqual({ main: 2, perVariant: [2, 1] });
  });
  it('ίδιος σε δύο παράλληλα: μετράει σε καθένα, μία φορά έξω από το κύριο', () => {
    expect(mealPortions(all, [{ participantIds: ['a'] }, { participantIds: ['a', 'b'] }])).toEqual({ main: 3, perVariant: [1, 2] });
  });
  it('όποιος δεν είναι πια στη δράση δεν μετράει', () => {
    expect(mealPortions(['a', 'b'], [{ participantIds: ['a', 'gone'] }])).toEqual({ main: 1, perVariant: [1] });
  });
});
