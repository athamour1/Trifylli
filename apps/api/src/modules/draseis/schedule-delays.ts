/**
 * Η καθυστέρηση της δράσης (Φ12): «καθυστερούμε 15΄ από εδώ και πέρα». Οι
 * προγραμματισμένες ώρες δεν αλλάζουν· κάθε στοιχείο έχει απλώς πόσα λεπτά
 * μετακινείται — όσα δηλώθηκαν σε αυτό ή σε προηγούμενο της ίδιας ημέρας.
 */
export function delaysOf(itemIds: readonly string[], delays: readonly { itemId: string; minutes: number }[]): Map<string, number> {
  const declared = new Map<string, number>();
  for (const delay of delays) declared.set(delay.itemId, (declared.get(delay.itemId) ?? 0) + delay.minutes);
  const out = new Map<string, number>();
  let running = 0;
  for (const id of itemIds) {
    running += declared.get(id) ?? 0;
    out.set(id, running);
  }
  return out;
}

/** Πόσα λεπτά πριν φεύγει η υπενθύμιση. */
export const REMINDER_LEAD_MIN = 10;
/** Αν το cron έχασε λίγα λεπτά (επανεκκίνηση), στέλνει ό,τι «χάθηκε» μέσα σε τόσα. */
const CATCH_UP_MIN = 2;

/**
 * Τα στοιχεία που η υπενθύμισή τους (10΄ πριν από τη **διορθωμένη** έναρξη)
 * είναι τώρα — ή ήταν μέσα στα τελευταία λεπτά. Μαζί με την έναρξη: μια νέα
 * καθυστέρηση φέρνει νέα ώρα και νέα υπενθύμιση.
 */
export function remindersDue<T extends { id: string; startsAt: Date; delayMin: number }>(items: readonly T[], now: Date): (T & { startsAt: Date })[] {
  const due: (T & { startsAt: Date })[] = [];
  for (const item of items) {
    const startsAt = new Date(item.startsAt.getTime() + item.delayMin * 60_000);
    const remindAt = startsAt.getTime() - REMINDER_LEAD_MIN * 60_000;
    if (remindAt <= now.getTime() && remindAt > now.getTime() - CATCH_UP_MIN * 60_000) due.push({ ...item, startsAt });
  }
  return due;
}
