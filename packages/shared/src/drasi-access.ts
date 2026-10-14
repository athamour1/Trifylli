/**
 * Τι βλέπει και τι αλλάζει κάθε άτομο **μέσα σε μια δράση**, από τον ρόλο του
 * στο αρχηγείο της. Κοινός κώδικας για API (guard ανά endpoint) και UI (ποιες
 * ενότητες εμφανίζονται, ποια κουμπιά).
 *
 * Τρεις κατηγορίες ατόμων:
 *  - **Πλήρης πρόσβαση**: υπερδιαχειριστής, διαχειριστής/Αρχηγός του κλάδου που
 *    διοργανώνει — εφεδρεία, ώστε η δράση να μην κολλάει ποτέ.
 *  - **Στελέχη της δράσης**: ρόλος/υπηρεσία στο αρχηγείο της ή στέλεχος στους
 *    συμμετέχοντες. Βλέπουν τα πάντα εκτός από ταμείο, υλικό, φαρμακείο· ο ρόλος
 *    τους προσθέτει ό,τι αναλογεί.
 *  - **Κανείς άλλος**: ούτε στέλεχος του κλάδου που δεν πάει στη δράση.
 */
import type { DrasiRoleKind } from './domain';

/** Οι ενότητες/λειτουργίες μιας δράσης, όπως ελέγχονται. */
export type DrasiPerm =
  | 'episkopisi'
  | 'programma'
  | 'mythos'
  | 'participants'
  | 'omades'
  /** Υπηρεσίες: υπεύθυνοι, χρονοδιάγραμμα, ρυθμίσεις. */
  | 'ypiresies'
  | 'entypa'
  | 'farmakeio'
  | 'yliko'
  | 'tamio'
  | 'symvoulia'
  | 'axiologisi'
  | 'ektyposi'
  | 'arxigeio'
  | 'rythmiseis'
  /** Καταχώρηση πληρωμών συμμετεχόντων & κόστους ανά άτομο. */
  | 'payments'
  /** «Παράδοση στο ταμείο» — μόνο ο ταμίας (και η εφεδρεία). */
  | 'handover'
  /** Κλείσιμο / άνοιγμα ξανά. */
  | 'close';

export const DRASI_PERMS: readonly DrasiPerm[] = [
  'episkopisi', 'programma', 'mythos', 'participants', 'omades', 'ypiresies', 'entypa', 'farmakeio', 'yliko', 'tamio',
  'symvoulia', 'axiologisi', 'ektyposi', 'arxigeio', 'rythmiseis', 'payments', 'handover', 'close',
];

export interface DrasiAccess {
  /** Πλήρης πρόσβαση (εφεδρεία). */
  full: boolean;
  view: DrasiPerm[];
  edit: DrasiPerm[];
}

/** Ό,τι βλέπει κάθε στέλεχος της δράσης, χωρίς ρόλο. */
const STAFF_VIEW: readonly DrasiPerm[] = [
  'episkopisi', 'programma', 'mythos', 'participants', 'omades', 'ypiresies', 'entypa', 'symvoulia', 'axiologisi', 'ektyposi', 'arxigeio',
];

/** Τι προσθέτει κάθε ρόλος (πέρα από τα του στελέχους). */
const ROLE_ACCESS: Partial<Record<DrasiRoleKind, { view: readonly DrasiPerm[]; edit: readonly DrasiPerm[] }>> = {
  // Ο αρχηγός της δράσης: τα πάντα — εκτός από τα χρήματα, που τα κινεί ο ταμίας.
  ARXIGOS: {
    view: DRASI_PERMS.filter((p) => p !== 'handover' && p !== 'payments'),
    edit: DRASI_PERMS.filter((p) => p !== 'tamio' && p !== 'payments' && p !== 'handover'),
  },
  PROGRAMMA: { view: [], edit: ['mythos', 'programma'] },
  // Η λειτουργία τρέχει και τις υπηρεσίες (ποια ομάδα έχει τι, πότε).
  LEITOURGIA: { view: ['yliko', 'tamio'], edit: ['omades', 'ypiresies', 'entypa', 'yliko', 'axiologisi'] },
  // Μόνο ο ταμίας καταχωρεί έσοδα/έξοδα, πληρωμές και παραδόσεις.
  TAMIAS: { view: ['tamio'], edit: ['tamio', 'payments', 'handover'] },
  FARMAKEIO: { view: ['farmakeio'], edit: ['farmakeio', 'entypa'] },
  // Τροφοδοσία / μαγείρισσα: δικές τους σελίδες αργότερα — προς το παρόν όπως κάθε στέλεχος.
};

export function drasiAccess(input: { full: boolean; staff: boolean; roles: readonly DrasiRoleKind[] }): DrasiAccess {
  if (input.full) return { full: true, view: [...DRASI_PERMS], edit: [...DRASI_PERMS] };
  if (!input.staff && input.roles.length === 0) return { full: false, view: [], edit: [] };

  const view = new Set<DrasiPerm>(STAFF_VIEW);
  const edit = new Set<DrasiPerm>();
  for (const role of input.roles) {
    const extra = ROLE_ACCESS[role];
    if (!extra) continue;
    for (const p of extra.view) view.add(p);
    for (const p of extra.edit) {
      edit.add(p);
      view.add(p);
    }
  }
  return { full: false, view: DRASI_PERMS.filter((p) => view.has(p)), edit: DRASI_PERMS.filter((p) => edit.has(p)) };
}

export function drasiCan(access: DrasiAccess | null | undefined, perm: DrasiPerm, mode: 'view' | 'edit' = 'view'): boolean {
  if (!access) return false;
  return (mode === 'edit' ? access.edit : access.view).includes(perm);
}

/**
 * Πόσο αλλάζει κάποιος ένα κομμάτι της δράσης: όλο (ο ρόλος του δίνει `edit`),
 * μόνο ό,τι είναι δικό του (υπεύθυνος του στοιχείου του ωρολογίου, στέλεχος που
 * παίζει τον ρόλο του μύθου) ή τίποτα. Το δικό του θέλει πρόσβαση στη δράση:
 * ένας εξωτερικός σε κλειστή δράση δεν αλλάζει ούτε αυτό.
 */
export type DrasiEditScope = 'all' | 'own' | 'none';

export function drasiEditScope(access: DrasiAccess | null | undefined, perm: DrasiPerm, own: boolean): DrasiEditScope {
  if (drasiCan(access, perm, 'edit')) return 'all';
  return own && drasiCan(access, perm) ? 'own' : 'none';
}

/**
 * Ό,τι γράφει ο υπεύθυνος (διεξαγωγής ή υλοποίησης) στο δικό του στοιχείο.
 * Τίτλος, λεπτά, είδος, ημέρα και υπεύθυνοι μένουν στο Πρόγραμμα: είναι η γραμμή
 * του ωρολογίου και μετακινούν όλη την ημέρα.
 */
export const SCHEDULE_ITEM_OWN_FIELDS = ['location', 'description', 'ylikoNotes', 'yliko'] as const;

/** Ό,τι αλλάζει το στέλεχος στον ρόλο που παίζει· ποιος τον παίζει, σειρά, διαγραφή μένουν στο Πρόγραμμα. */
export const CHARACTER_OWN_FIELDS = ['name', 'lore'] as const;

/** Τα πεδία μιας αλλαγής έξω από όσα επιτρέπονται. Ό,τι δεν στάλθηκε (`undefined`) δεν μετράει. */
export function fieldsOutside(change: object, allowed: readonly string[]): string[] {
  return Object.entries(change)
    .filter(([key, value]) => value !== undefined && !allowed.includes(key))
    .map(([key]) => key);
}
