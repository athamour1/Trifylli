import { describe, expect, it } from 'vitest';
import { markEntries, mergeMarks, settle, type PendingMark } from '../src/lib/attendance';

describe('παρουσιολόγιο — μόνο ό,τι άλλαξε', () => {
  it('φεύγουν μόνο οι σημάνσεις που περιμένουν, η καθεμία με την ώρα της', () => {
    const pending = new Map<string, PendingMark>([
      ['a', { status: 'PAROUSIA', recordedAt: '2026-10-16T18:01:00.000Z' }],
      ['b', { status: 'APOUSIA', recordedAt: '2026-10-16T18:02:00.000Z' }],
    ]);
    expect(markEntries(pending)).toEqual([
      { memberId: 'a', status: 'PAROUSIA', recordedAt: '2026-10-16T18:01:00.000Z' },
      { memberId: 'b', status: 'APOUSIA', recordedAt: '2026-10-16T18:02:00.000Z' },
    ]);
  });

  it('μετά την αποστολή μένει ό,τι ξαναπατήθηκε στο μεταξύ', () => {
    const pending = new Map<string, PendingMark>([
      ['a', { status: 'PAROUSIA', recordedAt: '2026-10-16T18:01:00.000Z' }],
      ['b', { status: 'APOUSIA', recordedAt: '2026-10-16T18:02:00.000Z' }],
    ]);
    const sent = markEntries(pending);
    pending.set('b', { status: 'ARGOPORIA', recordedAt: '2026-10-16T18:03:00.000Z' });
    settle(pending, sent);
    expect([...pending.keys()]).toEqual(['b']);
  });

  it('η οθόνη: ό,τι έχει ο server, με τις δικές μας σημάνσεις που δεν στάλθηκαν από πάνω', () => {
    const server = [
      { memberId: 'a', status: 'APOUSIA' as const },
      { memberId: 'b', status: null },
      { memberId: 'c', status: 'PAROUSIA' as const },
    ];
    const pending = new Map<string, PendingMark>([['a', { status: 'PAROUSIA', recordedAt: '2026-10-16T18:01:00.000Z' }]]);
    expect(mergeMarks(server, pending)).toEqual({ a: 'PAROUSIA', b: undefined, c: 'PAROUSIA' });
  });
});
