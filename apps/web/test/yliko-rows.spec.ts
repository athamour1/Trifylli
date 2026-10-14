import { describe, expect, it } from 'vitest';
import { sameYliko, ylikoPayload } from '../src/components/drasi/types';

const row = (label: string, qty = 1, packed = false, key = 1) => ({ key, label, qty, packed });

describe('ylikoPayload', () => {
  it('οι άδειες γραμμές δεν φεύγουν — ο server τις πετά ούτως ή άλλως', () => {
    expect(ylikoPayload([row('σχοινί', 2), row(''), row('   ')])).toEqual([{ label: 'σχοινί', qty: 2, packed: false }]);
  });

  it('το όνομα χωρίς κενά στις άκρες, η ποσότητα ακέραιη και τουλάχιστον 1', () => {
    expect(ylikoPayload([row('  χαρτόνι ', 0), row('μαρκαδόροι', 2.6, true), row('κόλλα', Number.NaN)])).toEqual([
      { label: 'χαρτόνι', qty: 1, packed: false },
      { label: 'μαρκαδόροι', qty: 3, packed: true },
      { label: 'κόλλα', qty: 1, packed: false },
    ]);
  });
});

describe('sameYliko', () => {
  const server = [{ label: 'σχοινί', qty: 2, packed: false }];

  it('ίδια λίστα με του server, ακόμα κι αν μόλις μπήκε μια άδεια γραμμή', () => {
    expect(sameYliko([row('σχοινί', 2, false, 7), row('', 1, false, 8)], server)).toBe(true);
  });

  it('άλλο όνομα, ποσότητα ή «στο σακίδιο»: διαφορετική', () => {
    expect(sameYliko([row('σχοινιά', 2)], server)).toBe(false);
    expect(sameYliko([row('σχοινί', 3)], server)).toBe(false);
    expect(sameYliko([row('σχοινί', 2, true)], server)).toBe(false);
    expect(sameYliko([], server)).toBe(false);
  });
});
