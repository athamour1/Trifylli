import type { DrasiScheduleKind, DrasiSnack } from '@trifylli/shared';

/**
 * Γεύμα του διατροφολογίου: κάθε στοιχείο του ωρολογίου με είδος «Γεύμα», και
 * ό,τι έχει ετικέτα δεκατιανό/απογευματινό (κολατσιό μέσα σε άλλη δραστηριότητα).
 */
export function isMeal(item: { kind: DrasiScheduleKind; snack: DrasiSnack | null }): boolean {
  return item.kind === 'GEVMA' || item.snack !== null;
}

/**
 * Το ποσολόγιο όπως γράφεται (ολόκληρο, κάθε φορά): χωρίς άδειες γραμμές, με τη
 * σειρά της σελίδας. Η ποσότητα είναι κείμενο — «2 kg», «3 πακέτα».
 */
export function ingredientRows(
  items: readonly { label: string; qty?: string; bought?: boolean }[],
): { order: number; label: string; qty: string; bought: boolean }[] {
  return items
    .filter((y) => y.label.trim())
    .map((y, order) => ({ order, label: y.label.trim(), qty: (y.qty ?? '').trim(), bought: y.bought ?? false }));
}
