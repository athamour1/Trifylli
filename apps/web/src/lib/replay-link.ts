/**
 * Ο σύνδεσμος της τρέχουσας εγγραφής του OpenObserve, για το error tracking:
 * κάθε σφάλμα στο GlitchTip παίρνει tag `replay` με το URL, ώστε από το
 * issue να ανοίγεις το replay. Μικρό module-γέφυρα, όπως το `reporting-user`:
 * κανένα από τα δύο SDK δεν φορτώνεται στο αρχικό bundle.
 *
 * Ο σύνδεσμος υπολογίζεται τη στιγμή του σφάλματος: το SDK του OpenObserve
 * δημιουργεί τη συνεδρία ασύγχρονα (αμέσως μετά το init δεν υπάρχει ακόμα id),
 * και μια συνεδρία μπορεί να ανανεωθεί ενώ η σελίδα μένει ανοιχτή.
 */
let provider: (() => string | null) | null = null;

export function setReplayUrlProvider(next: (() => string | null) | null): void {
  provider = next;
}

export function currentReplayUrl(): string | null {
  return provider?.() ?? null;
}
