import type { DrasiScheduleKind, DrasiSnack } from '@trifylli/shared';

/**
 * Γεύμα του διατροφολογίου: κάθε στοιχείο του ωρολογίου με είδος «Γεύμα», και
 * ό,τι έχει ετικέτα δεκατιανό/απογευματινό (κολατσιό μέσα σε άλλη δραστηριότητα).
 */
export function isMeal(item: { kind: DrasiScheduleKind; snack: DrasiSnack | null }): boolean {
  return item.kind === 'GEVMA' || item.snack !== null;
}
