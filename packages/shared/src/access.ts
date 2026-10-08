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
import { AccountRole, KladosDuty, KladosType } from './domain';

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

// ───────────────────────── Στελέχη (ρόλος `STELEXOS`) ─────────────────────────

/**
 * Ό,τι έχει κάθε στέλεχος στον κλάδο του, χωρίς υπευθυνότητα: βλέπει τη ζωή του
 * κλάδου (ημερολόγιο, συγκεντρώσεις, δράσεις, μέλη, αρχηγείο, υλικό,
 * φαρμακεία) και κάνει τη δουλειά της συγκέντρωσης (πρόγραμμα, παρουσίες).
 */
export const STELEXOS_BASE_CAPABILITIES: readonly Capability[] = [
  'calendar:read',
  'meloi:read',
  'yliko:read',
  'farmakeio:read',
  'parousiologio:write',
  'syggentrwsh:write',
];

/**
 * Τι ξεκλειδώνει κάθε υπευθυνότητα του αρχηγείου. Όσες δεν αντιστοιχούν ακόμα
 * σε λειτουργία της πλατφόρμας (φωτογραφία, ενημέρωση, social) δεν δίνουν τίποτα.
 */
export const DUTY_CAPABILITIES: Record<KladosDuty, readonly Capability[]> = {
  TAMIAS: ['syndromes:read', 'syndromes:manage', 'treasury:read', 'treasury:manage'],
  GRAMMATEAS: ['symvoulio:klados:write'],
  FARMAKEIO: ['farmakeio:write'],
  PROODOS: ['proodos:write'],
  YLIKO: ['yliko:checkout', 'yliko:manage'],
  FOTOGRAFIA: [],
  ENIMEROSI: [],
  SOCIAL_MEDIA: [],
};

/** Η θέση ενός στελέχους σε έναν κλάδο — από memberships, e-SEO και αρχηγείο. */
export interface StelexosPlacement {
  klados: KladosType;
  /** Αρχηγός στο e-SEO ⇒ διαχειριστής του κλάδου. */
  isArchigos: boolean;
  duties: readonly KladosDuty[];
}

/** Τα δικαιώματα ανά κλάδο ενός στελέχους. */
export function stelexosGrants(placements: readonly StelexosPlacement[]): KladosGrants {
  const grants: KladosGrants = {};
  for (const p of placements) {
    const caps = new Set<Capability>(p.isArchigos ? KLADOS_ADMIN_CAPABILITIES : STELEXOS_BASE_CAPABILITIES);
    for (const duty of p.duties) for (const c of DUTY_CAPABILITIES[duty]) caps.add(c);
    grants[p.klados] = [...caps];
  }
  return grants;
}

export type KladosGrants = Partial<Record<KladosType, readonly Capability[]>>;

export interface AccessProfile {
  role: AccountRole;
  /** Ο κλάδος που διαχειρίζεται· `null` για τον υπερδιαχειριστή. */
  adminKlados: KladosType | null;
  /** Μόνο για `STELEXOS`: τα δικαιώματα ανά κλάδο (βλ. `stelexosGrants`). */
  grants?: KladosGrants | null;
}

export function isSuperAdmin(profile: AccessProfile): boolean {
  return profile.role === AccountRole.SUPER_ADMIN;
}

/** Οι κλάδοι που βλέπει ο χρήστης — όλοι για τον υπερδιαχειριστή, ένας για τον admin κλάδου. */
export function visibleKladoi(profile: AccessProfile, all: readonly KladosType[]): KladosType[] {
  if (isSuperAdmin(profile)) return [...all];
  if (profile.role === AccountRole.STELEXOS) return all.filter((k) => profile.grants?.[k]);
  return profile.adminKlados ? [profile.adminKlados] : [];
}

/** Έχει ο χρήστης πρόσβαση στα δεδομένα αυτού του κλάδου; */
export function canAccessKlados(profile: AccessProfile, klados: KladosType): boolean {
  if (isSuperAdmin(profile)) return true;
  if (profile.role === AccountRole.STELEXOS) return !!profile.grants?.[klados];
  return profile.adminKlados === klados;
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
  if (profile.role === AccountRole.STELEXOS) {
    // Με κλάδο: το δικαίωμα σε **αυτόν** τον κλάδο. Χωρίς: σε κάποιον από τους
    // κλάδους του — η εμβέλεια ελέγχεται μετά, στο service (βλ. klados-scope).
    const grants = profile.grants ?? {};
    if (klados) return grants[klados]?.includes(capability) ?? false;
    return Object.values(grants).some((caps) => caps?.includes(capability));
  }
  if (!KLADOS_ADMIN_CAPABILITIES.includes(capability)) return false;
  if (klados && !canAccessKlados(profile, klados)) return false;
  return true;
}

export { KLADOS_ADMIN_CAPABILITIES };
