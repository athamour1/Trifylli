/**
 * Κανόνες πρόσβασης, κοινοί σε API και UI.
 *
 * Το API τους επιβάλλει (guards), το UI τους χρησιμοποιεί για να κρύβει κουμπιά
 * και διαδρομές. Κοινός κώδικας ⇒ δεν ξεφεύγει το ένα από το άλλο.
 *
 * Το μοντέλο είναι σκόπιμα μικρό: ένας υπερδιαχειριστής με εμβέλεια όλου του
 * Τοπικού, και ένας διαχειριστής ανά κλάδο που έχει πλήρη δικαιώματα **μέσα
 * στον δικό του κλάδο** και καμία ορατότητα έξω από αυτόν.
 */
import { AccountRole, KladosType } from './domain';

/** Ενέργειες που ελέγχονται ρητά. */
export type Capability =
  | 'calendar:read'
  | 'parousiologio:write'
  | 'proodos:write'
  | 'yliko:read'
  | 'yliko:checkout'
  | 'yliko:manage'
  | 'drasi:write'
  | 'syggentrwsh:write'
  | 'symvoulio:klados:write'
  | 'symvoulio:topiko:write'
  | 'meloi:read'
  | 'meloi:manage'
  | 'syndromes:read'
  | 'syndromes:manage'
  | 'treasury:read'
  | 'treasury:manage'
  | 'farmakeio:read'
  | 'farmakeio:write'
  | 'accounts:manage'
  | 'integrations:manage';

/**
 * Ό,τι μπορεί ένας διαχειριστής κλάδου — πάντα περιορισμένο στον κλάδο του.
 *
 * Εκτός λίστας μένουν όσα αφορούν όλο το Τοπικό: κεντρική αποθήκη (κεντρικά
 * είδη), λογαριασμοί, ενσωματώσεις και συμβούλια Τοπικού. Τα οικονομικά είναι
 * **διπλά**: κάθε κλάδος έχει δικό του ταμείο και δικές του συνδρομές, ενώ ο
 * υπερδιαχειριστής βλέπει και το ταμείο/τις συνδρομές του Τοπικού.
 */
const KLADOS_ADMIN_CAPABILITIES: readonly Capability[] = [
  'calendar:read',
  'parousiologio:write',
  'proodos:write',
  'yliko:read',
  'yliko:checkout',
  // Κάθε κλάδος διαχειρίζεται το δικό του υλικό και τα σημεία αποθήκευσής του
  // (η κεντρική αποθήκη μένει στον υπερδιαχειριστή — επιβάλλεται στο service).
  'yliko:manage',
  'drasi:write',
  'syggentrwsh:write',
  'symvoulio:klados:write',
  'meloi:read',
  'meloi:manage',
  // Συνδρομές & ταμείο του δικού του κλάδου (η εμβέλεια επιβάλλεται στο service).
  'syndromes:read',
  'syndromes:manage',
  'treasury:read',
  'treasury:manage',
  // Κάθε κλάδος διαχειρίζεται τα δικά του φαρμακεία (σύνδεση, δανεισμός,
  // συγχρονισμός προσβάσεων). Τα φαρμακεία Τοπικού μένουν στον υπερδιαχειριστή —
  // επιβάλλεται στο service μέσω `assertScopeAccess` (όπως ταμείο/συνδρομές).
  'farmakeio:read',
  'farmakeio:write',
];

export interface AccessProfile {
  role: AccountRole;
  /** Ο κλάδος που διαχειρίζεται· `null` για τον υπερδιαχειριστή. */
  adminKlados: KladosType | null;
}

export function isSuperAdmin(profile: AccessProfile): boolean {
  return profile.role === AccountRole.SUPER_ADMIN;
}

/** Οι κλάδοι που βλέπει ο χρήστης — όλοι για τον υπερδιαχειριστή, ένας για τον admin κλάδου. */
export function visibleKladoi(profile: AccessProfile, all: readonly KladosType[]): KladosType[] {
  if (isSuperAdmin(profile)) return [...all];
  return profile.adminKlados ? [profile.adminKlados] : [];
}

/** Έχει ο χρήστης πρόσβαση στα δεδομένα αυτού του κλάδου; */
export function canAccessKlados(profile: AccessProfile, klados: KladosType): boolean {
  return isSuperAdmin(profile) || profile.adminKlados === klados;
}

/**
 * Ο βασικός έλεγχος.
 *
 * Όταν δίνεται `klados`, απαιτείται **και** η ικανότητα **και** εμβέλεια στον
 * συγκεκριμένο κλάδο. Χωρίς `klados` το αίτημα θεωρείται επιπέδου Τοπικού, οπότε
 * περνά μόνο αν η ικανότητα ανήκει στον διαχειριστή κλάδου (π.χ. ανάγνωση
 * ημερολογίου) ή αν ο χρήστης είναι υπερδιαχειριστής.
 */
export function can(profile: AccessProfile, capability: Capability, klados?: KladosType): boolean {
  if (isSuperAdmin(profile)) return true;
  if (!KLADOS_ADMIN_CAPABILITIES.includes(capability)) return false;
  if (klados && !canAccessKlados(profile, klados)) return false;
  return true;
}

export { KLADOS_ADMIN_CAPABILITIES };
