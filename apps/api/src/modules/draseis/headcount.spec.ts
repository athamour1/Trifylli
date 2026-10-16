import { describe, expect, it } from 'vitest';
import { headcountTotals, newerCheck } from './headcount';

describe('καταμέτρηση', () => {
  it('σύνολα: παρόντες από τις ομάδες που μετρήθηκαν· οι άδειες ομάδες δεν μετράνε', () => {
    const totals = headcountTotals([
      { members: ['a', 'b', 'c'], check: { absentIds: ['c'] } },
      { members: ['d', 'e'], check: { absentIds: [] } },
      { members: ['f'], check: null },
      { members: [], check: null },
    ]);
    expect(totals).toEqual({ members: 6, present: 4, absent: 1, checkedGroups: 2, groups: 3 });
  });

  it('χωρίς σήμα η μέτρηση φτάνει αργότερα: κρατιέται η νεότερη, όχι η τελευταία που έφτασε', () => {
    const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00Z`);
    expect(newerCheck(null, at('10:00'))).toBe(true);
    expect(newerCheck({ checkedAt: at('10:05') }, at('10:00'))).toBe(false);
    expect(newerCheck({ checkedAt: at('10:00') }, at('10:05'))).toBe(true);
  });
});
