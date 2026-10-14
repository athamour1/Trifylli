/**
 * Πριν ένα φιλοξενούμενο στέλεχος πάρει λογαριασμό με αυτό το email: ποιος το
 * έχει ήδη στο Τοπικό. Άτομο του μητρώου ⇒ μπαίνει στη δράση από το μητρώο, όχι
 * ως εξωτερικό. Άλλο εξωτερικό στέλεχος ⇒ θα γινόταν δεύτερο άτομο με το ίδιο
 * email (και το email είναι μοναδικό ανά Τοπικό).
 */
export function accessEmailProblem(
  owner: { id: string; accountRole: string | null } | null,
  guestId: string,
): 'registry' | 'external' | null {
  if (!owner || owner.id === guestId) return null;
  return owner.accountRole === 'EXTERNAL' ? 'external' : 'registry';
}
