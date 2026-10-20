import { describe, expect, it } from 'vitest';
import { drasiAccess } from '@trifylli/shared';
import { canSeeFoodNeeds, foodNeedsOf } from './food-needs';

describe('αλλεργίες & διατροφή από τη δήλωση υγείας', () => {
  it('«Ναι» με λεπτομέρειες: το κείμενο· «Όχι» ή αναπάντητο: τίποτα', () => {
    expect(foodNeedsOf({ allergies: true, allergiesDetails: ' φιστίκια ', diet: false })).toEqual({ allergies: 'φιστίκια', diet: null });
    expect(foodNeedsOf({})).toEqual({ allergies: null, diet: null });
  });

  it('«Ναι» χωρίς λεπτομέρειες δεν κρύβεται', () => {
    expect(foodNeedsOf({ allergies: true, allergiesDetails: '  ', diet: true })).toEqual({
      allergies: 'ναι (χωρίς λεπτομέρειες)',
      diet: 'ναι (χωρίς λεπτομέρειες)',
    });
  });

  it('τη βλέπουν όσοι γράφουν στο διατροφολόγιο ή βλέπουν το φαρμακείο — όχι κάθε στέλεχος', () => {
    expect(canSeeFoodNeeds(drasiAccess({ full: false, staff: true, roles: [] }))).toBe(false);
    expect(canSeeFoodNeeds(drasiAccess({ full: false, staff: true, roles: ['MAGEIRISSA'] }))).toBe(true);
    expect(canSeeFoodNeeds(drasiAccess({ full: false, staff: true, roles: ['FARMAKEIO'] }))).toBe(true);
    expect(canSeeFoodNeeds(drasiAccess({ full: true, staff: false, roles: [] }))).toBe(true);
    expect(canSeeFoodNeeds(null)).toBe(false);
  });
});
