/**
 * Ο σύνδεσμος της τρέχουσας εγγραφής του OpenReplay, για το error tracking:
 * κάθε σφάλμα στο GlitchTip παίρνει tag `openreplay` με το URL, ώστε από το
 * issue να ανοίγεις το replay. Μικρό module-γέφυρα, όπως το `reporting-user`:
 * κανένα από τα δύο SDK δεν φορτώνεται στο αρχικό bundle.
 */
let current: string | null = null;
let apply: ((url: string | null) => void) | null = null;

export function setReplayUrl(url: string | null): void {
  current = url;
  apply?.(url);
}

/** Το καλεί το error tracking μόλις φορτώσει· παίρνει αμέσως τον τρέχοντα σύνδεσμο. */
export function onReplayUrl(fn: (url: string | null) => void): void {
  apply = fn;
  fn(current);
}
