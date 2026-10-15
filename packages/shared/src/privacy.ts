const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Αδιαφανές, μακρύ τμήμα διαδρομής — τα tokens των δημόσιων συνδέσμων (έντυπα, αξιολόγηση). */
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;

/**
 * Ένα URL όπως επιτρέπεται να φτάσει σε logs ή στο error tracking: χωρίς query
 * string και hash, με τα tokens των δημόσιων συνδέσμων ως `:token`. Ένα token σε
 * log είναι ένας σύνδεσμος προς το έντυπο υγείας ενός παιδιού για όποιον το
 * διαβάζει. Τα UUID μένουν — δείχνουν ποια δράση. Δέχεται διαδρομή ή πλήρες URL
 * (το origin μένει όπως είναι).
 */
export function scrubUrlPath(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)?([^?#]*)/i.exec(url);
  const origin = match?.[1] ?? '';
  const path = match?.[2] ?? '';
  return (
    origin +
    path
      .split('/')
      .map((segment) => (OPAQUE_SEGMENT.test(segment) && !UUID.test(segment) ? ':token' : segment))
      .join('/')
  );
}

/** Emails μέσα σε ελεύθερο κείμενο (π.χ. μήνυμα σφάλματος) γίνονται `***@***`. */
export function scrubEmails(text: string): string {
  return text.replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}/g, '***@***');
}
