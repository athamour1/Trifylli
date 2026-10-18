/** Τι έγινε με το email ενός συνδέσμου στο παράθυρο που τον έβγαλε. */
export type LinkEmailState = { status: 'sending' } | { status: 'sent'; to: string[] } | { status: 'error'; error: string };

/**
 * Το token ενός προσωπικού συνδέσμου (`…/forms/<token>`, `…/review/<token>`):
 * ο server το ζητά για να στείλει τον σύνδεσμο με email — δεν τον έχει ο ίδιος,
 * κρατά μόνο το αποτύπωμά του.
 */
export function linkToken(url: string): string {
  return url.split('/').filter(Boolean).at(-1) ?? '';
}

/** Η λεζάντα κάτω από τον σύνδεσμο: σε ποιον θα πάει, πού πήγε ή γιατί όχι. */
export function emailCaption(
  emailTo: readonly string[],
  state: LinkEmailState | undefined,
): { text: string; tone: 'muted' | 'warning' | 'positive' | 'negative' } {
  if (state?.status === 'sent') return { text: `Στάλθηκε στο ${state.to.join(', ')}`, tone: 'positive' };
  if (state?.status === 'error') return { text: state.error, tone: 'negative' };
  if (!emailTo.length) return { text: 'Χωρίς email στην καρτέλα — αντίγραψε τον σύνδεσμο', tone: 'warning' };
  return { text: `Email: ${emailTo.join(', ')}`, tone: 'muted' };
}
