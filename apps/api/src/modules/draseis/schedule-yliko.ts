/**
 * Η λίστα υλικού ενός στοιχείου όπως γράφεται (ολόκληρη, κάθε φορά — όπως στις
 * συγκεντρώσεις): χωρίς άδειες γραμμές, με τη σειρά που έχει στη σελίδα.
 */
export function ylikoRows(
  items: readonly { label: string; qty?: number; packed?: boolean }[],
): { order: number; label: string; qty: number; packed: boolean }[] {
  return items
    .filter((y) => y.label.trim())
    .map((y, order) => ({ order, label: y.label.trim(), qty: y.qty ?? 1, packed: y.packed ?? false }));
}
