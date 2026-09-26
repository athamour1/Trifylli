import { KLADOS_META, type KladosType } from '@trifylli/shared';
import { inkOnWhite, inkOnWhiteLarge, readableOn, readableOnLarge } from './color';

/**
 * Το χρώμα του κλάδου ως CSS μεταβλητές.
 *
 * Μέσω μεταβλητών και όχι inline styles ανά κουμπί, γιατί οι μισές σελίδες
 * εξυπηρετούν **και** τον κλάδο και το Τοπικό (ίδιο component, άλλη διαδρομή).
 * Έτσι το markup γράφεται μία φορά — `color="klados"` — και το χρώμα το
 * αποφασίζει το περιβάλλον: ο κλάδος όταν υπάρχει, αλλιώς το χρώμα της
 * εφαρμογής από το `app.scss`.
 */
export function kladosVars(klados: KladosType | null | undefined): Record<string, string> {
  if (!klados) return {};
  const color = KLADOS_META[klados].color;
  return {
    '--klados-color': color,
    '--klados-on': readableOn(color),
    // Η μπάρα είναι μεγάλη επιφάνεια με μεγάλα γράμματα· εκεί η σύμβαση κερδίζει
    // τη μέγιστη αντίθεση, όσο το λευκό παραμένει αναγνώσιμο.
    '--klados-on-bar': readableOnLarge(color),
    // Ξεχωριστή απόχρωση για κείμενο: το φόντο και η γραφή έχουν αντίστροφες
    // απαιτήσεις, και ένα χρώμα δεν τις ικανοποιεί και τις δύο.
    '--klados-ink': inkOnWhite(color),
    // Πιο ζωηρή απόχρωση για έντονο/μεγάλο κείμενο (μενού), όπως στη μπάρα.
    '--klados-ink-lg': inkOnWhiteLarge(color),
  };
}

/**
 * Βάφει ολόκληρη τη σελίδα με το χρώμα ενός κλάδου.
 *
 * Οι μεταβλητές μπαίνουν στο `body` και όχι στον περιέκτη της σελίδας, επειδή
 * διάλογοι, μενού και tooltips της Quasar μετακομίζουν με portal στο `body`:
 * ένα κουμπί «Δέσμευση» μέσα σε διάλογο θα έμενε εκτός κληρονομιάς και θα
 * γύριζε στο προεπιλεγμένο χρώμα.
 *
 * Το `null` καθαρίζει — τότε ισχύει η εφεδρεία του `app.scss`.
 */
export function applyKladosTheme(klados: KladosType | null | undefined): void {
  if (typeof document === 'undefined') return;

  const vars = kladosVars(klados);
  for (const name of ['--klados-color', '--klados-on', '--klados-on-bar', '--klados-ink', '--klados-ink-lg']) {
    const value = vars[name];
    if (value) document.body.style.setProperty(name, value);
    else document.body.style.removeProperty(name);
  }
}
