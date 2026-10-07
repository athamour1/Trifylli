/**
 * Εκτύπωση ενός αποκομμένου φύλλου σε **ανεξάρτητο iframe**.
 *
 * Γιατί όχι `window.print()` της ίδιας σελίδας: εκεί κρύβαμε όλη την εφαρμογή με
 * `@media print` και το φύλλο ζούσε σε `display:none`, που κάνει την εκτύπωση
 * ευαίσθητη (εικόνες που δεν rasterάρουν, χρονισμοί, κατάσταση οθόνης). Ένα
 * iframe είναι ένα καθαρό, κανονικά σχεδιασμένο έγγραφο: ό,τι βάλουμε μέσα
 * τυπώνεται αξιόπιστα, ανεξάρτητα από την υπόλοιπη σελίδα.
 */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Μαζεύει όλους τους κανόνες `@media print` από τα stylesheets της σελίδας. */
function collectPrintCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet — δεν διαβάζεται· το προσπερνάμε.
      continue;
    }
    for (const rule of Array.from(rules)) {
      // Οι κανόνες μέσα στο `@media print` εφαρμόζονται ως κανονικοί μέσα στο
      // iframe (το iframe ΕΙΝΑΙ το φύλλο εκτύπωσης).
      if (rule instanceof CSSMediaRule && rule.conditionText.includes('print')) {
        for (const inner of Array.from(rule.cssRules)) css += `${inner.cssText}\n`;
      }
      // Οι @font-face της εφαρμογής (self-hosted Inter): το iframe είναι άλλο
      // έγγραφο και δεν τις κληρονομεί· τα αρχεία είναι same-origin, άρα περνούν την CSP.
      if (rule instanceof CSSFontFaceRule) css += `${rule.cssText}\n`;
    }
  }
  return css;
}

/** Περιμένει να φορτώσουν όλες οι εικόνες του εγγράφου (data URLs: ακαριαία). */
async function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? img.decode().catch(() => undefined)
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
}

/**
 * Τυπώνει το HTML ενός στοιχείου (π.χ. `.print-sheet`) σε κρυφό iframe.
 * Το στοιχείο πρέπει να έχει ήδη το περιεχόμενό του έτοιμο (εικόνες ως data URLs).
 */
export async function printElement(element: HTMLElement, title?: string): Promise<void> {
  const css = collectPrintCss();

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error('Αδυναμία δημιουργίας iframe εκτύπωσης.');
  }

  // Το iframe είναι ξεχωριστό έγγραφο: οι @font-face της Inter αντιγράφονται
  // από τα stylesheets της εφαρμογής (βλ. collectPrintCss), αλλιώς η εκτύπωση
  // πέφτει στο default serif του browser. Google Fonts ΔΕΝ χρησιμοποιούνται —
  // τα κόβει η CSP και δεν δουλεύουν offline.
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
      // Ο τίτλος του εγγράφου γίνεται το προτεινόμενο όνομα αρχείου στο «Αποθήκευση ως PDF».
      (title ? `<title>${escapeHtml(title)}</title>` : '') +
      `<style>` +
      `html,body,.print-sheet{font-family:'Inter','Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}` +
      `${css}</style></head>` +
      `<body>${element.outerHTML}</body></html>`,
  );
  doc.close();

  // Να φορτώσει το font πριν το print snapshot (με ασφάλεια χρόνου, ώστε offline
  // να μην κολλήσει — τότε πέφτει στη Roboto/system).
  if (doc.fonts?.ready) {
    await Promise.race([doc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))]);
  }
  await waitForImages(doc);
  // Μικρή αναμονή ώστε να ολοκληρωθεί το layout πριν το print snapshot.
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Το προτεινόμενο όνομα αρχείου στο «Αποθήκευση ως PDF» προκύπτει από τον
  // τίτλο του **κύριου** εγγράφου (όχι του iframe), οπότε τον αλλάζουμε
  // προσωρινά και τον επαναφέρουμε μετά την εκτύπωση.
  const prevTitle = document.title;
  if (title) document.title = title;

  const cleanup = (): void => {
    document.title = prevTitle;
    setTimeout(() => iframe.remove(), 500);
  };
  // Σε print iframe το `afterprint` μπορεί να σταλεί είτε στο iframe είτε στο
  // κύριο παράθυρο — ακούμε και στα δύο.
  win.addEventListener('afterprint', cleanup, { once: true });
  window.addEventListener('afterprint', cleanup, { once: true });
  // Εφεδρεία, αν ο browser δεν στείλει `afterprint`.
  setTimeout(cleanup, 60_000);

  win.focus();
  win.print();
}
