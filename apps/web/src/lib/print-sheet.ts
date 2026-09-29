/**
 * Το σχήμα του εκτυπώσιμου φύλλου μιας συγκέντρωσης.
 *
 * Ζει εδώ και όχι μέσα στο `SyggentrwshPrint.vue`, γιατί το `<script setup>`
 * δεν επιτρέπει `export`: η σελίδα που φτιάχνει το φύλλο πρέπει να μπορεί να
 * δηλώσει τον ίδιο τύπο.
 *
 * Όλες οι τιμές είναι **ήδη μορφοποιημένες**. Το φύλλο δεν υπολογίζει τίποτα:
 * οι διάρκειες και οι ώρες έχουν βγει από τη σελίδα, που είναι και η μόνη που
 * ξέρει τι βλέπει ο χρήστης εκείνη τη στιγμή.
 */
export interface PrintBlock {
  key: string;
  title: string;
  description: string;
  duration: string;
  start: string | null;
  responsible: string | null;
  yliko: string | null;
}

export interface PrintPart {
  section: string;
  label: string;
  notes: string;
  duration: string;
  /** «13:00 – 13:20», ή κενό όταν η συγκέντρωση δεν έχει ώρα έναρξης. */
  range: string;
  blocks: PrintBlock[];
}

/** Ζευγάρι ετικέτας–τιμής στη γραμμή στοιχείων κάτω από τον τίτλο. */
export interface PrintFact {
  label: string;
  value: string;
}

export interface PrintSheet {
  /** Επικεφαλίδα: Τοπικό και κλάδος. */
  topiko: string;
  klados: string;
  /** Το χρώμα του κλάδου σε hex — η μόνη πινελιά χρώματος στο χαρτί. */
  accent: string;
  title: string;
  dateLabel: string;
  facts: PrintFact[];
  goal: string;
  stelexi: string[];
  parts: PrintPart[];
  /** Ένα είδος ανά γραμμή, απ' όπου κι αν προέκυψε. */
  yliko: { label: string; qty: number; packed: boolean }[];
  footer: string;
}
