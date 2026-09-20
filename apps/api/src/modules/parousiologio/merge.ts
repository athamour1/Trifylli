/**
 * Συγχώνευση καταχωρήσεων παρουσιολογίου.
 *
 * Το παρουσιολόγιο συμπληρώνεται στο γήπεδο, συχνά χωρίς δίκτυο, και η ουρά της
 * PWA μπορεί να φτάσει ώρες αργότερα — ή δύο στελέχη να συμπληρώσουν το ίδιο
 * παρουσιολόγιο από δύο συσκευές.
 *
 * Κανόνας: **κερδίζει η πιο πρόσφατη καταγραφή στη συσκευή** (`recordedAt`), όχι
 * η πιο πρόσφατη άφιξη στον server. Έτσι μια καθυστερημένη συγχρονισμένη εγγραφή
 * δεν σβήνει μια μεταγενέστερη διόρθωση που έγινε online.
 *
 * Ισοπαλία στο `recordedAt`: κρατάμε την υπάρχουσα εγγραφή — η επανάληψη του
 * ίδιου αιτήματος (retry της ουράς) δεν πρέπει να αλλάζει τίποτα.
 */

export interface StoredEntry {
  userId: string;
  status: string;
  note: string | null;
  recordedAt: Date;
}

export interface IncomingEntry {
  userId: string;
  status: string;
  note?: string | null;
  recordedAt: Date;
}

export interface MergeResult {
  /** Εγγραφές που πρέπει να γραφτούν (νέες ή πιο πρόσφατες). */
  toWrite: IncomingEntry[];
  /** Εγγραφές που απορρίφθηκαν ως παλαιότερες — επιστρέφονται στον client. */
  stale: Array<{ userId: string; keptRecordedAt: Date }>;
}

export function mergeParousies(
  existing: readonly StoredEntry[],
  incoming: readonly IncomingEntry[],
): MergeResult {
  const byUser = new Map(existing.map((entry) => [entry.userId, entry]));
  const toWrite: IncomingEntry[] = [];
  const stale: MergeResult['stale'] = [];

  // Μέσα στο ίδιο payload μπορεί να υπάρχουν διπλότυπα (retry + διόρθωση):
  // κρατάμε μόνο το νεότερο ανά μέλος πριν τη σύγκριση με τη βάση.
  const latestIncoming = new Map<string, IncomingEntry>();
  for (const entry of incoming) {
    const seen = latestIncoming.get(entry.userId);
    if (!seen || entry.recordedAt > seen.recordedAt) latestIncoming.set(entry.userId, entry);
  }

  for (const entry of latestIncoming.values()) {
    const current = byUser.get(entry.userId);
    if (!current) {
      toWrite.push(entry);
      continue;
    }
    if (entry.recordedAt > current.recordedAt) {
      toWrite.push(entry);
    } else {
      stale.push({ userId: entry.userId, keptRecordedAt: current.recordedAt });
    }
  }

  return { toWrite, stale };
}
