import { describe, expect, it } from 'vitest';
import { ylikoRows } from './schedule-yliko';

describe('ylikoRows', () => {
  it('οι άδειες γραμμές πέφτουν, τα ονόματα χωρίς κενά στις άκρες, με τη σειρά της λίστας', () => {
    expect(ylikoRows([{ label: ' σχοινί ', qty: 2 }, { label: '   ' }, { label: 'χαρτόνι', packed: true }])).toEqual([
      { order: 0, label: 'σχοινί', qty: 2, packed: false },
      { order: 1, label: 'χαρτόνι', qty: 1, packed: true },
    ]);
  });

  it('άδεια λίστα: τίποτα', () => {
    expect(ylikoRows([])).toEqual([]);
  });
});
