/**
 * Μεταδεδομένα κλάδων.
 *
 * Τα ηλικιακά όρια και οι ονομασίες υποομάδων είναι **προεπιλογές**, όχι κανόνας:
 * κάθε Τοπικό μπορεί να τα προσαρμόσει (πεδία `Klados.minAge/maxAge` στη βάση).
 * Χρησιμοποιούνται μόνο για seed δεδομένων και για προειδοποιήσεις στο UI όταν
 * μια εγγραφή πέφτει εκτός ορίων.
 */
import { KladosType } from './domain';

export interface KladosMeta {
  /** Προεπιλεγμένη ελάχιστη ηλικία εγγραφής. */
  minAge: number;
  /** Προεπιλεγμένη μέγιστη ηλικία. */
  maxAge: number;
  /** Πώς λέγεται η υποομάδα μελών (π.χ. εξάδα, ενωμοτία). */
  subUnitLabel: string;
  /** Σειρά εμφάνισης σε λίστες, μενού και dashboards. */
  order: number;
  /**
   * Το επίσημο χρώμα του κλάδου, σε hex.
   *
   * Hex και όχι Quasar token: τα χρώματα των κλάδων είναι δεδομένα του Σ.Ε.Ο.
   * και δεν αντιστοιχούν σε καμία απόχρωση της παλέτας — μια προσέγγιση «το πιο
   * κοντινό token» θα τύπωνε και θα εμφάνιζε λάθος χρώμα.
   */
  color: string;
  /** Εικονίδιο για το μενού. */
  icon: string;
}

export const KLADOS_META: Record<KladosType, KladosMeta> = {
  ASTERIA: { minAge: 5, maxAge: 7, subUnitLabel: 'Συννεφάκι', order: 1, color: '#00a2b1', icon: 'star' },
  POULIA: { minAge: 7, maxAge: 11, subUnitLabel: 'Εξάδα', order: 2, color: '#ffcb06', icon: 'flutter_dash' },
  ODIGOI: { minAge: 11, maxAge: 15, subUnitLabel: 'Ενωμοτία', order: 3, color: '#0094da', icon: 'explore' },
  MEGALOI_ODIGOI: { minAge: 15, maxAge: 18, subUnitLabel: 'Ομάδα', order: 4, color: '#ee1c25', icon: 'hiking' },
};

export const KLADOI_IN_ORDER: readonly KladosType[] = (Object.keys(KLADOS_META) as KladosType[]).sort(
  (a, b) => KLADOS_META[a].order - KLADOS_META[b].order,
);

/** Ταξινόμηση οποιασδήποτε λίστας κλάδων στη σειρά που τους λέει κανείς. */
export function sortKladoi(kladoi: readonly KladosType[]): KladosType[] {
  return [...kladoi].sort((a, b) => KLADOS_META[a].order - KLADOS_META[b].order);
}
