import { ref } from 'vue';
import { KLADOS_META, type KladosType } from '@trifylli/shared';
import { inkOnWhite, inkOnWhiteLarge, readableOnLarge } from './color';

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
    // Λευκό πάνω στο χρώμα του κλάδου — η σύμβαση του Σ.Ε.Ο. για γεμάτες
    // επιφάνειες (κουμπιά, chips). Το `readableOn` (μέγιστη αντίθεση) έβγαζε
    // **μαύρο** στο μπλε των Οδηγών, στο τιρκουάζ των Αστεριών και στο κόκκινο
    // των Μεγάλων Οδηγών — τεχνικά πιο ευανάγνωστο, αλλά ξένο προς την ταυτότητα
    // («Είσπραξη» με μαύρα γράμματα πάνω σε μπλε). Με το `readableOnLarge`
    // γυρνάμε σε μαύρο μόνο όταν το λευκό πέφτει κάτω από 3:1 — δηλαδή μόνο στο
    // κίτρινο των Πουλιών, που αλλιώς θα ήταν αδιάβαστο.
    '--klados-on': readableOnLarge(color),
    // Η μπάρα είναι μεγάλη επιφάνεια με μεγάλα γράμματα· ίδιος κανόνας.
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
/**
 * Ο κλάδος που βάφει αυτή τη στιγμή τη σελίδα — reactive, ώστε το layout να
 * ξέρει «πού είμαστε» και στις σελίδες λεπτομέρειας που ζουν εκτός `/k/:klados`
 * (να ανοίγει τη σωστή ενότητα του συρταριού και να φωτίζει τον σωστό σύνδεσμο).
 */
export const themedKlados = ref<KladosType | null>(null);

export function applyKladosTheme(klados: KladosType | null | undefined): void {
  themedKlados.value = klados ?? null;
  if (typeof document === 'undefined') return;

  const vars = kladosVars(klados);
  for (const name of ['--klados-color', '--klados-on', '--klados-on-bar', '--klados-ink', '--klados-ink-lg']) {
    const value = vars[name];
    if (value) document.body.style.setProperty(name, value);
    else document.body.style.removeProperty(name);
  }
}
