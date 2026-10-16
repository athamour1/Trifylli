/**
 * Τυχαίο id — και σε σελίδα χωρίς HTTPS (π.χ. δοκιμή από κινητό στο τοπικό
 * δίκτυο), όπου το `crypto.randomUUID` δεν υπάρχει.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Η ταυτότητα αυτής της καρτέλας. Τη στέλνει κάθε αίτημα στο API
 * (`COLLAB_CLIENT_HEADER`), ώστε το «άλλαξε αυτό» που ακολουθεί να ξέρει από
 * πού ήρθε — η καρτέλα που έκανε την αλλαγή δεν χρειάζεται να ξαναφορτώσει.
 */
export const CLIENT_ID = randomId();
