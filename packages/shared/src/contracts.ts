/** Κοινά σχήματα payload μεταξύ API και PWA. */
import type {
  AccountRole,
  CheckoutStatus,
  DrasiFeeKind,
  DrasiFormField,
  DrasiFormStatus,
  DrasiFormType,
  DrasiGroupKind,
  DrasiLedgerKind,
  DrasiReviewKind,
  DrasiRoleKind,
  DrasiType,
  KladosType,
  MemberKind,
  MemberStatus,
  ParousiaStatus,
  PaymentHandlingStatus,
  SignerRole,
  ProodosStatus,
  SymvoulioType,
  SyndromiStatus,
  TimelineSection,
  YlikoCategory,
} from './domain';

export interface AuthenticatedUser {
  id: string;
  ssoId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: AccountRole;
  /** Ο κλάδος που διαχειρίζεται· `null` για τον υπερδιαχειριστή. */
  adminKlados: KladosType | null;
  /** Οι κλάδοι που βλέπει — παράγωγο του ρόλου, για ευκολία του UI. */
  kladoi: KladosType[];
  topikoId: string;
}

/** Λογαριασμός όπως τον βλέπει ο υπερδιαχειριστής στη διαχείριση. */
export interface AccountSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: AccountRole;
  adminKlados: KladosType | null;
  roleLabel: string;
  /** `true` όταν έχει συνδεθεί τουλάχιστον μία φορά (υπάρχει ssoId). */
  activated: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * Αποτέλεσμα δημιουργίας λογαριασμού.
 *
 * Η πρόσκληση (email ορισμού κωδικού) **δεν** μπλοκάρει τη δημιουργία: ο
 * λογαριασμός φτιάχνεται ακόμη κι αν το Authentik είναι άφταστο, και ο
 * υπερδιαχειριστής μαθαίνει αμέσως ότι πρέπει να στείλει πρόσκληση αργότερα.
 */
export interface AccountCreated {
  account: AccountSummary;
  /** `true` όταν έφυγε email με σύνδεσμο ορισμού κωδικού. */
  invited: boolean;
  /** Γιατί δεν έφυγε — `null` όταν έφυγε κανονικά. */
  inviteError: string | null;
}

export interface MemberSummary {
  id: string;
  firstName: string;
  lastName: string;
  kind: MemberKind;
  status: MemberStatus;
  kladosType: KladosType | null;
  /** Η ιδιότητα από το e-SEO (κλάδος / στέλεχος / Τοπ. Συμβούλιο / …). */
  idiotita: string | null;
  subUnit: string | null;
  /** Θέση στελέχους από τα ενεργά πτυχία (π.χ. «Αρχηγός Ομάδας Οδηγών»). */
  leaderTitle: string | null;
  /** Έχει ενεργό πτυχίο «Στέλεχος SOS». */
  isSOS: boolean;
  birthDate: string | null;
  /** Ηλικία σε συμπληρωμένα έτη (από `birthDate`). */
  age: number | null;
  /** Συναίνεση GDPR (από e-SEO). */
  gdprConsent: boolean;
  /** Άδεια χρήσης φωτογραφιών — του ιδίου ή του γονέα (από e-SEO). */
  photoConsent: boolean;
  /** Επιβεβαιωμένη/πληρωμένη συνδρομή τρέχουσας περιόδου (e-SEO). */
  syndromiPaid: boolean;
  /** Υπόλοιπο οφειλής σε ευρώ για την τρέχουσα περίοδο. */
  balanceDue: number;
}

/** Φίλτρα μητρώου — αντιστοιχούν 1:1 στα query params του `/meloi`. */
export interface MemberFilter {
  kladosType?: KladosType[];
  kind?: MemberKind[];
  status?: MemberStatus[];
  /** Ηλικία σε έτη, υπολογισμένη από το `birthDate`. */
  ageMin?: number;
  ageMax?: number;
  /** Μόνο μέλη με ανοιχτό υπόλοιπο. */
  hasDebt?: boolean;
  syndromiStatus?: SyndromiStatus[];
  /** Αναζήτηση σε όνομα, επώνυμο, email. */
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  kind: 'DRASI' | 'SYGGENTRWSH' | 'SYMVOULIO';
  kladosType: KladosType | null;
  drasiType?: DrasiType;
  symvoulioType?: SymvoulioType;
  color: string;
  /** Deep link στο αντίστοιχο detail view. */
  href: string;
}

export interface YlikoAvailability {
  ylikoId: string;
  name: string;
  category: YlikoCategory;
  totalQty: number;
  /** Δεσμευμένο για το ζητούμενο διάστημα. */
  reservedQty: number;
  availableQty: number;
  ownerKladosType: KladosType | null;
  /**
   * Σχέση με την εμβέλεια της λίστας: `OWNED` = ανήκει στον κλάδο/Τοπικό της
   * σελίδας· `BORROWED` = δανεισμένο σε αυτόν τον κλάδο από αλλού (ο ιδιοκτήτης
   * είναι το `ownerKladosType`). Στη σελίδα Τοπικού όλα είναι `OWNED`.
   */
  relation: 'OWNED' | 'BORROWED';
  /** Μόνο όταν `BORROWED`: πόσα τεμάχια έχει δανειστεί τώρα αυτός ο κλάδος. */
  borrowedQty?: number;
  /** Μόνο όταν `BORROWED`: έως πότε (η τελευταία ενεργή δέσμευση). */
  borrowedUntil?: string | null;
  /** Σημείο αποθήκευσης (από τη ρυθμιζόμενη λίστα), αν έχει οριστεί. */
  storagePointId: string | null;
  storagePointName: string | null;
}

/** Σημείο αποθήκευσης υλικού — ανά κλάδο ή κεντρικά (`kladosType = null`). */
export interface StoragePoint {
  id: string;
  name: string;
  kladosType: KladosType | null;
}

export interface CheckoutRequest {
  ylikoId: string;
  qty: number;
  drasiId?: string;
  syggentrwshId?: string;
  /** ISO datetimes — ορίζουν το διάστημα δέσμευσης. */
  from: string;
  to: string;
}

export interface CheckoutConflict {
  ylikoId: string;
  name: string;
  requestedQty: number;
  availableQty: number;
  /** Ποιες δεσμεύσεις μπλοκάρουν, για να ξέρει ο χρήστης σε ποιον να μιλήσει. */
  blockedBy: { kladosType: KladosType | null; label: string; qty: number; status: CheckoutStatus }[];
}

export interface ParousiaEntry {
  memberId: string;
  status: ParousiaStatus;
  note?: string;
}

/** Καταχώρηση παρουσιολογίου — ίδιο σχήμα online και από την offline ουρά. */
export interface ParousiologioPayload {
  syggentrwshId: string;
  entries: ParousiaEntry[];
  /** Πότε συμπληρώθηκε στη συσκευή· κρίσιμο για σωστό merge μετά από offline. */
  recordedAt: string;
}

export interface TimelineBlock {
  id: string;
  section: TimelineSection;
  order: number;
  title: string;
  description: string | null;
  durationMin: number;
  responsibleId: string | null;
  ylikoIds: string[];
}

export interface ProodosEntry {
  memberId: string;
  goalId: string;
  status: ProodosStatus;
  completedAt: string | null;
  note?: string;
}

export interface KataskinosiStats {
  drasiId: string;
  title: string;
  perKlados: {
    kladosType: KladosType;
    stelexi: number;
    kataskinotes: number;
    total: number;
    ylikoCheckedOut: { ylikoId: string; name: string; qty: number }[];
  }[];
  totals: { stelexi: number; kataskinotes: number; total: number };
}

/** Στοιχείο της offline ουράς (outbox) της PWA. */
export interface OutboxItem<T = unknown> {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: T;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// ─────────────────────────── Αρχεία & ταμείο ───────────────────────────

/** Αναφορά σε αποθηκευμένο αρχείο (π.χ. απόδειξη). */
export interface StoredFileRef {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
}

/** Μία κίνηση ταμείου. */
export interface TreasuryEntryView {
  id: string;
  kind: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  occurredAt: string;
  description: string | null;
  kladosType: KladosType | null;
  donorType: string | null;
  receipt: StoredFileRef | null;
  createdBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

/** Σύνοψη ταμείου ενός scope (κλάδος ή Τοπικό). */
export interface TreasurySummary {
  scope: { kladosType: KladosType | null; label: string };
  income: number;
  expense: number;
  balance: number;
  byCategory: { category: string; kind: 'INCOME' | 'EXPENSE'; amount: number }[];
}

// ───────────────────────── Δράσεις (wizard, F0/F12/F13) ─────────────────────────

/** Μία ευθύνη (αρχηγείο ή υπηρεσία) με το στέλεχος που την έχει. */
export interface DrasiRoleView {
  id: string;
  kind: DrasiRoleKind;
  note: string | null;
  user: { id: string; firstName: string; lastName: string; phone: string | null };
}

/** Φιλοξενούμενο Τοπικό — ο κωδικός είναι το `unitId` του e-SEO. */
export interface DrasiGuestTopikoView {
  id: string;
  topikoCode: string;
  topikoName: string;
  kladoi: KladosType[];
  contactName: string | null;
  contactPhone: string | null;
}

/** Ένα Τοπικό όπως το ξέρει το e-SEO (`GET /unit/{id}`). */
export interface EseoUnitInfo {
  code: string;
  name: string;
  /** Ο Τομέας στον οποίο ανήκει, αν τον δίνει το e-SEO. */
  parentName: string | null;
  type: string | null;
}

/**
 * «Ίδια όπως την προηγούμενη»: οι ευθύνες της τελευταίας δράσης του ίδιου
 * φορέα, για να μην ξαναδιαλέγει κανείς έξι ονόματα κάθε φορά.
 */
export interface DrasiRolesTemplate {
  source: { id: string; title: string; dateStart: string } | null;
  roles: { kind: DrasiRoleKind; userId: string; note: string | null }[];
}

// ───────────────────────── Δράσεις: ταμείο & κόστη (F1, F2, F4) ─────────────────────────

export interface DrasiBudgetView {
  category: string;
  planned: number;
  /** Στόχος ποσοστού επί του συνόλου των εξόδων, 0–1. */
  targetPct: number | null;
}

/** Μία κατηγορία εξόδων: τι σχεδιάστηκε, τι ξοδεύτηκε, τι ποσοστό βγήκε. */
export interface DrasiCategoryLine {
  category: string;
  planned: number;
  targetPct: number | null;
  actual: number;
  actualPct: number;
  count: number;
}

export interface DrasiTreasurySummary {
  /** Έσοδα από κινήσεις + εισπράξεις συμμετοχών. */
  income: number;
  incomeFromEntries: number;
  incomeFromPayments: number;
  expense: number;
  balance: number;
  /** `true` όταν η δράση είναι ΚΛΕΙΣΤΗ — καμία κίνηση δεν δέχεται πια. */
  locked: boolean;
  expenses: DrasiCategoryLine[];
  incomes: { category: string; amount: number; count: number }[];
  fees: {
    expected: number;
    collected: number;
    outstanding: number;
    byKind: { kind: DrasiFeeKind; count: number; amount: number }[];
    byStage: { stage: PaymentHandlingStatus; amount: number; count: number }[];
  };
  ledger: { given: number; returned: number; reimbursed: number; open: number };
}

export interface DrasiLedgerView {
  id: string;
  kind: DrasiLedgerKind;
  amount: number;
  occurredAt: string;
  note: string | null;
  settledAt: string | null;
  user: { id: string; firstName: string; lastName: string };
}

/** Ο λογαριασμός ενός στελέχους: τι πήρε, τι επέστρεψε, τι του αποδόθηκε, τι μένει. */
export interface DrasiLedgerAccount {
  user: { id: string; firstName: string; lastName: string };
  given: number;
  returned: number;
  reimbursed: number;
  /** Θετικό ⇒ το στέλεχος χρωστά στο ταμείο· αρνητικό ⇒ το ταμείο χρωστά στο στέλεχος. */
  balance: number;
  entries: DrasiLedgerView[];
}

export interface DrasiPaymentView {
  id: string;
  amount: number;
  paidAt: string;
  method: string | null;
  handlingStatus: PaymentHandlingStatus | null;
  collectedBy: { id: string; firstName: string; lastName: string } | null;
  receipt: StoredFileRef | null;
  note: string | null;
}

export interface DrasiParticipantView {
  id: string;
  kind: MemberKind;
  confirmed: boolean;
  attended: boolean | null;
  note: string | null;
  feeKind: DrasiFeeKind;
  feeAmount: number | null;
  transportAmount: number | null;
  feeNote: string | null;
  /** Τι οφείλει συνολικά (συμμετοχή + μεταφορικά). */
  due: number;
  paid: number;
  balance: number;
  collector: { id: string; firstName: string; lastName: string } | null;
  payments: DrasiPaymentView[];
  user: {
    id: string;
    firstName: string;
    lastName: string;
    kind: MemberKind;
    birthDate: string | null;
    phone: string | null;
    kladosType: KladosType | null;
    guestTopikoName: string | null;
  };
}

/** «Η Μαρία έχει 8 παιδιά, εισέπραξε 6, κρατά 1.440 €, δεν τα έχει παραδώσει.» */
export interface DrasiCollectorView {
  collector: { id: string; firstName: string; lastName: string } | null;
  participants: number;
  expected: number;
  collected: number;
  /** Εισπραγμένα μετρητά που δεν έχουν παραδοθεί ακόμη (στάδιο ΕΙΣΠΡΑΧΘΗΚΕ). */
  holding: number;
  outstanding: number;
}

// ───────────────────────── Δράσεις: φιλοξενούμενοι (F3) & ομάδες (F14) ─────────────────────────

/** Μέλος άλλου Τοπικού — εγγραφή `User` με `guestTopikoCode`, ορατή μόνο στις δράσεις. */
export interface GuestMemberView {
  id: string;
  firstName: string;
  lastName: string;
  kind: MemberKind;
  birthDate: string | null;
  phone: string | null;
  guestTopikoCode: string;
  guestTopikoName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  /** Σε πόσες δράσεις έχει συμμετάσχει (για το «ήρθε και πέρσι»). */
  participations: number;
}

export interface DrasiGroupMemberView {
  participantId: string;
  user: { id: string; firstName: string; lastName: string; kind: MemberKind; birthDate: string | null; kladosType: KladosType | null };
}

export interface DrasiGroupView {
  id: string;
  kind: DrasiGroupKind;
  name: string;
  kladosType: KladosType | null;
  leaderParticipantId: string | null;
  order: number;
  members: DrasiGroupMemberView[];
}

export interface DrasiGroupsView {
  groups: DrasiGroupView[];
  /** Όλοι οι συμμετέχοντες (για τους «αταξινόμητους» ανά είδος). */
  participants: DrasiGroupMemberView[];
}

// ───────────────────────── Δράσεις: έντυπα (F5) & φαρμακείο (F6) ─────────────────────────

export interface DrasiFormView {
  id: string;
  participantId: string;
  type: DrasiFormType;
  status: DrasiFormStatus;
  sentAt: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  signerName: string | null;
  signerRole: SignerRole | null;
  hasData: boolean;
  purgedAt: string | null;
}

export interface DrasiFormsMatrix {
  participants: {
    participantId: string;
    user: { id: string; firstName: string; lastName: string; kind: MemberKind; birthDate: string | null; phone: string | null };
    isMinor: boolean;
    forms: DrasiFormView[];
  }[];
  pending: number;
  total: number;
}

/** Ο σύνδεσμος που βγαίνει ΜΙΑ φορά: στη βάση μένει μόνο το hash του token. */
export interface IssuedFormLink {
  participantId: string;
  formId: string;
  type: DrasiFormType;
  url: string;
  expiresAt: string;
}

/** Τι βλέπει ο γονέας: μόνο αυτό το έντυπο, αυτού του παιδιού. */
export interface PublicFormView {
  drasi: { title: string; dateStart: string; dateEnd: string; location: string | null; topiko: string };
  participant: { firstName: string; lastName: string };
  type: DrasiFormType;
  status: DrasiFormStatus;
  expiresAt: string;
  isMinor: boolean;
  fields: DrasiFormField[];
}

export interface HealthSummaryEntry {
  participantId: string;
  user: { firstName: string; lastName: string; birthDate: string | null; kladosType: KladosType | null };
  skini: string | null;
  group: string | null;
  allergies: string;
  medications: string;
  conditions: string;
  diet: string;
  bloodType: string;
  emergencyPhone: string;
  notes: string;
  submittedAt: string;
}

export interface DrasiPharmacyView {
  assigned: { id: string; name: string; kladosType: KladosType | null; ouchtrackerKitId: string }[];
  candidates: { id: string; name: string; kladosType: KladosType | null; borrowed: boolean }[];
}

// ───────────────────────── Δράσεις: πρόγραμμα (F7), συμβούλια (F8), υλικό (F9) ─────────────────────────

/** Μία ημέρα δράσης = μία συγκέντρωση με `drasiId`. */
export interface DrasiDayView {
  id: string;
  title: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  kladosType: KladosType | null;
  blocks: number;
  /** Ονόματα υπευθύνων διεξαγωγής και υλοποίησης, χωρίς διπλά. */
  responsibles: string[];
  totalDurationMin: number;
}

export interface DrasiSymvoulioView {
  id: string;
  type: SymvoulioType;
  title: string | null;
  date: string;
  finalized: boolean;
  participants: number;
}

export interface DrasiShoppingItemView {
  id: string;
  name: string;
  qty: number;
  estimatedCost: number | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  purchasedAt: string | null;
  treasuryEntry: { id: string; amount: number; category: string } | null;
  yliko: { id: string; name: string } | null;
  note: string | null;
  order: number;
}

export interface DrasiExternalYlikoView {
  id: string;
  name: string;
  qty: number;
  /** Ποιος το φέρνει: δικός μας κλάδος ή φιλοξενούμενο Τοπικό. */
  owner: { kladosType: KladosType | null; guestTopiko: { id: string; name: string } | null };
  responsible: { id: string; firstName: string; lastName: string } | null;
  returnedAt: string | null;
  note: string | null;
}

/** Η λίστα φόρτωσης: τα πάντα, και τα ξένα, σε ένα χαρτί. */
export interface DrasiLoadingList {
  shopping: DrasiShoppingItemView[];
  checkouts: { id: string; name: string; qty: number; unit: string | null; status: CheckoutStatus; kladosType: KladosType | null }[];
  external: DrasiExternalYlikoView[];
}

// ───────────────────────── Δράσεις: αξιολόγηση (F10) & ντοσιέ (F11) ─────────────────────────

export interface DrasiReviewQuestionView {
  id: string;
  order: number;
  text: string;
  kind: DrasiReviewKind;
}

export interface DrasiReviewView {
  questions: DrasiReviewQuestionView[];
  /** Οι απαντήσεις του συνδεδεμένου χρήστη. */
  mine: { questionId: string; value: number | null; text: string | null }[];
  /** Σύνοψη — μόνο για όσους διαχειρίζονται τη δράση. */
  summary: {
    respondents: number;
    questions: {
      questionId: string;
      count: number;
      average: number | null;
      texts: { user: string; text: string }[];
    }[];
  } | null;
}

/** Ό,τι χρειάζεται το ντοσιέ, σε ένα request. */
export interface DrasiDossier {
  drasi: {
    id: string;
    title: string;
    type: DrasiType;
    status: string;
    dateStart: string;
    dateEnd: string;
    location: string | null;
    description: string | null;
    topiko: string;
    organiser: KladosType | null;
    kladoi: KladosType[];
    guestTopika: DrasiGuestTopikoView[];
    roles: DrasiRoleView[];
  };
  days: {
    id: string;
    title: string | null;
    date: string;
    startTime: string | null;
    location: string | null;
    goal: string | null;
    sections: {
      section: TimelineSection;
      label: string;
      notes: string;
      blocks: {
        title: string;
        description: string | null;
        durationMin: number;
        responsible: string | null;
        executor: string | null;
        yliko: string | null;
      }[];
    }[];
  }[];
  participants: (DrasiParticipantView & { groups: { kind: DrasiGroupKind; name: string }[] })[];
  groups: DrasiGroupView[];
  /** Μόνο όταν ζητηθεί ρητά (`health=1`) — η ανάγνωση καταγράφεται. */
  health: HealthSummaryEntry[] | null;
  loading: DrasiLoadingList;
  treasury: { summary: DrasiTreasurySummary; entries: TreasuryEntryView[] } | null;
  symvoulia: { id: string; title: string | null; date: string; agenda: string | null; minutes: string | null; finalized: boolean }[];
  review: DrasiReviewView['summary'];
  formsPending: { pending: number; total: number };
}
