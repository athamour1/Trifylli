/**
 * Ποιος λογαριασμός φαίνεται στο error tracking (μόνο το id). Ενδιάμεσο μικρό
 * module: τα stores το καλούν χωρίς να φέρνουν το SDK του Sentry στο αρχικό
 * bundle — εκείνο φορτώνεται χωριστά, και μόνο αν υπάρχει DSN.
 */
let current: string | null = null;
let apply: ((id: string | null) => void) | null = null;

export function setReportingUser(id: string | null): void {
  current = id;
  apply?.(id);
}

/** Το καλεί το error tracking μόλις φορτώσει· παίρνει αμέσως τον τρέχοντα λογαριασμό. */
export function onReportingUser(fn: (id: string | null) => void): void {
  apply = fn;
  fn(current);
}
