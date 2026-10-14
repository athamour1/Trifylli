import { describe, expect, it } from 'vitest';
import { planGuestTopika } from './guest-topika';

const stored = [
  { id: 'a', topikoName: 'Χαλάνδρι' },
  { id: 'b', topikoName: 'Ελευσίνα' },
];

describe('planGuestTopika', () => {
  it('ό,τι μένει κρατά το id του — δεν σβήνεται για να ξαναγραφτεί', () => {
    const plan = planGuestTopika(stored, [
      { id: 'a', topikoName: 'Χαλάνδρι' },
      { id: 'b', topikoName: 'Ελευσίνα' },
    ]);
    expect(plan.update.map((u) => u.id)).toEqual(['a', 'b']);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('μετονομασία: το id της φόρμας κρατά την ίδια εγγραφή', () => {
    const plan = planGuestTopika(stored, [{ id: 'a', topikoName: 'Χαλάνδρι Αττικής' }]);
    expect(plan.update).toEqual([{ id: 'a', item: { id: 'a', topikoName: 'Χαλάνδρι Αττικής' } }]);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual(['b']);
  });

  it('χωρίς id ταιριάζει με το όνομα, άσχετα από τόνους, πεζά και κενά', () => {
    const plan = planGuestTopika(stored, [{ topikoName: '  ΧΑΛΑΝΔΡΙ ' }, { topikoName: 'ελευσινα' }]);
    expect(plan.update).toEqual([
      { id: 'a', item: { topikoName: '  ΧΑΛΑΝΔΡΙ ' } },
      { id: 'b', item: { topikoName: 'ελευσινα' } },
    ]);
    expect(plan.create).toEqual([]);
  });

  it('νέο όνομα είναι νέο Τοπικό· όσα έλειψαν σβήνονται', () => {
    const plan = planGuestTopika(stored, [{ topikoName: 'Μαρούσι' }]);
    expect(plan.create).toEqual([{ topikoName: 'Μαρούσι' }]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual(['a', 'b']);
  });

  it('το id κερδίζει το όνομα: η κάρτα που μετονομάστηκε δεν παίρνει άλλη εγγραφή', () => {
    const plan = planGuestTopika(stored, [{ id: 'a', topikoName: 'Ελευσίνα' }]);
    expect(plan.update).toEqual([{ id: 'a', item: { id: 'a', topikoName: 'Ελευσίνα' } }]);
    expect(plan.remove).toEqual(['b']);
  });

  it('id που δεν είναι της δράσης αγνοείται — το Τοπικό γράφεται ως νέο', () => {
    const plan = planGuestTopika(stored, [{ id: 'x', topikoName: 'Μαρούσι' }]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toEqual([{ id: 'x', topikoName: 'Μαρούσι' }]);
  });

  it('το ίδιο Τοπικό δύο φορές απορρίπτει τη λίστα χωρίς να αλλάξει τίποτα', () => {
    const plan = planGuestTopika(stored, [{ topikoName: 'Μαρούσι' }, { topikoName: 'μαρουσι' }]);
    expect(plan.duplicates).toEqual(['μαρουσι']);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });
});
