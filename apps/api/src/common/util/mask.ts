/**
 * Απόκρυψη προσωπικών δεδομένων στα logs.
 *
 * Τα logs ταξιδεύουν: σε αρχεία, σε συλλέκτες, σε screenshots που στέλνει
 * κάποιος για να ζητήσει βοήθεια. Ένα email στελέχους δεν χρειάζεται να
 * ταξιδεύει μαζί τους — αρκεί να ξεχωρίζει ποιον αφορά η γραμμή.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(χωρίς email)';
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}
