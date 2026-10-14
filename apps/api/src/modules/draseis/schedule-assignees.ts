/**
 * Από τους τωρινούς υπεύθυνους ενός στοιχείου και τη νέα λίστα: ποιοι μπαίνουν
 * και ποιοι βγαίνουν. Λίστα που δεν στάλθηκε (`undefined`) μένει όπως είναι·
 * `null` ή άδεια λίστα την αδειάζει. Όσοι μένουν δεν αγγίζονται — έτσι μόνο οι
 * νέοι ελέγχονται ότι είναι στελέχη της δράσης.
 */
export function planResponsibles(
  current: readonly string[],
  wanted: readonly string[] | null | undefined,
): { create: string[]; remove: string[] } {
  if (wanted === undefined) return { create: [], remove: [] };
  const next = new Set(wanted ?? []);
  const before = new Set(current);
  return {
    create: [...next].filter((userId) => !before.has(userId)),
    remove: [...before].filter((userId) => !next.has(userId)),
  };
}
