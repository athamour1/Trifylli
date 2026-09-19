import { KladosType } from './domain';

/**
 * Οι θέσεις των στελεχών δεν είναι ξεχωριστό πεδίο στο e-SEO — κωδικοποιούνται
 * στον τίτλο του **πτυχίου/άδειας** (`License.title`), π.χ. «Αρχηγός Ομάδας
 * Οδηγών», «Υπαρχηγός Σμήνους», «Στέλεχος SOS». Αυτός ο parser τα μεταφράζει σε
 * δομημένη πληροφορία, κοινή σε API (τοποθέτηση σε κλάδο, φίλτρα) και UI.
 */

export const LeaderRank = {
  ARCHIGOS: 'ARCHIGOS',
  YPARCHIGOS: 'YPARCHIGOS',
  VOITHOS: 'VOITHOS',
} as const;
export type LeaderRank = (typeof LeaderRank)[keyof typeof LeaderRank];

export const LEADER_RANK_LABEL: Record<string, string> = {
  ARCHIGOS: 'Αρχηγός',
  YPARCHIGOS: 'Υπαρχηγός',
  VOITHOS: 'Βοηθός',
};

const RANK_WEIGHT: Record<LeaderRank, number> = { ARCHIGOS: 3, YPARCHIGOS: 2, VOITHOS: 1 };

export interface LicenseLike {
  title: string;
  status: string;
}

export interface KladosRole {
  kladosType: KladosType;
  rank: LeaderRank;
  title: string;
}

export interface LeaderProfile {
  /** Ρόλοι μέσα σε κλάδο (ένα στέλεχος μπορεί να υπηρετεί σε >1). */
  kladosRoles: KladosRole[];
  /** Θέσεις επιπέδου Τοπικού (Έφορος, Ταμίας, Συμβούλιο, ΥΕΑ…). */
  topikoTitles: string[];
  /** Έχει ενεργό πτυχίο «Στέλεχος SOS». */
  isSOS: boolean;
}

/** Η μονάδα στον τίτλο → κλάδος. Σμήνος=Πουλιά, Γαλαξίας=Αστέρια κ.λπ. */
function kladosFromTitle(title: string): KladosType | null {
  const s = title.toLowerCase();
  if (/σμήν/.test(s)) return KladosType.POULIA;
  if (/γαλαξ/.test(s)) return KladosType.ASTERIA;
  // «Μεγάλων Οδηγών/Ναυτοδηγών» πριν από το σκέτο «Οδηγών».
  if (/μεγάλων\s+(οδηγ|ναυτ)/.test(s)) return KladosType.MEGALOI_ODIGOI;
  if (/ομάδας\s+(οδηγ|ναυτ)/.test(s)) return KladosType.ODIGOI;
  return null;
}

function rankFromTitle(title: string): LeaderRank | null {
  const s = title.toLowerCase();
  if (s.startsWith('αρχηγ')) return LeaderRank.ARCHIGOS;
  if (s.startsWith('υπαρχηγ')) return LeaderRank.YPARCHIGOS;
  if (s.startsWith('βοηθ')) return LeaderRank.VOITHOS;
  return null;
}

function isSosTitle(title: string): boolean {
  return /\bsos\b/i.test(title) || /ΣΟΣ/.test(title);
}

/**
 * Παράγει το προφίλ στελέχους από τα πτυχία του. Εξ ορισμού μόνο τα **ενεργά**
 * (ACTIVE) μετρούν — ένα ληγμένο «Αρχηγός» δεν είναι τρέχουσα θέση.
 */
export function deriveLeaderProfile(
  licenses: readonly LicenseLike[],
  opts: { activeOnly?: boolean } = { activeOnly: true },
): LeaderProfile {
  const active = licenses.filter((l) => (opts.activeOnly === false ? true : l.status === 'ACTIVE'));

  const byKlados = new Map<KladosType, KladosRole>();
  const topikoTitles: string[] = [];
  let isSOS = false;

  for (const l of active) {
    if (isSosTitle(l.title)) {
      isSOS = true;
      continue;
    }
    const kladosType = kladosFromTitle(l.title);
    const rank = rankFromTitle(l.title);
    if (kladosType && rank) {
      const existing = byKlados.get(kladosType);
      // Κρατάμε τον ανώτερο βαθμό ανά κλάδο (Αρχηγός > Υπαρχηγός > Βοηθός).
      if (!existing || RANK_WEIGHT[rank] > RANK_WEIGHT[existing.rank]) {
        byKlados.set(kladosType, { kladosType, rank, title: l.title });
      }
    } else {
      topikoTitles.push(l.title);
    }
  }

  return { kladosRoles: [...byKlados.values()], topikoTitles, isSOS };
}

/** Ο κύριος ρόλος σε κλάδο (ο ανώτερος βαθμός), για σύντομη εμφάνιση. */
export function primaryKladosRole(profile: LeaderProfile): KladosRole | null {
  return (
    [...profile.kladosRoles].sort((a, b) => RANK_WEIGHT[b.rank] - RANK_WEIGHT[a.rank])[0] ?? null
  );
}
