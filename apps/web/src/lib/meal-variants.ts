import type { DrasiFoodNeedsPerson, DrasiMealVariantView } from '@trifylli/shared';

type VariantHead = Pick<DrasiMealVariantView, 'id' | 'label' | 'count'>;

/** Οι καρτέλες του γεύματος: το κύριο (τιμή `''`) και τα παράλληλα, με τις μερίδες τους. */
export function variantTabs(main: number, variants: readonly VariantHead[]): { label: string; value: string }[] {
  return [{ label: `Κύριο · ${main}`, value: '' }, ...variants.map((v) => ({ label: `${v.label} · ${v.count}`, value: v.id }))];
}

/** «Μερίδες: κύριο 21 · Χωρίς γλουτένη 2» — χωρίς παράλληλα, σκέτο «Μερίδες: 23». */
export function portionsCaption(main: number, variants: readonly VariantHead[]): string {
  if (!variants.length) return `Μερίδες: ${main}`;
  return [`Μερίδες: κύριο ${main}`, ...variants.map((v) => `${v.label} ${v.count}`)].join(' · ');
}

export interface PersonOption {
  value: string;
  label: string;
  /** Αλλεργίες/διατροφή από τη δήλωση υγείας — `null` αν δεν έχει δηλώσει κάτι. */
  needs: string | null;
}

/**
 * Οι επιλογές του «για ποιους»: οι συμμετέχοντες της δράσης, πρώτα όσοι έχουν
 * δηλώσει αλλεργία ή διατροφή, και μέσα σε κάθε ομάδα αλφαβητικά.
 */
export function variantPeopleOptions(
  participants: readonly { id: string; user: { firstName: string; lastName: string } }[],
  needs: readonly Pick<DrasiFoodNeedsPerson, 'participantId' | 'allergies' | 'diet'>[],
): PersonOption[] {
  const byId = new Map(needs.map((n) => [n.participantId, [n.allergies, n.diet].filter(Boolean).join(' · ') || null]));
  return participants
    .map((p) => ({ value: p.id, label: `${p.user.lastName} ${p.user.firstName}`, needs: byId.get(p.id) ?? null }))
    .sort((a, b) => Number(!a.needs) - Number(!b.needs) || a.label.localeCompare(b.label, 'el'));
}
