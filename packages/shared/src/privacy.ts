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

/**
 * Η «μορφή» μιας διαδρομής, για ονόματα συναλλαγών στο tracing: ό,τι το
 * `scrubUrlPath`, και επιπλέον UUID και αριθμοί γίνονται `:id`. Έτσι το
 * `GET /api/draseis/<uuid>` είναι μία γραμμή στα στατιστικά, όχι μία ανά δράση.
 */
export function urlTemplate(url: string): string {
  const scrubbed = scrubUrlPath(url);
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)?(.*)$/i.exec(scrubbed);
  const origin = match?.[1] ?? '';
  const path = match?.[2] ?? '';
  return (
    origin +
    path
      .split('/')
      .map((segment) => (UUID.test(segment) || /^\d+$/.test(segment) ? ':id' : segment))
      .join('/')
  );
}

/**
 * Ελεύθερο κείμενο προς logs/tracing (μήνυμα log, περιγραφή span, breadcrumb):
 * emails → `***@***`, και κάθε URL ή διαδρομή μέσα του περνά από το
 * `scrubUrlPath` (χωρίς query, tokens ως `:token`).
 */
export function scrubText(text: string): string {
  // Πρώτα τα URL (φεύγει το query, μαζί με ό,τι email είχε μέσα), μετά τα emails.
  return scrubEmails(text.replace(/(?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s"'<>]*/gi, (url) => scrubUrlPath(url)));
}
