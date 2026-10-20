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
  /** Στοιχείο του ωρολογίου: το προγραμματικό, ο χώρος και το υλικό (βλ. `ITEM_DOC`). */
  drasiItem: (drasiId: string, itemId: string) => `drasi:${drasiId}:item:${itemId}`,
  /** Γεύμα: η συνταγή, το μενού και το ποσολόγιο (βλ. `MEAL_DOC`). */
  drasiMeal: (drasiId: string, itemId: string) => `drasi:${drasiId}:meal:${itemId}`,
  /** Παράλληλο γεύμα (F16): δική του συνταγή, μενού και ποσολόγιο — ίδια δομή με το γεύμα. */
  drasiMealVariant: (drasiId: string, variantId: string) => `drasi:${drasiId}:mealvariant:${variantId}`,
  /**
   * Το δωμάτιο της δράσης: χωρίς περιεχόμενο — μόνο ποιος είναι εκεί και τα
   * μηνύματα «άλλαξε αυτό» (βλ. `CollabChange`). Κλείνει μαζί με τα έγγραφά της.
   */
  drasiRoom: (drasiId: string) => `drasi:${drasiId}:room`,
  /** Το πρόθεμα όλων των εγγράφων μιας δράσης. */
  drasiPrefix: (drasiId: string) => `drasi:${drasiId}:`,
  /** Συγκέντρωση: όλο το πρόγραμμα — μέρη, κομμάτια, υλικό, στελέχη. */
  syggentrwsh: (id: string) => `syggentrwsh:${id}`,
  /** Το δωμάτιο ενός χρήστη: εκεί φτάνουν αμέσως οι ειδοποιήσεις του (μόνο ο ίδιος μπαίνει). */
  user: (userId: string) => `user:${userId}`,
  /**
   * Το δωμάτιο του Τοπικού: κάθε αλλαγή μέσω API φτάνει εδώ ως «άλλαξε αυτό»
   * (θέμα = η ενότητα του API, π.χ. `meloi`, `yliko`), ώστε κάθε σελίδα του
   * κλάδου και του Τοπικού να ξαναφορτώνει μόνη της. Χωρίς περιεχόμενο.
   */
  topiko: (topikoId: string) => `topiko:${topikoId}`,
} as const;

/**
 * Μήνυμα του server σε όσους έχουν ανοιχτό ένα δωμάτιο ή έγγραφο, μετά από μια
 * αλλαγή μέσω API: «άλλαξε αυτό». Το περιεχόμενο δεν ταξιδεύει — η σελίδα
 * ξαναφορτώνει ό,τι την αφορά, κρατώντας ό,τι γράφει η ίδια και δεν έχει σωθεί.
 */
export interface CollabChange {
  /**
   * Τι άλλαξε: το κομμάτι της διαδρομής του API μετά το id (`schedule`, `groups`,
   * `participants`, …), ή `drasi` / `header` για την ίδια την οντότητα.
   */
  topic: string;
  /** Ποιος (λογαριασμός). */
  by: string | null;
  /** Η καρτέλα που έκανε την αλλαγή (`COLLAB_CLIENT_HEADER`) — αυτή ξέρει ήδη. */
  origin: string | null;
  /** Δεν είναι πράξη πάνω στη δράση (π.χ. «τις είδα»): ξαναφορτώνει, χωρίς σημαδάκι «άλλαξε». */
  quiet?: boolean;
}

/** Η κεφαλίδα με την οποία κάθε καρτέλα λέει στο API ποια είναι (βλ. `CollabChange.origin`). */
export const COLLAB_CLIENT_HEADER = 'X-Client-Id';

/**
 * Τα πεδία της οντότητας που ζουν πια στο κοινό έγγραφο — ο `PATCH` τους απαντά
 * 409 «ανανέωσε». Στα απλά είδη είναι και τα κείμενά του (ένα `Y.Text` ανά πεδίο).
 */
export const COLLAB_FIELDS = {
  symvoulio: ['agenda', 'minutes'],
  drasiSettings: ['description'],
  drasiMythos: ['text'],
  drasiCharacter: ['lore'],
  drasiItem: ['description', 'location', 'yliko'],
  drasiMeal: ['recipe', 'menu', 'ingredients'],
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

// ───────────────────────── Στοιχείο του ωρολογίου & γεύμα ─────────────────────────

/**
 * `drasi:<id>:item:<id>` (δομή 2): το προγραμματικό (`description`, Y.Text), ο
 * χώρος (`fields.location`) και το υλικό (`yliko`: id → `{ order, label, qty, packed }`).
 */
export const ITEM_DOC = { schema: 2, description: 'description', location: 'location', yliko: 'yliko' } as const;

/**
 * `drasi:<id>:meal:<id>` (δομή 2): η συνταγή (`recipe`, Y.Text), το μενού
 * (`fields.menu`) και το ποσολόγιο (`ingredients`: id → `{ order, label, qty, bought }`,
 * με την ποσότητα ως κείμενο — «2 kg»).
 */
export const MEAL_DOC = { schema: 2, recipe: 'recipe', menu: 'menu', ingredients: 'ingredients' } as const;

/** Όρια των λιστών και των μικρών πεδίων — ο server κόβει ό,τι βγαίνει έξω. */
export const ROW_LIMITS = {
  label: 200,
  location: 200,
  menu: 500,
  ingredientQty: 60,
  ylikoQty: { min: 1, max: 999 },
  rows: 200,
} as const;

/** Γραμμή του ποσολογίου όπως είναι στο έγγραφο — με το ποιος και πότε την αγόρασε. */
export interface IngredientSnapshot {
  id: string;
  order: number;
  label: string;
  qty: string;
  bought: boolean;
  boughtBy: string | null;
  /** ISO. */
  boughtAt: string | null;
}

/** Γραμμή του υλικού ενός στοιχείου του ωρολογίου — με το ποιος και πότε την τσέκαρε. */
export interface ItemYlikoSnapshot extends PlanYlikoSnapshot {
  packedBy: string | null;
  /** ISO. */
  packedAt: string | null;
}

/** Ακέραιος μέσα στα όρια — ό,τι δεν είναι αριθμός παίρνει το `fallback`. */
export function clampInt(value: unknown, limits: { min: number; max: number }, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, n));
}

// ───────────────────────── Ειδοποιήσεις ─────────────────────────

/**
 * Τα είδη ειδοποιήσεων — καθένα κλείνει χωριστά από τη σελίδα /settings. Το push
 * λέει μόνο **τι** και **πού**, ποτέ ονόματα παιδιών ή υγεία (ερώτημα 17).
 */
export const NOTIFICATION_KINDS = {
  role: 'Νέος ρόλος σε δράση',
  responsible: 'Υπεύθυνος σε στοιχείο του προγράμματος',
  mention: 'Αναφορά σε σχόλιο',
  comment: 'Νέα σχόλια και απαντήσεις',
  approval: 'Εγκρίσεις προγραμματικών και γευμάτων',
  reminder: 'Υπενθυμίσεις προγράμματος',
  announcement: 'Ανακοινώσεις δράσεων',
  headcount: 'Καταμετρήσεις',
  poll: 'Ψηφοφορίες συμβουλίων',
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsView {
  unread: number;
  items: NotificationView[];
}

// ───────────────────────── Σχόλια ─────────────────────────

/**
 * Σχόλια στα κοινά έγγραφα (Φ9). Ζουν **έξω** από το Yjs: σχολιάζει όποιος βλέπει
 * το έγγραφο (ακόμα κι αν δεν το γράφει), φέρνουν ειδοποιήσεις και σβήνονται από
 * τον συντάκτη τους. Η φράση κρατιέται με relative positions του Yjs, οπότε μένει
 * στη θέση της όσο αλλάζει το κείμενο γύρω· αν σβηστεί, μένει το απόσπασμα.
 */
export const COMMENT_LIMITS = {
  body: 4000,
  quote: 300,
  /** Μία relative position του Yjs σε base64. */
  anchor: 256,
  /** Το κλειδί του κειμένου μέσα στο έγγραφο (`description`, `block:<id>`…). */
  field: 80,
  mentions: 20,
  /** Σχόλια (με τις απαντήσεις) ανά έγγραφο. */
  perDocument: 2000,
} as const;

/** Η φράση ενός σχολίου: αρχή και τέλος ως relative positions του Yjs (base64). */
export interface CommentAnchor {
  start: string;
  end: string;
}

/** Στέλεχος όπως φαίνεται γύρω από ένα κοινό έγγραφο (σχόλια, ιστορικό, «Το διάβασαν») — ποτέ παιδιά. */
export interface CollabPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Στέλεχος που αναφέρεται με «@». */
export type CommentPerson = CollabPerson;

export interface CommentView {
  id: string;
  /** Το κείμενο μέσα στο έγγραφο· `null` = σε όλο το έγγραφο. */
  field: string | null;
  anchor: CommentAnchor | null;
  /** Η φράση όπως ήταν όταν γράφτηκε το σχόλιο. */
  quote: string | null;
  body: string;
  mentions: CommentPerson[];
  /** `null` αν ο λογαριασμός δεν υπάρχει πια. */
  author: CommentPerson | null;
  parentId: string | null;
  resolvedAt: string | null;
  resolvedBy: CommentPerson | null;
  editedAt: string | null;
  createdAt: string;
}

/** Ένα νήμα: το πρώτο σχόλιο με τις απαντήσεις του (παλιότερη πρώτη). */
export interface CommentThreadView extends CommentView {
  replies: CommentView[];
}

// ───────────────────────── Ιστορικό εκδόσεων & «Το διάβασαν» ─────────────────────────

/** Μια έκδοση στη λίστα του ιστορικού: πότε, ποιοι έγραψαν από την προηγούμενη, ορόσημο. */
export interface CollabVersionSummary {
  id: string;
  createdAt: string;
  /** «Οριστικοποίηση», «Επαναφορά»… — `null` για τις αυτόματες. */
  label: string | null;
  writers: CollabPerson[];
}

/** Ένα κομμάτι μιας έκδοσης όπως διαβάζεται — π.χ. «Προγραμματικό», ή «Υλικό» ως γραμμές. */
export interface CollabVersionPart {
  key: string;
  label: string;
  text: string;
}

export interface CollabVersionView extends CollabVersionSummary {
  parts: CollabVersionPart[];
  /** Η προηγούμενη έκδοση, για τη σύγκριση — `null` για την πρώτη. */
  previous: CollabVersionPart[] | null;
}

/** «Το διάβασαν 5/8»: ποιοι άνοιξαν την τελευταία έκδοση. */
export interface DocReadersView {
  version: { id: string; createdAt: string; label: string | null } | null;
  /** Τα στελέχη του εγγράφου — όσοι θα έπρεπε να το διαβάσουν. */
  audience: CollabPerson[];
  readers: { person: CollabPerson; readAt: string; current: boolean }[];
}

// ───────────────────────── Εγκρίσεις ─────────────────────────

/** Πρόχειρο → Για έλεγχο → Εγκρίθηκε (και «Επιστροφή» πίσω στο πρόχειρο). */
export const APPROVAL_STATUS_LABEL = {
  PROXEIRO: 'Πρόχειρο',
  ELEGXOS: 'Για έλεγχο',
  EGKRITHIKE: 'Εγκρίθηκε',
} as const;
export type ApprovalStatus = keyof typeof APPROVAL_STATUS_LABEL;

/** Η έγκριση ενός εγγράφου, και τι μπορεί να κάνει ο χρήστης σε αυτή. */
export interface ApprovalView {
  document: string;
  status: ApprovalStatus;
  requestedBy: CollabPerson | null;
  requestedAt: string | null;
  /** Όποιος ενέκρινε ή επέστρεψε. */
  decidedBy: CollabPerson | null;
  decidedAt: string | null;
  returnNote: string | null;
  /** Άλλαξε μετά την έγκριση — μένει «Εγκρίθηκε». */
  changedAfter: boolean;
  /** Ζητά έλεγχο όποιος γράφει το έγγραφο. */
  canRequest: boolean;
  /** Εγκρίνει ή επιστρέφει ο Αρχηγός της δράσης και οι διαχειριστές του κλάδου. */
  canDecide: boolean;
}

/** Μια γραμμή της σύνοψης («8 εγκρίθηκαν · 3 για έλεγχο»). */
export interface ApprovalSummaryRow {
  document: string;
  status: ApprovalStatus;
  changedAfter: boolean;
}

/** Η εγκεκριμένη μορφή δίπλα στην τωρινή. */
export interface ApprovalCompareView {
  approvedAt: string | null;
  approved: CollabVersionPart[];
  current: CollabVersionPart[];
}
