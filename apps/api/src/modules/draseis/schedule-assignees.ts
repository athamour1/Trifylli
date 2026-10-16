/**
 * Από τους τωρινούς υπεύθυνους ενός στοιχείου και τη νέα λίστα: ποιοι μπαίνουν
 * και ποιοι βγαίνουν. Λίστα που δεν στάλθηκε (`undefined`) μένει όπως είναι·
 * `null` ή άδεια λίστα την αδειάζει. Όσοι μένουν δεν αγγίζονται — έτσι μόνο οι
 * νέοι ελέγχονται ότι είναι στελέχη της δράσης.
 *
 * Αντί για όλη τη λίστα, η σελίδα στέλνει «πρόσθεσε / αφαίρεσε» (`change`): δύο
 * που αλλάζουν μαζί τους υπευθύνους του ίδιου στοιχείου δεν σβήνουν ο ένας τον άλλον.
 */
export function planResponsibles(
  current: readonly string[],
  wanted: readonly string[] | null | undefined,
  change: { add?: readonly string[]; remove?: readonly string[] } = {},
): { create: string[]; remove: string[] } {
  if (wanted === undefined) {
    const before = new Set(current);
    return {
      create: [...new Set(change.add ?? [])].filter((userId) => !before.has(userId)),
      remove: [...new Set(change.remove ?? [])].filter((userId) => before.has(userId)),
    };
  }
  const next = new Set(wanted ?? []);
  const before = new Set(current);
  return {
    create: [...next].filter((userId) => !before.has(userId)),
    remove: [...before].filter((userId) => !next.has(userId)),
  };
}
