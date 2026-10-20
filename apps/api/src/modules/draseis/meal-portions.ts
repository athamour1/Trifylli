/** Μερίδες: κάθε παράλληλο όσοι είναι ακόμα στη δράση· το κύριο οι υπόλοιποι. */
export function mealPortions(
  participantIds: readonly string[],
  variants: readonly { participantIds: readonly string[] }[],
): { main: number; perVariant: number[] } {
  const present = new Set(participantIds);
  const elsewhere = new Set<string>();
  const perVariant = variants.map((v) => {
    const ids = [...new Set(v.participantIds)].filter((pid) => present.has(pid));
    ids.forEach((pid) => elsewhere.add(pid));
    return ids.length;
  });
  return { main: present.size - elsewhere.size, perVariant };
}
