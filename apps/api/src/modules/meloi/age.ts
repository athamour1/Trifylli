/**
 * Μετατροπή ηλικιακού φίλτρου σε όρια ημερομηνίας γέννησης.
 *
 * Φιλτράρουμε στη βάση, όχι στη μνήμη: το `birthDate` έχει index και τα μητρώα
 * ενός Τοπικού φτάνουν εύκολα τις εκατοντάδες εγγραφές.
 *
 * Κάποιος ηλικίας `n` έχει γεννηθεί στο διάστημα `(today - (n+1)y, today - n y]`.
 * Άρα για εύρος `[ageMin, ageMax]`:
 *   birthDate ≤ today - ageMin έτη      (είναι τουλάχιστον ageMin)
 *   birthDate >  today - (ageMax+1) έτη (δεν έχει περάσει τα ageMax)
 */
export interface BirthDateBounds {
  lte?: Date;
  gt?: Date;
}

export function ageToBirthDateBounds(
  ageMin: number | undefined,
  ageMax: number | undefined,
  today: Date = new Date(),
): BirthDateBounds | null {
  if (ageMin === undefined && ageMax === undefined) return null;

  const bounds: BirthDateBounds = {};
  if (ageMin !== undefined) bounds.lte = shiftYears(today, -ageMin);
  if (ageMax !== undefined) bounds.gt = shiftYears(today, -(ageMax + 1));
  return bounds;
}

/** Ηλικία σε ακέραια έτη — ό,τι δείχνει το UI. */
export function ageInYears(birthDate: Date | null, today: Date = new Date()): number | null {
  if (!birthDate) return null;
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function shiftYears(date: Date, years: number): Date {
  const shifted = new Date(date);
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return shifted;
}
