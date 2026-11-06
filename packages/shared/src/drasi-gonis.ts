/**
 * Τα δύο χαρτιά μιας δράσης που πάνε στους γονείς: το **γράμμα** (Πρόγραμμα) και
 * η **εξάρτυση** — τι παίρνει μαζί του το παιδί (Λειτουργία). Και τα δύο είναι
 * κοινά έγγραφα (βλ. docs/synergasia.md) και ξεκινούν από ένα πρότυπο.
 */
import type { DrasiType } from './domain';

// ───────────────────────── Γράμμα προς τους γονείς ─────────────────────────

export interface ParentLetterInput {
  type: DrasiType;
  dateStart: Date | string;
  dateEnd: Date | string;
  location: string | null;
  costPerPerson: number | null;
  costReduced: number | null;
  /** Τα άλλα Τοπικά που έρχονται (φιλοξενούμενα). */
  guestTopika: string[];
  /** Το δικό μας Τοπικό, με τον τόπο του (π.χ. «Μέγαρα»). */
  ourTopiko: string | null;
  /** Ο Αρχηγός της δράσης — υπογράφει. */
  arxigos: { name: string; phone: string | null; email: string | null } | null;
}

const ATHENS = 'Europe/Athens';

function dayMonth(date: Date): string {
  return new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'long', timeZone: ATHENS }).format(date);
}

function sameMonth(a: Date, b: Date): boolean {
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: ATHENS }).format(d);
  return key(a) === key(b);
}

/** «από 17 έως 26 Ιουλίου» · «από 28 Ιουνίου έως 5 Ιουλίου» · «στις 17 Ιουλίου». */
export function greekDateSpan(startValue: Date | string, endValue: Date | string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const first = dayMonth(start);
  const last = dayMonth(end);
  if (first === last) return `στις ${first}`;
  if (sameMonth(start, end)) return `από ${first.split(' ')[0]} έως ${last}`;
  return `από ${first} έως ${last}`;
}

function euros(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}€`;
}

function listGreek(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} και ${items[items.length - 1]}`;
}

/**
 * Το πρότυπο του γράμματος (Markdown), γεμάτο με ό,τι ξέρει ήδη η δράση:
 * ημερομηνίες, τόπος, κόστος, Τοπικά, ο Αρχηγός που υπογράφει. Ό,τι δεν ξέρει
 * (προκαταβολή, προθεσμίες) μένει «…» για να το συμπληρώσει όποιος το γράφει.
 */
export function defaultParentLetter(input: ParentLetterInput): string {
  const camp = input.type === 'KATASKINOSI';
  const what = camp ? 'κατασκήνωση' : 'δράση';
  const span = greekDateSpan(input.dateStart, input.dateEnd);
  const where = input.location?.trim() ? ` — ${input.location.trim()}` : '';
  const topika = [input.ourTopiko, ...input.guestTopika].filter((t): t is string => !!t?.trim());

  const cost = input.costPerPerson !== null ? euros(input.costPerPerson) : '…€';
  const reduced = input.costReduced !== null ? ` και για τα αδέρφια που θα συμμετέχουν είναι **${euros(input.costReduced)}**` : '';

  const paragraphs = [
    'Αγαπητοί γονείς,',
    camp
      ? 'Η Οδηγική χρονιά φτάνει στο τέλος της και έρχεται η καλοκαιρινή κατασκήνωση, που όπως όλοι ξέρουμε είναι το αποκορύφωμα της Οδηγικής χρονιάς.'
      : 'Σας ενημερώνουμε για την επόμενη δράση της Ομάδας μας.',
    `Κατά τη διάρκεια της ${what}ς, οι Οδηγοί έχουν την ευκαιρία να ζήσουν την περιπέτεια της ομαδικής ζωής μέσα στην ομορφιά της φύσης, κάνουν φιλίες γερές που θα τους συντροφεύουν για χρόνια, μαθαίνουν να συνεργάζονται και να αναλαμβάνουν πρωτοβουλίες. Επιπλέον, αναπτύσσουν νέες ικανότητες, αποκτούν πολύπλευρες γνώσεις και ταυτόχρονα ανακαλύπτουν και καλλιεργούν τα ταλέντα τους. Όλα αυτά μέσα από το παιχνίδι, το τραγούδι, το κέφι και το γέλιο.`,
    `Η φετινή ${what} θα πραγματοποιηθεί **${span}${where}**.` +
      (topika.length > 1 ? ` Θα συμμετέχουν οι Ομάδες: ${listGreek(topika)}.` : ''),
    `**Το κόστος συμμετοχής είναι ${cost}**${reduced}. Η οικονομική συμμετοχή καλύπτει τα προγραμματικά και λειτουργικά έξοδα, τη σίτιση, τη διαμονή${camp ? ' στην κατασκήνωση' : ''} και τη μετακίνηση.`,
    `Ελπίζοντας πως κανένας Οδηγός δεν θα χάσει τη φετινή ${what}, περιμένουμε τη **θετική ή αρνητική σας απάντηση**. Σε περίπτωση θετικής απάντησης περιμένουμε τη δήλωση συνοδευόμενη από την **προκαταβολή (…€) έως τις …**. Το υπόλοιπο ποσό θα πρέπει να δοθεί έως **τις …**.`,
    `Σε περίπτωση ακύρωσης 1 μήνα πριν την ${what}, λόγω των οικονομικών υποχρεώσεων, το ποσό της προκαταβολής δεν θα επιστραφεί. Σε περίπτωση ακύρωσης 10 ημέρες πριν την ${what}, το συνολικό ποσό δεν επιστρέφεται.`,
    `Για οποιαδήποτε πληροφορία ή διευκρίνιση το Αρχηγείο της Ομάδας και η Αρχηγός της ${what}ς είναι στη διάθεσή σας να σας βοηθήσουν με χαρά!`,
    'Με οδηγικούς χαιρετισμούς,',
    `Η Αρχηγός της ${what}ς`,
    input.arxigos?.name || '…',
    `τηλέφωνο επικοινωνίας: ${input.arxigos?.phone || '…'}`,
    `email: ${input.arxigos?.email || '…'}`,
  ];
  return paragraphs.join('\n\n');
}

// ───────────────────────── Εξάρτυση ─────────────────────────

/**
 * Η δομή του εγγράφου `drasi:<id>:exartysi`. Όλα χάρτες με id ως κλειδί και
 * σειρά ένας αριθμός (`order`), όπως στο πρόγραμμα της συγκέντρωσης: δύο που
 * γράφουν μαζί σε άλλες γραμμές δεν σβήνουν ο ένας τον άλλον.
 *
 *  - `info`:     `{ title, footer }` — η επικεφαλίδα και η σημείωση στο τέλος
 *  - `sections`: id → `{ order, title, note }` — μια ενότητα («ΠΑΠΟΥΤΣΙΑ») και
 *                 μια σημείωση κάτω της («όλα να είναι μαρκαρισμένα»)
 *  - `items`:    id → `{ section, order, label }`
 */
export const EXARTYSI_KEYS = { info: 'info', sections: 'sections', items: 'items' } as const;

/** Όρια — ο server κόβει ό,τι βγαίνει έξω (δεν απορρίπτει). */
export const EXARTYSI_LIMITS = { title: 200, label: 300, note: 500, footer: 1000, sections: 60, items: 500 } as const;

export interface ExartysiItem {
  id: string;
  label: string;
}

export interface ExartysiSection {
  id: string;
  title: string;
  note: string;
  items: ExartysiItem[];
}

/** Η εξάρτυση όπως τη διαβάζουν σελίδα, εκτύπωση και `GET`. */
export interface DrasiExartysiView {
  title: string;
  footer: string;
  sections: ExartysiSection[];
}

/** Το πρότυπο: η εξάρτυση της κατασκήνωσης του ΣΕΟ. */
export const DEFAULT_EXARTYSI: { title: string; footer: string; sections: { title: string; note?: string; items: string[] }[] } = {
  title: 'ΕΞΑΡΤΥΣΗ ΓΙΑ ΤΗΝ ΚΑΤΑΣΚΗΝΩΣΗ',
  footer: 'Να έχετε μαζί σας μεσημεριανό για την 1η μέρα.',
  sections: [
    { title: 'ΟΔΗΓΙΚΗ ΣΤΟΛΗ', items: [] },
    {
      title: 'ΑΛΛΑ ΡΟΥΧΑ',
      items: [
        'Μακό μπλουζάκια (λευκά & μπλε)',
        'Βερμούδες (μπλε)',
        'Κάλτσες και εσώρουχα',
        'Πουλόβερ, Φούτερ ή Fleece',
        'Αδιάβροχο, αντιανεμικό',
        'Μακρύ παντελόνι',
        'Μαγιό',
      ],
    },
    {
      title: 'ΠΑΠΟΥΤΣΙΑ',
      items: ['Παπούτσια κλειστά', 'Ορειβατικά παπούτσια ή καλά αθλητικά για πεζοπορία', 'Σαγιονάρες'],
    },
    {
      title: 'ΕΙΔΗ ΑΤΟΜΙΚΗΣ ΥΓΙΕΙΝΗΣ',
      items: ['Οδοντόβουρτσα, οδοντόπαστα', 'Σαπούνι, σαμπουάν, σφουγγάρι', 'Χτένα, βούρτσα', 'Πετσέτες προσώπου και σώματος', 'Προσωπικά είδη'],
    },
    {
      title: 'ΓΙΑ ΤΟΝ ΗΛΙΟ & ΤΗ ΘΑΛΑΣΣΑ',
      note: 'Όλα να είναι συσκευασμένα σε σακίδιο',
      items: ['Καπέλο', 'Αντηλιακό', 'Γυαλιά ηλίου'],
    },
    {
      title: 'ΓΙΑ ΤΟΝ ΥΠΝΟ',
      items: ['Sleeping Bag', 'Υπόστρωμα', 'Σεντόνι και μαξιλάρι αν χρησιμοποιείς', 'Πυτζάμες'],
    },
    {
      title: 'ΓΙΑ ΤΟ ΦΑΓΗΤΟ',
      note: 'Όλα να είναι μαρκαρισμένα',
      items: ['Καραβάνα ή 2 πλαστικά πιάτα (1 βαθύ και 1 ρηχό)', 'Κουταλομαχαιροπήρουνο', 'Κύπελλο'],
    },
    {
      title: 'ΜΗ ΞΕΧΑΣΕΙΣ…',
      items: [
        'Οδηγική ταυτότητα',
        'Βιβλία του Κλάδου',
        '2 μικρά σακίδια (το ένα να είναι άδειο)',
        'Τα 5 πράγματα',
        'Φακό και εφεδρικές μπαταρίες',
        'Σακούλα για τα βρώμικα',
        'Εντομοαπωθητικό',
        'Παγούρι',
      ],
    },
    {
      title: 'ΠΡΟΑΙΡΕΤΙΚΑ',
      items: ['Φωτογραφική μηχανή', 'Μουσικό όργανο', 'Επιτραπέζιο παιχνίδι'],
    },
  ],
};
