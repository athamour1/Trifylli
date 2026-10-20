import { describe, expect, it } from 'vitest';
import { portionsCaption, variantPeopleOptions, variantTabs } from '../src/lib/meal-variants';

const gf = { id: 'v1', label: 'Χωρίς γλουτένη', count: 2 };
const veg = { id: 'v2', label: 'Χορτοφαγικό', count: 1 };

describe('παράλληλα γεύματα', () => {
  it('καρτέλες: πρώτα το κύριο με κενή τιμή, μετά τα παράλληλα με τις μερίδες τους', () => {
    expect(variantTabs(21, [gf, veg])).toEqual([
      { label: 'Κύριο · 21', value: '' },
      { label: 'Χωρίς γλουτένη · 2', value: 'v1' },
      { label: 'Χορτοφαγικό · 1', value: 'v2' },
    ]);
    expect(variantTabs(23, [])).toEqual([{ label: 'Κύριο · 23', value: '' }]);
  });

  it('μερίδες: κύριο και παράλληλα με τελείες· χωρίς παράλληλα σκέτος ο αριθμός', () => {
    expect(portionsCaption(21, [gf])).toBe('Μερίδες: κύριο 21 · Χωρίς γλουτένη 2');
    expect(portionsCaption(20, [gf, veg])).toBe('Μερίδες: κύριο 20 · Χωρίς γλουτένη 2 · Χορτοφαγικό 1');
    expect(portionsCaption(23, [])).toBe('Μερίδες: 23');
  });

  it('για ποιους: πρώτα όσοι έχουν αλλεργία/διατροφή, μετά οι υπόλοιποι, αλφαβητικά', () => {
    const participants = [
      { id: 'p1', user: { firstName: 'Άννα', lastName: 'Βασιλείου' } },
      { id: 'p2', user: { firstName: 'Μαρία', lastName: 'Αλεξίου' } },
      { id: 'p3', user: { firstName: 'Ελένη', lastName: 'Ζαχαρίου' } },
      { id: 'p4', user: { firstName: 'Δήμητρα', lastName: 'Γεωργίου' } },
    ];
    const needs = [
      { participantId: 'p3', allergies: 'γλουτένη', diet: null },
      { participantId: 'p4', allergies: 'ξηροί καρποί', diet: 'χορτοφαγική' },
    ];
    expect(variantPeopleOptions(participants, needs)).toEqual([
      { value: 'p4', label: 'Γεωργίου Δήμητρα', needs: 'ξηροί καρποί · χορτοφαγική' },
      { value: 'p3', label: 'Ζαχαρίου Ελένη', needs: 'γλουτένη' },
      { value: 'p2', label: 'Αλεξίου Μαρία', needs: null },
      { value: 'p1', label: 'Βασιλείου Άννα', needs: null },
    ]);
  });
});
