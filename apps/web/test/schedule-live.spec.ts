import { describe, expect, it } from 'vitest';
import { delaysOf, liveDay } from '../src/lib/schedule-live';

const item = (id: string, startsAt: string, endsAt: string, delayMin = 0) => ({ id, startsAt, endsAt, delayMin });

describe('η δράση ζωντανά', () => {
  const items = [
    item('a', '2026-10-28T07:00:00Z', '2026-10-28T08:00:00Z'),
    item('b', '2026-10-28T08:00:00Z', '2026-10-28T08:30:00Z', 15),
    item('c', '2026-10-28T08:30:00Z', '2026-10-28T09:00:00Z', 15),
  ];

  it('τώρα: ό,τι τρέχει με τη διορθωμένη ώρα, πόσο μένει, και τι ακολουθεί', () => {
    const live = liveDay(items, new Date('2026-10-28T08:10:00Z'));
    // Η «b» αρχίζει 08:15 (καθυστέρηση 15΄): η «a» κρατά ως τότε.
    expect(live.state).toBe('during');
    expect(live.current?.id).toBe('a');
    expect(live.remainingMin).toBe(5);
    expect(live.next.map((i) => i.id)).toEqual(['b', 'c']);
    expect(live.next[0]?.start.toISOString()).toBe('2026-10-28T08:15:00.000Z');
  });

  it('μέσα σε στοιχείο: τα λεπτά που μένουν', () => {
    const live = liveDay(items, new Date('2026-10-28T08:20:00Z'));
    expect(live.state).toBe('during');
    expect(live.current?.id).toBe('b');
    expect(live.remainingMin).toBe(25);
    expect(live.next.map((i) => i.id)).toEqual(['c']);
  });

  it('πριν και μετά την ημέρα', () => {
    expect(liveDay(items, new Date('2026-10-28T06:00:00Z')).state).toBe('before');
    expect(liveDay(items, new Date('2026-10-28T10:00:00Z')).state).toBe('after');
    expect(liveDay([], new Date()).state).toBe('empty');
  });

  it('η καθυστέρηση αθροίζεται από το στοιχείο όπου δηλώθηκε (ίδια με τον server)', () => {
    expect([...delaysOf(['a', 'b', 'c'], [{ itemId: 'b', minutes: 10 }, { itemId: 'c', minutes: -5 }]).values()]).toEqual([0, 10, 5]);
  });
});
