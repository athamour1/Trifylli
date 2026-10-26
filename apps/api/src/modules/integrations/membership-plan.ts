import { DataSource, MemberKind } from '@prisma/client';

/** Ό,τι χρειάζεται ο συγχρονισμός από μια τοποθέτηση (`Membership`). */
export interface MembershipLite {
  id: string;
  kladosId: string;
  kind: MemberKind;
  source: DataSource;
  leftAt: Date | null;
}

/** Τι λέει το e-SEO για το άτομο: είδος και κλάδος από το `type`. */
export interface ChildTarget {
  /** `false` για τύπο που δεν ξέρουμε — τότε δεν πειράζουμε τίποτα. */
  known: boolean;
  kind: MemberKind;
  /** Ο κλάδος του τύπου στο Τοπικό, ή `null` (ενήλικας / ο κλάδος δεν υπάρχει). */
  kladosId: string | null;
}

/**
 * Τοποθέτηση παιδιού από τον τύπο του e-SEO. Το e-SEO αποφασίζει τον κλάδο, η
 * εφαρμογή την υποομάδα: όταν αλλάζει κλάδος κλείνει η παλιά τοποθέτηση
 * (`leftAt` — η πρόοδος στον παλιό κλάδο μένει ως ιστορικό), αλλιώς η τωρινή
 * μένει ανέγγιχτη μαζί με την εξάδα/ενωμοτία της.
 */
export function planChildPlacement(
  memberships: MembershipLite[],
  target: ChildTarget,
): { close: string[]; ensure: string | null } {
  if (!target.known) return { close: [], ensure: null };

  const activeAsMember = memberships.filter((m) => m.leftAt === null && m.kind === MemberKind.MELOS);

  if (target.kind === MemberKind.MELOS) {
    // Παιδί σε κλάδο που δεν έχει το Τοπικό: καλύτερα η παλιά τοποθέτηση παρά καμία.
    if (!target.kladosId) return { close: [], ensure: null };
    return {
      close: activeAsMember.filter((m) => m.kladosId !== target.kladosId).map((m) => m.id),
      ensure: target.kladosId,
    };
  }

  // Ενήλικας: δεν είναι πια μέλος σε κλάδο· ως στέλεχος τον τοποθετούν τα πτυχία.
  return { close: activeAsMember.map((m) => m.id), ensure: null };
}

/**
 * Τοποθέτηση στελέχους από τα ενεργά πτυχία-ρόλους (Αρχηγός/Υπαρχηγός/Βοηθός).
 * Κλείνει μόνο τοποθετήσεις στελέχους που άνοιξε το e-SEO — όσες έβαλε κάποιος
 * με το χέρι μένουν, όπως και η τοποθέτηση ως μέλος.
 */
export function planLeaderPlacement(
  memberships: MembershipLite[],
  desiredKladosIds: Set<string>,
): { close: string[]; ensure: string[] } {
  const close = memberships
    .filter(
      (m) =>
        m.leftAt === null &&
        m.kind === MemberKind.STELEXOS &&
        m.source === DataSource.ESEO &&
        !desiredKladosIds.has(m.kladosId),
    )
    .map((m) => m.id);
  return { close, ensure: [...desiredKladosIds] };
}
