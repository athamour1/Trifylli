import { describe, expect, it } from 'vitest';
import { isMeal } from './diatrofologio';

describe('isMeal', () => {
  it('κάθε στοιχείο με είδος «Γεύμα» είναι γεύμα', () => {
    expect(isMeal({ kind: 'GEVMA', snack: null })).toBe(true);
  });

  it('και ό,τι έχει ετικέτα δεκατιανό ή απογευματινό, όποιο κι αν είναι το είδος του', () => {
    expect(isMeal({ kind: 'DRASTIRIOTITA', snack: 'DEKATIANO' })).toBe(true);
    expect(isMeal({ kind: 'METAKINISI', snack: 'APOGEVMATINO' })).toBe(true);
  });

  it('τα υπόλοιπα όχι', () => {
    expect(isMeal({ kind: 'DRASTIRIOTITA', snack: null })).toBe(false);
    expect(isMeal({ kind: 'XEKOURASI', snack: null })).toBe(false);
  });
});
