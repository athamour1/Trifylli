import { describe, expect, it } from 'vitest';
import type { DrasiTrofodosiaDay } from '@trifylli/shared';
import { dayProgress, defaultDay } from '../src/lib/trofodosia';

const ingredient = (bought: boolean) => ({ id: String(Math.random()), label: 'x', qty: '', bought, boughtBy: null, boughtAt: null });
const extra = (bought: boolean) => ({ id: String(Math.random()), date: '2026-11-14', label: 'y', qty: '', note: null, requestedBy: null, bought, boughtBy: null, boughtAt: null });

describe('τροφοδοσία', () => {
  it('η πρόοδος της ημέρας μετρά και τα υλικά των γευμάτων και τα επιπλέον', () => {
    const day: DrasiTrofodosiaDay = {
      date: '2026-11-14',
      meals: [{ itemId: 'm', title: 'Μεσημεριανό', kind: 'GEVMA', snack: null, startsAt: '', ingredients: [ingredient(true), ingredient(false)] }],
      extras: [extra(true), extra(false), extra(false)],
    };
    expect(dayProgress(day)).toEqual({ bought: 2, total: 5 });
  });

  it('ανοίγει στη σημερινή ημέρα αν είναι μέσα στη δράση, αλλιώς στην πρώτη', () => {
    const dates = ['2026-11-14', '2026-11-15', '2026-11-16'];
    expect(defaultDay(dates, '2026-11-15')).toBe('2026-11-15');
    expect(defaultDay(dates, '2026-10-19')).toBe('2026-11-14');
    expect(defaultDay([], '2026-10-19')).toBeNull();
  });
});
