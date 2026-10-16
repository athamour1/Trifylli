import { nextTick } from 'vue';

/**
 * Ζωντανή αλλαγή χωρίς να χάνεται η εστίαση.
 *
 * Όταν κάποιος άλλος μετακινεί το κομμάτι που γράφεις, το Vue βγάζει το στοιχείο
 * του από το DOM και το ξαναβάζει στη νέα θέση· ο browser τότε ρίχνει την
 * εστίαση στο `body`, και ό,τι πληκτρολογείς μετά πάει χαμένο. `keepFocus`
 * εφαρμόζει την αλλαγή και, μόλις ενημερωθεί το DOM, δίνει την εστίαση (και τον
 * κέρσορα ενός πεδίου) πίσω εκεί που ήταν. Ο επεξεργαστής κειμένου κρατά μόνος
 * του τη θέση του κέρσορα· χρειάζεται μόνο να ξαναπάρει την εστίαση.
 */
export function keepFocus(apply: () => void): void {
  const active = document.activeElement;
  const element = active instanceof HTMLElement && active !== document.body ? active : null;
  const caret = element ? caretOf(element) : null;
  apply();
  if (!element) return;
  void nextTick(() => {
    if (!element.isConnected || document.activeElement === element) return;
    // Στο μεταξύ ο χρήστης πήγε αλλού — δεν του παίρνουμε την εστίαση.
    if (document.activeElement && document.activeElement !== document.body) return;
    element.focus();
    if (caret) restoreCaret(element, caret);
  });
}

type Caret = { start: number; end: number };

function caretOf(element: HTMLElement): Caret | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return null;
  try {
    // Τα πεδία αριθμού δεν έχουν κέρσορα (επιστρέφουν `null`).
    return element.selectionStart === null || element.selectionEnd === null
      ? null
      : { start: element.selectionStart, end: element.selectionEnd };
  } catch {
    return null;
  }
}

function restoreCaret(element: HTMLElement, caret: Caret): void {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
  try {
    element.setSelectionRange(caret.start, caret.end);
  } catch {
    // Πεδίο χωρίς κέρσορα — αρκεί η εστίαση.
  }
}
