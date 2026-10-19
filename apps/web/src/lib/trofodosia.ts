import type { DrasiTrofodosiaDay } from '@trifylli/shared';

/** Πόσα αγοράστηκαν από όσα χρειάζεται η ημέρα — υλικά των γευμάτων και επιπλέον. */
export function dayProgress(day: DrasiTrofodosiaDay): { bought: number; total: number } {
  const all = [...day.meals.flatMap((m) => m.ingredients), ...day.extras];
  return { bought: all.filter((x) => x.bought).length, total: all.length };
}

/** Η ημέρα που ανοίγει η λίστα: η σημερινή, αν είναι μέσα στη δράση· αλλιώς η πρώτη. */
export function defaultDay(dates: readonly string[], today: string): string | null {
  return dates.includes(today) ? today : (dates[0] ?? null);
}
