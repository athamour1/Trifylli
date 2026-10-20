import { describe, expect, it } from 'vitest';
import { CURSOR_RECENT_MS, quietCursorNames } from '../src/lib/quiet-cursors';

describe('ονόματα πάνω από τους κέρσορες των άλλων', () => {
  const now = 100_000;

  it('με λίγους κέρσορες φαίνονται πάντα', () => {
    expect(quietCursorNames(['Μαρία Π.', 'Νίκος Γ.', 'Άννα Β.'], new Map(), now).size).toBe(0);
  });

  it('με πολλούς, μόνο όσων μόλις κουνήθηκαν — οι υπόλοιποι σωπαίνουν', () => {
    const names = ['Μαρία Π.', 'Νίκος Γ.', 'Άννα Β.', 'Ελένη Κ.', 'Γιώργος Α.'];
    const lastActive = new Map([
      ['Μαρία Π.', now - 500],
      ['Νίκος Γ.', now - CURSOR_RECENT_MS - 1],
    ]);
    expect([...quietCursorNames(names, lastActive, now)].sort()).toEqual(['Άννα Β.', 'Γιώργος Α.', 'Ελένη Κ.', 'Νίκος Γ.'].sort());
  });

  it('ο ίδιος από δύο καρτέλες μετρά μία φορά στο «πολλοί»', () => {
    expect(quietCursorNames(['Μαρία Π.', 'Μαρία Π.', 'Νίκος Γ.', 'Άννα Β.'], new Map(), now).size).toBe(0);
  });
});
