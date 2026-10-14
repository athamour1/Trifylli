import { describe, expect, it } from 'vitest';
import { ingredientPayload, sameIngredients } from '../src/components/drasi/types';

const row = (label: string, qty = '', bought = false, key = 1) => ({ key, label, qty, bought });

describe('ingredientPayload', () => {
  it('οι άδειες γραμμές δεν φεύγουν, τα κείμενα χωρίς κενά στις άκρες', () => {
    expect(ingredientPayload([row(' μακαρόνια ', ' 4 kg '), row(''), row('κιμάς', '3 kg', true)])).toEqual([
      { label: 'μακαρόνια', qty: '4 kg', bought: false },
      { label: 'κιμάς', qty: '3 kg', bought: true },
    ]);
  });
});

describe('sameIngredients', () => {
  const server = [{ label: 'μακαρόνια', qty: '4 kg', bought: false }];

  it('ίδια λίστα με του server, ακόμα κι αν μόλις μπήκε μια άδεια γραμμή', () => {
    expect(sameIngredients([row('μακαρόνια', '4 kg', false, 3), row('', '', false, 4)], server)).toBe(true);
  });

  it('άλλο υλικό, ποσότητα ή «αγοράστηκε»: διαφορετική', () => {
    expect(sameIngredients([row('ρύζι', '4 kg')], server)).toBe(false);
    expect(sameIngredients([row('μακαρόνια', '5 kg')], server)).toBe(false);
    expect(sameIngredients([row('μακαρόνια', '4 kg', true)], server)).toBe(false);
    expect(sameIngredients([], server)).toBe(false);
  });
});
