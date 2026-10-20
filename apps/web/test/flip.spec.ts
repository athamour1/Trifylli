import { describe, expect, it } from 'vitest';
import { flipOffsets } from '../src/lib/flip';

describe('FLIP: πόσο μετακινήθηκε κάθε κάρτα', () => {
  it('από στήλη σε στήλη: ξεκινά από την παλιά θέση (αντίθετα πρόσημα)', () => {
    const before = new Map([['a', { left: 0, top: 100 }], ['b', { left: 0, top: 200 }]]);
    const after = new Map([['a', { left: 320, top: 60 }], ['b', { left: 0, top: 200 }]]);
    expect([...flipOffsets(before, after)]).toEqual([['a', { dx: -320, dy: 40 }]]);
  });

  it('όσα δεν κουνήθηκαν ή μόλις εμφανίστηκαν μένουν ακίνητα (και το «σχεδόν» μηδέν)', () => {
    const before = new Map([['a', { left: 10, top: 10 }]]);
    const after = new Map([['a', { left: 10.4, top: 10 }], ['new', { left: 0, top: 0 }]]);
    expect(flipOffsets(before, after).size).toBe(0);
  });
});
