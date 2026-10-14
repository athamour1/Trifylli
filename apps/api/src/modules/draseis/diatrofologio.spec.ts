import { describe, expect, it } from 'vitest';
import { ingredientRows, isMeal } from './diatrofologio';

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

describe('ingredientRows', () => {
  it('οι άδειες γραμμές πέφτουν, τα κείμενα χωρίς κενά στις άκρες, με τη σειρά της λίστας', () => {
    expect(ingredientRows([{ label: ' μακαρόνια ', qty: ' 4 kg ' }, { label: '  ' }, { label: 'κιμάς', qty: '3 kg', bought: true }])).toEqual([
      { order: 0, label: 'μακαρόνια', qty: '4 kg', bought: false },
      { order: 1, label: 'κιμάς', qty: '3 kg', bought: true },
    ]);
  });

  it('χωρίς ποσότητα: κενό κείμενο', () => {
    expect(ingredientRows([{ label: 'αλάτι' }])).toEqual([{ order: 0, label: 'αλάτι', qty: '', bought: false }]);
  });
});
