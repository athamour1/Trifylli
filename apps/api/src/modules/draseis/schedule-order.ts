/**
 * Η νέα σειρά μιας ημέρας όταν ένα στοιχείο μπαίνει μετά από άλλο (`null` =
 * πρώτο). Εφαρμόζεται στη σειρά που έχει **ο server** εκείνη τη στιγμή — όχι σε
 * όλη τη λίστα όπως τη βλέπει η σελίδα — ώστε ό,τι πρόσθεσε ή μετακίνησε κάποιος
 * άλλος στο μεταξύ να μη χαθεί. `null` όταν κάποιο από τα δύο δεν είναι στην ημέρα.
 */
export function moveAfter(ids: readonly string[], itemId: string, afterId: string | null): string[] | null {
  if (!ids.includes(itemId) || itemId === afterId) return null;
  const rest = ids.filter((id) => id !== itemId);
  if (afterId === null) return [itemId, ...rest];
  const at = rest.indexOf(afterId);
  if (at < 0) return null;
  return [...rest.slice(0, at + 1), itemId, ...rest.slice(at + 1)];
}
