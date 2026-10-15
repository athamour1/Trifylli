/**
 * Συνεργασία σε πραγματικό χρόνο — ό,τι πρέπει να συμφωνούν API και PWA
 * (βλ. docs/synergasia.md).
 */

/** Η διαδρομή του WebSocket κάτω από το πρόθεμα του API (`/api/collab`). */
export const COLLAB_PATH = 'collab';

/**
 * Έκδοση του πρωτοκόλλου και της δομής των εγγράφων. Ανεβαίνει όταν ένας παλιός
 * client θα έγραφε λάθος δομή: ο server τον απορρίπτει και η σελίδα λέει
 * «ανανέωσε». Ένα tab ανοιχτό από πριν το release δεν ξαναφορτώνει μόνο του.
 */
export const COLLAB_PROTOCOL = 1;

/** Τι στέλνει ο client ως «token» για κάθε έγγραφο (JSON). */
export interface CollabTokenPayload {
  /** Το access token του Authentik — ή το email, όταν το API τρέχει με dev bypass. */
  t: string;
  /** Η γενιά του αντιγράφου της συσκευής· κενό όταν η συσκευή δεν έχει αντίγραφο. */
  g: string;
  /** Το `COLLAB_PROTOCOL` του client. */
  p: number;
}

/** Γιατί απορρίφθηκε μια σύνδεση — ο client αντιδρά διαφορετικά σε καθένα. */
export const CollabRejection = {
  /** Παλιά έκδοση της εφαρμογής: «Νέα έκδοση — ανανέωση». */
  UPDATE_REQUIRED: 'update-required',
  /** Το αντίγραφο της συσκευής είναι από άλλη γενιά: σβήνεται και ξανασυνδέεται. */
  STALE_GENERATION: 'stale-generation',
  /** Άκυρο ή ληγμένο token: νέο token και ξανά. */
  UNAUTHENTICATED: 'unauthenticated',
  /** Το έγγραφο δεν υπάρχει ή δεν έχεις πρόσβαση. */
  FORBIDDEN: 'forbidden',
} as const;
export type CollabRejection = (typeof CollabRejection)[keyof typeof CollabRejection];

/** Το πεδίο της γενιάς μέσα στο έγγραφο (`Y.Map('meta')`) — το γράφει μόνο ο server. */
export const COLLAB_META = 'meta';
export const COLLAB_GENERATION_KEY = 'generation';

/** Ποιος είναι συνδεδεμένος, όπως τον δείχνει η παρουσία· το ορίζει ο server. */
export interface CollabPresenceUser {
  id: string;
  /** Σύντομο («Μαρία Π.») — πάνω από τον κέρσορα, όπου δεν χωρά ολόκληρο. */
  name: string;
  fullName: string;
  color: string;
}

/** «Μαρία Παπαδοπούλου» → «Μαρία Π.» */
export function collabShortName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return [firstName.trim(), initial ? `${initial}.` : ''].filter(Boolean).join(' ');
}

/** Τα ονόματα των εγγράφων — ίδια στον server και στον client. */
export const collabDocument = {
  /** Συμβούλιο: ατζέντα και πρακτικά. */
  symvoulio: (id: string) => `symvoulio:${id}`,
} as const;

/** Τα πεδία κάθε εγγράφου (ένα `Y.Text` ανά πεδίο). */
export const COLLAB_FIELDS = {
  symvoulio: ['agenda', 'minutes'],
} as const;

/**
 * Χρώματα κερσόρων: σκούρα αρκετά για λευκά γράμματα στην ετικέτα, διακριτά
 * μεταξύ τους, όχι κόκκινο (μοιάζει με σφάλμα).
 */
const COLLAB_COLORS = ['#1e88e5', '#43a047', '#8e24aa', '#f4511e', '#00897b', '#6d4c41', '#3949ab', '#546e7a', '#d81b60', '#5e35b1'];

/** Σταθερό χρώμα ανά άτομο: το ίδιο σε κάθε συσκευή και κάθε έγγραφο. */
export function collabColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLLAB_COLORS[hash % COLLAB_COLORS.length] as string;
}
