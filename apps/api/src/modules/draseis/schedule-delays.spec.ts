import { describe, expect, it } from 'vitest';
import { delaysOf, remindersDue } from './schedule-delays';

describe('καθυστέρηση στο ωρολόγιο', () => {
  it('μετρά από το στοιχείο όπου δηλώθηκε και μετά — αθροίζονται, και γίνεται και «κερδίσαμε»', () => {
    const delays = delaysOf(['a', 'b', 'c', 'd'], [
      { itemId: 'b', minutes: 15 },
      { itemId: 'd', minutes: 10 },
      { itemId: 'd', minutes: -5 },
    ]);
    expect([...delays.entries()]).toEqual([
      ['a', 0],
      ['b', 15],
      ['c', 15],
      ['d', 20],
    ]);
  });

  it('καθυστέρηση σε στοιχείο άλλης ημέρας δεν μετράει εδώ', () => {
    expect(delaysOf(['a'], [{ itemId: 'x', minutes: 30 }]).get('a')).toBe(0);
  });
});

describe('υπενθυμίσεις 10΄ πριν', () => {
  const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00Z`);

  it('με τη διορθωμένη ώρα: ό,τι αρχίζει σε 10΄ (και όσα «χάθηκαν» στα 2 τελευταία λεπτά)', () => {
    const items = [
      { id: 'a', startsAt: at('10:10'), delayMin: 0 },
      { id: 'b', startsAt: at('10:00'), delayMin: 10 },
      { id: 'c', startsAt: at('10:30'), delayMin: 0 },
      { id: 'd', startsAt: at('10:09'), delayMin: 0 },
      { id: 'e', startsAt: at('10:07'), delayMin: 0 },
    ];
    expect(remindersDue(items, at('10:00')).map((r) => [r.id, r.startsAt.toISOString()])).toEqual([
      ['a', '2026-10-28T10:10:00.000Z'],
      ['b', '2026-10-28T10:10:00.000Z'],
      ['d', '2026-10-28T10:09:00.000Z'],
    ]);
  });
});
