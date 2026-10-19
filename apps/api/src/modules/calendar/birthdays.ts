import type { BirthdayView } from '@trifylli/shared';

/** Μία επέτειος γενεθλίων μέσα στο διάστημα του ημερολογίου. */
export interface BirthdayOccurrence {
  /** `YYYY-MM-DD` — η ημέρα, χωρίς ώρα. */
  day: string;
  /** Η ηλικία που κλείνει εκείνη τη μέρα. */
  age: number;
}

/**
 * Τα γενέθλια ενός μέλους μέσα στο `[from, to]`, σε επίπεδο **ημέρας**: η λίστα
 * ζητά από «τώρα», και τα σημερινά γενέθλια (μεσάνυχτα) δεν πρέπει να χάνονται.
 *
 * Το διάστημα μπορεί να περνά από Δεκέμβριο σε Ιανουάριο, άρα κοιτάμε κάθε έτος
 * που αγγίζει. Όσοι γεννήθηκαν 29/2 γιορτάζουν 28/2 τα μη δίσεκτα έτη. Το
 * `birthDate` είναι `@db.Date`, δηλαδή μεσάνυχτα UTC.
 */
export function birthdayOccurrences(birthDate: Date, from: Date, to: Date): BirthdayOccurrence[] {
  const fromDay = isoDay(from);
  const toDay = isoDay(to);
  const month = birthDate.getUTCMonth();
  const date = birthDate.getUTCDate();
  const occurrences: BirthdayOccurrence[] = [];

  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year++) {
    const age = year - birthDate.getUTCFullYear();
    if (age < 1) continue;
    const leapDayInCommonYear = month === 1 && date === 29 && !isLeapYear(year);
    const day = isoDay(new Date(Date.UTC(year, month, leapDayInCommonYear ? 28 : date)));
    if (day >= fromDay && day <= toDay) occurrences.push({ day, age });
  }
  return occurrences;
}

/**
 * Ποιοι έχουν γενέθλια μέσα στο `[from, to]` — μία φορά ο καθένας, με τη σειρά
 * της μέρας. Για τις ενδείξεις στη συγκέντρωση και στη δράση.
 */
export function birthdaysIn(
  people: readonly { id: string; firstName: string; lastName: string; birthDate: Date | null }[],
  from: Date,
  to: Date,
): BirthdayView[] {
  const seen = new Set<string>();
  const result: BirthdayView[] = [];
  for (const person of people) {
    if (!person.birthDate || seen.has(person.id)) continue;
    seen.add(person.id);
    for (const { day, age } of birthdayOccurrences(person.birthDate, from, to)) {
      result.push({ userId: person.id, firstName: person.firstName, lastName: person.lastName, day, age });
    }
  }
  return result.sort((a, b) => a.day.localeCompare(b.day) || a.lastName.localeCompare(b.lastName, 'el'));
}

/** Μετατόπιση κατά ακέραιες ημέρες (για τα παράθυρα γύρω από μια ημερομηνία). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
