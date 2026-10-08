import { ForbiddenException } from '@nestjs/common';
import {
  AccountRole,
  can,
  canAccessKlados,
  isSuperAdmin,
  type AccessProfile,
  type Capability,
  type KladosType,
} from '@trifylli/shared';
import type { RequestUser } from '../auth/types';

/** Το προφίλ πρόσβασης του χρήστη — **ο μόνος** τρόπος να το φτιάξει κανείς στο API. */
export function accessProfileOf(user: RequestUser): AccessProfile {
  return { role: user.role, adminKlados: user.adminKlados, grants: user.grants };
}
const profileOf = accessProfileOf;

/**
 * Στέλεχος: η εμβέλεια εξαρτάται από το δικαίωμα — μπορεί να είναι ταμίας στον
 * έναν κλάδο και απλό στέλεχος στον άλλον. Για τους υπόλοιπους ρόλους η
 * εμβέλεια είναι ίδια για όλα τα δικαιώματα.
 */
function needsPerKladosCheck(user: RequestUser): user is RequestUser & { activeCapability: Capability } {
  return user.role === AccountRole.STELEXOS && !!user.activeCapability;
}

/**
 * Έλεγχος **ικανότητας + εμβέλειας** για πόρους με δύο επίπεδα (κλάδος ή Τοπικό),
 * όπως ταμείο και συνδρομές. Πόρος κλάδου: χρειάζεται η ικανότητα στον κλάδο.
 * Πόρος Τοπικού (`klados = null`): μόνο ο υπερδιαχειριστής.
 */
export function assertScopeAccess(
  user: RequestUser,
  capability: Capability,
  klados: KladosType | null | undefined,
): void {
  if (!klados) {
    if (!isSuperAdmin(profileOf(user))) {
      throw new ForbiddenException('Αυτή η ενέργεια αφορά το Τοπικό — μόνο ο υπερδιαχειριστής.');
    }
    return;
  }
  if (!can(profileOf(user), capability, klados)) {
    throw new ForbiddenException(`Δεν έχετε δικαίωμα για τον κλάδο ${klados}.`);
  }
}

/**
 * Έλεγχος εμβέλειας για πόρους που ανήκουν σε κλάδο.
 *
 * Γίνεται στο service και όχι στο guard, γιατί ο κλάδος ενός πόρου (συγκέντρωση,
 * συμβούλιο, δέσμευση) προκύπτει μόνο μετά από ερώτημα στη βάση.
 */
export function assertKladosAccess(user: RequestUser, klados: KladosType | null | undefined): void {
  if (!klados) {
    // Πόρος του Τοπικού (χωρίς κλάδο): τον διαχειρίζεται μόνο ο υπερδιαχειριστής,
    // αλλά τον βλέπουν και οι διαχειριστές κλάδων — ο έλεγχος εγγραφής έγινε ήδη
    // στο guard μέσω της ικανότητας.
    return;
  }
  const allowed = needsPerKladosCheck(user)
    ? can(profileOf(user), user.activeCapability, klados)
    : canAccessKlados(profileOf(user), klados);
  if (!allowed) {
    throw new ForbiddenException(`Δεν έχετε πρόσβαση στα δεδομένα του κλάδου ${klados}.`);
  }
}

/** Οι κλάδοι που επιτρέπεται να δει ο χρήστης — `null` σημαίνει «όλοι». */
export function scopedKladoi(user: RequestUser): KladosType[] | null {
  if (isSuperAdmin(profileOf(user))) return null;
  if (needsPerKladosCheck(user)) return user.kladoi.filter((k) => can(profileOf(user), user.activeCapability, k));
  return user.kladoi;
}

/**
 * Το φίλτρο Prisma που περιορίζει ένα ερώτημα στους κλάδους του χρήστη.
 * Για τον υπερδιαχειριστή επιστρέφει `undefined` (κανένας περιορισμός).
 */
export function kladosScopeFilter(user: RequestUser): { type: { in: KladosType[] } } | undefined {
  const kladoi = scopedKladoi(user);
  return kladoi ? { type: { in: kladoi } } : undefined;
}
