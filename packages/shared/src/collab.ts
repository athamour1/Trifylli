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

/**
 * Η έκδοση της **δομής** ενός εγγράφου, στο `meta` — 1 όταν λείπει. Όταν ένα
 * είδος αποκτά νέα πεδία (π.χ. το γεύμα: μενού και ποσολόγιο δίπλα στη συνταγή),
 * ο server τα γεμίζει από τη βάση την πρώτη φορά που ανοίγει ένα παλιότερο
 * σωσμένο έγγραφο, και ανεβάζει τον αριθμό. Ο client γράφει τα νέα πεδία μόνο
 * αφού τα δει από τον server: αλλιώς ένα αντίγραφο συσκευής χωρίς αυτά θα
 * έγραφε από κενό, πάνω σε ό,τι γέμισε ο server.
 */
export const COLLAB_SCHEMA_KEY = 'schema';

/** Τα μικρά πεδία ενός εγγράφου (χώρος, μενού): απλές τιμές σε ένα `Y.Map` — κερδίζει ο τελευταίος. */
export const COLLAB_SCALARS = 'fields';

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

/**
 * Τα ονόματα των εγγράφων — ίδια στον server και στον client. Τα έγγραφα μιας
 * δράσης ξεκινούν όλα με `drasi:<id>:`, ώστε να κλείνουν ή να σβήνουν μαζί.
 */
export const collabDocument = {
  /** Συμβούλιο: ατζέντα και πρακτικά. */
  symvoulio: (id: string) => `symvoulio:${id}`,
  /** Δράση: η περιγραφή (Ρυθμίσεις). */
  drasiSettings: (drasiId: string) => `drasi:${drasiId}:settings`,
  /** Δράση: η ιστορία του μύθου. */
  drasiMythos: (drasiId: string) => `drasi:${drasiId}:mythos`,
  /** Ρόλος του μύθου: το lore. */
  drasiCharacter: (drasiId: string, characterId: string) => `drasi:${drasiId}:character:${characterId}`,
  /** Στοιχείο του ωρολογίου: το προγραμματικό. */
  drasiItem: (drasiId: string, itemId: string) => `drasi:${drasiId}:item:${itemId}`,
  /** Γεύμα: η συνταγή. */
  drasiMeal: (drasiId: string, itemId: string) => `drasi:${drasiId}:meal:${itemId}`,
  /** Το πρόθεμα όλων των εγγράφων μιας δράσης. */
  drasiPrefix: (drasiId: string) => `drasi:${drasiId}:`,
  /** Συγκέντρωση: όλο το πρόγραμμα — μέρη, κομμάτια, υλικό, στελέχη. */
  syggentrwsh: (id: string) => `syggentrwsh:${id}`,
} as const;

/** Τα πεδία κάθε εγγράφου (ένα `Y.Text` ανά πεδίο). */
export const COLLAB_FIELDS = {
  symvoulio: ['agenda', 'minutes'],
  drasiSettings: ['description'],
  drasiMythos: ['text'],
  drasiCharacter: ['lore'],
  drasiItem: ['description'],
  drasiMeal: ['recipe'],
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

// ───────────────────────── Πρόγραμμα συγκέντρωσης ─────────────────────────

/**
 * Η δομή του εγγράφου `syggentrwsh:<id>`. Όλα είναι χάρτες με id ως κλειδί και
 * η σειρά ένας αριθμός (`order`): μια μετακίνηση αλλάζει μόνο τον αριθμό, οπότε
 * δεν σβήνει ό,τι γράφει κάποιος άλλος στο ίδιο κομμάτι εκείνη τη στιγμή.
 *
 *  - `sections`: μέρος → `{ notes: Y.Text, durationMin }`
 *  - `blocks`:   id → `{ section, order, title, durationMin, responsibleId, yliko, description: Y.Text }`
 *  - `yliko`:    id → `{ order, label, qty, packed }`
 *  - `stelexi`:  userId → `true`
 */
export const PLAN_KEYS = {
  sections: 'sections',
  blocks: 'blocks',
  yliko: 'yliko',
  stelexi: 'stelexi',
} as const;

/** Όρια του προγράμματος — ο server διορθώνει ό,τι βγαίνει έξω (δεν απορρίπτει). */
export const PLAN_LIMITS = {
  blockMinutes: { min: 1, max: 600 },
  sectionMinutes: { min: 0, max: 600 },
  qty: { min: 1, max: 999 },
  title: 200,
  label: 200,
} as const;

export interface PlanBlockSnapshot {
  id: string;
  section: string;
  order: number;
  title: string;
  durationMin: number;
  responsibleId: string | null;
  /** Υλικό της αποθήκης δηλωμένο στο κομμάτι (με το όνομα, για προβολή). */
  yliko: { id: string; name: string; qty: number }[];
  description: string;
}

export interface PlanYlikoSnapshot {
  id: string;
  order: number;
  label: string;
  qty: number;
  packed: boolean;
}

/** Η απλή μορφή του προγράμματος — ό,τι γράφεται στη βάση και ό,τι δείχνει η σελίδα. */
export interface PlanSnapshot {
  sections: Record<string, { notes: string; durationMin: number }>;
  /** Ταξινομημένα ανά μέρος (με τη σειρά των μερών) και `order`. */
  blocks: PlanBlockSnapshot[];
  /** Ταξινομημένα κατά `order`. */
  yliko: PlanYlikoSnapshot[];
  stelexi: string[];
}

/** Ακέραιος μέσα στα όρια — ό,τι δεν είναι αριθμός παίρνει το `fallback`. */
export function clampInt(value: unknown, limits: { min: number; max: number }, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, n));
}
