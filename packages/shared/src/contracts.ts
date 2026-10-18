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
  DrasiReviewSettings,
  DrasiRoleKind,
  DrasiScheduleKind,
  DrasiScheduleStatus,
  DrasiSnack,
  DrasiType,
  KladosDuty,
  YpiresiesRotation,
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
import type { LeaderRank } from './leader-roles';
import type { KladosGrants } from './access';

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
  /** Μόνο για `STELEXOS`: δικαιώματα ανά κλάδο (βαθμός e-SEO + υπευθυνότητες). */
  grants: KladosGrants | null;
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

/** Πού βρίσκεται η πρόσβαση ενός στελέχους στην πλατφόρμα. */
export type StelexosAccessStatus =
  /** Έχει λογαριασμό διαχείρισης (υπερδιαχειριστής / διαχειριστής κλάδου). */
  | 'ADMIN'
  /** Έχει συνδεθεί τουλάχιστον μία φορά. */
  | 'ACTIVE'
  /** Στάλθηκε πρόσκληση, δεν έχει μπει ακόμα. */
  | 'INVITED'
  /** Χωρίς λογαριασμό — μπορεί να ενεργοποιηθεί. */
  | 'NONE'
  /** Χωρίς email στο e-SEO — δεν μπορεί να προσκληθεί. */
  | 'NO_EMAIL';

/** Ένα στέλεχος στη λίστα ενεργοποίησης του υπερδιαχειριστή. */
export interface StelexosAccessRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  kladoi: { klados: KladosType; rank: LeaderRank | null }[];
  status: StelexosAccessStatus;
  lastLoginAt: string | null;
}

export interface StelexiActivationResult {
  results: { userId: string; ok: boolean; error: string | null }[];
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

/** Φιλοξενούμενο Τοπικό — μόνο όνομα, γραμμένο με το χέρι. */
export interface DrasiGuestTopikoView {
  id: string;
  topikoName: string;
  kladoi: KladosType[];
  contactName: string | null;
  contactPhone: string | null;
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
  /** Ρητό ποσό του συμμετέχοντα· `null` ⇒ ακολουθεί τις Ρυθμίσεις της δράσης. */
  feeAmount: number | null;
  transportAmount: number | null;
  /** Τα ποσά που ισχύουν (ρητό ή από τις Ρυθμίσεις). */
  fee: number;
  transport: number;
  /** Η προεπιλογή των Ρυθμίσεων για το είδος του — για την υπόδειξη στο κενό πεδίο. */
  defaultFee: number | null;
  defaultTransport: number | null;
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
  /** Ομαδάρχης (μέλος) ή, στις ΟΕ, το υπεύθυνο στέλεχος (όχι μέλος). */
  leaderParticipantId: string | null;
  /** Επιτροπή: το προγραμματικό που ετοιμάζει. */
  scheduleItem: { id: string; title: string; date: string } | null;
  order: number;
  members: DrasiGroupMemberView[];
}

export interface DrasiGroupsView {
  groups: DrasiGroupView[];
  /** Όλοι οι συμμετέχοντες (για τους «αταξινόμητους» ανά είδος). */
  participants: DrasiGroupMemberView[];
}

// ───────────────────────── Δράσεις: μύθος ─────────────────────────

/** Στέλεχος της δράσης, όπως εμφανίζεται δίπλα σε έναν ρόλο. */
export interface DrasiMythosStelexos {
  participantId: string;
  /** Ο λογαριασμός του — για να ξέρει η σελίδα ποιος ρόλος είναι «δικός μου». */
  userId: string;
  firstName: string;
  lastName: string;
}

/** Ρόλος του μύθου: ποιος είναι στην ιστορία και ποιο στέλεχος τον παίζει. */
export interface DrasiCharacterView {
  id: string;
  name: string;
  lore: string | null;
  order: number;
  stelexos: DrasiMythosStelexos | null;
}

export interface DrasiMythosView {
  title: string | null;
  text: string | null;
  characters: DrasiCharacterView[];
  /** Τα στελέχη της δράσης — οι επιλογές για κάθε ρόλο. */
  stelexi: DrasiMythosStelexos[];
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
  drasi: { title: string; dateStart: string; dateEnd: string; location: string | null; topiko: string; klados: KladosType | null };
  participant: { firstName: string; lastName: string };
  type: DrasiFormType;
  status: DrasiFormStatus;
  expiresAt: string;
  isMinor: boolean;
  fields: DrasiFormField[];
  /** Προσυμπληρωμένες τιμές από το μητρώο (διεύθυνση, αρ. ταυτότητας) — ο γονέας τις διορθώνει. */
  prefill: Record<string, string>;
  /**
   * Ποιοι μπορούν να υπογράψουν: οι γονείς/κηδεμόνες του μητρώου (ανήλικος) ή ο
   * ίδιος (ενήλικος). Όταν υπάρχουν, το ονοματεπώνυμο ΔΕΝ γράφεται ελεύθερα —
   * διαλέγεται από εδώ και ο server δέχεται μόνο αυτά.
   */
  signers: { name: string; role: SignerRole }[];
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

/** Στοιχείο του ωρολογίου της δράσης, με το προγραμματικό του (αν έχει γραφτεί). */
export interface DrasiScheduleItemView {
  id: string;
  /** YYYY-MM-DD στη ζώνη του Τοπικού. */
  date: string;
  order: number;
  durationMin: number;
  /** Υπολογισμένα: έναρξη ημέρας + διάρκειες των προηγούμενων. */
  startsAt: string;
  endsAt: string;
  title: string;
  kind: DrasiScheduleKind;
  /** Η προετοιμασία του — η στήλη του στο kanban «Προγραμματικά». */
  status: DrasiScheduleStatus;
  /** Κολατσιό μέσα σε αυτό το στοιχείο (δεκατιανό/απογευματινό) — μπαίνει στο διατροφολόγιο. */
  snack: DrasiSnack | null;
  location: string | null;
  description: string | null;
  /** Οι υπεύθυνοι: ένα ή περισσότερα στελέχη της δράσης. */
  responsibles: { id: string; firstName: string; lastName: string }[];
  /** Το υλικό: λίστα όπως στις συγκεντρώσεις (`packed` = μπήκε στο σακίδιο). */
  /** Η λίστα υλικού — τα id είναι σταθερά (οι γραμμές του κοινού εγγράφου του στοιχείου). */
  yliko: { id: string; label: string; qty: number; packed: boolean }[];
  /** Έχει γραφτεί προγραμματικό (περιγραφή ή υπεύθυνος ή υλικό). */
  hasProgramma: boolean;
  /**
   * Πόσα λεπτά μετακινείται λόγω καθυστέρησης («καθυστερούμε 15΄ από εδώ») — οι
   * ώρες `startsAt`/`endsAt` μένουν οι προγραμματισμένες.
   */
  delayMin: number;
}

/** Μια δηλωμένη καθυστέρηση: από ποιο στοιχείο, πόσα λεπτά (αρνητικά = κερδίσαμε), ποιος. */
export interface DrasiDelayView {
  id: string;
  itemId: string;
  minutes: number;
  by: { id: string; firstName: string; lastName: string } | null;
  at: string;
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
  /** Όποιος το αγοράζει — και όποιος είπε «το παίρνω εγώ» (το κλείνει για τους άλλους). */
  assignee: { id: string; firstName: string; lastName: string } | null;
  purchasedAt: string | null;
  /** Όποιος το σημείωσε «αγοράστηκε». */
  purchasedBy: { id: string; firstName: string; lastName: string } | null;
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
  /** «Μπήκε» στη φόρτωση — ποιος και πότε. */
  loaded: DrasiLoadedTick | null;
}

/** Ένα τικ «μπήκε» της φόρτωσης. */
export interface DrasiLoadedTick {
  at: string;
  by: { id: string; firstName: string; lastName: string } | null;
}

/** Η λίστα φόρτωσης: τα πάντα, και τα ξένα, σε ένα χαρτί. */
export interface DrasiLoadingList {
  shopping: DrasiShoppingItemView[];
  checkouts: {
    id: string;
    name: string;
    qty: number;
    unit: string | null;
    status: CheckoutStatus;
    kladosType: KladosType | null;
    loaded: DrasiLoadedTick | null;
  }[];
  external: DrasiExternalYlikoView[];
}

// ───────────────────────── Δράσεις: αξιολόγηση (F10) & ντοσιέ (F11) ─────────────────────────

export interface DrasiReviewQuestionView {
  id: string;
  order: number;
  text: string;
  description: string | null;
  kind: DrasiReviewKind;
  required: boolean;
  /** CHOICE/CHECKBOX. */
  options: string[];
  /** Ετικέτες άκρων κλίμακας. */
  scaleLow: string | null;
  scaleHigh: string | null;
}

export interface DrasiReviewAnswerValue {
  questionId: string;
  value: number | null;
  text: string | null;
  choices: string[];
}

/** Μία υποβολή (ένας απαντών) — όπως τη βλέπει ο διαχειριστής στα «Ατομικά». */
export interface DrasiReviewResponse {
  /** Σταθερό αναγνωριστικό για διαγραφή — ακόμη και στην ανώνυμη φόρμα (είναι το userId, δεν εμφανίζεται). */
  key: string;
  /** Όνομα· «Απάντηση #n» όταν η φόρμα είναι ανώνυμη. */
  user: string;
  submittedAt: string;
  answers: DrasiReviewAnswerValue[];
}

export interface DrasiReviewSummary {
  respondents: number;
  questions: {
    questionId: string;
    count: number;
    /** Μέσος όρος για κλίμακες. */
    average: number | null;
    /** Κατανομή: τιμές κλίμακας ή επιλογές, με πλήθος. */
    distribution: { label: string; count: number }[];
    texts: { user: string; text: string }[];
  }[];
  responses: DrasiReviewResponse[];
}

/** Πρόσκληση αξιολόγησης προς συμμετέχοντα (δημόσιος σύνδεσμος, χωρίς λογαριασμό). */
export interface DrasiReviewInviteView {
  participantId: string;
  user: { firstName: string; lastName: string; kind: MemberKind; birthDate: string | null };
  inviteId: string | null;
  status: DrasiFormStatus;
  sentAt: string | null;
  expiresAt: string | null;
  answeredAt: string | null;
}

/** Ο σύνδεσμος αξιολόγησης που βγαίνει ΜΙΑ φορά — στη βάση μένει μόνο το hash. */
export interface IssuedReviewLink {
  participantId: string;
  inviteId: string;
  url: string;
  expiresAt: string;
}

/** Ο κοινός σύνδεσμος αξιολόγησης μιας δράσης: υπάρχει; πόσοι απάντησαν μέσω αυτού; */
export interface DrasiReviewShareView {
  active: boolean;
  createdAt: string | null;
  guestResponses: number;
}

/** Τι βλέπει όποιος ανοίγει σύνδεσμο αξιολόγησης — προσωπικό (συμμετέχων) ή κοινό (οποιοσδήποτε). */
export interface PublicReviewView {
  mode: 'personal' | 'shared';
  /** Ο κλάδος που διοργανώνει — η σελίδα βάφεται στα χρώματά του. */
  drasi: { title: string; dateStart: string; dateEnd: string; topiko: string; klados: KladosType | null };
  /** Μόνο στον προσωπικό σύνδεσμο. */
  participant: { firstName: string; lastName: string } | null;
  /** Κοινός σύνδεσμος χωρίς ανωνυμία ⇒ ζητείται όνομα. */
  askName: boolean;
  /** Ο επισκέπτης του κοινού συνδέσμου (ο browser τον θυμάται για αλλαγή απάντησης). */
  guestId: string | null;
  guestName: string | null;
  settings: Pick<DrasiReviewSettings, 'title' | 'description' | 'anonymous' | 'allowEdit' | 'showSummary' | 'confirmationMessage'>;
  questions: DrasiReviewQuestionView[];
  mine: DrasiReviewAnswerValue[];
  mineSubmittedAt: string | null;
  canAnswer: boolean;
  cannotAnswerReason: string | null;
  summary: DrasiReviewSummary | null;
}

export interface DrasiReviewView {
  settings: DrasiReviewSettings;
  questions: DrasiReviewQuestionView[];
  /** Οι απαντήσεις του συνδεδεμένου χρήστη. */
  mine: DrasiReviewAnswerValue[];
  mineSubmittedAt: string | null;
  /** Μπορεί να απαντήσει τώρα (κοινό + δέχεται απαντήσεις + δικαίωμα αλλαγής). */
  canAnswer: boolean;
  /** Γιατί όχι — για το μήνυμα στην οθόνη. */
  cannotAnswerReason: string | null;
  /** Σύνοψη — για όσους διαχειρίζονται τη δράση, ή για τους απαντώντες αν το επιτρέπουν οι ρυθμίσεις. */
  summary: DrasiReviewSummary | null;
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
  /** Το ωρολόγιο ανά ημέρα, με την ώρα έναρξης της ημέρας. */
  days: { date: string; startTime: string; items: DrasiScheduleItemView[] }[];
  participants: (DrasiParticipantView & { groups: { kind: DrasiGroupKind; name: string }[] })[];
  groups: DrasiGroupView[];
  /** Μόνο όταν ζητηθεί ρητά (`health=1`) — η ανάγνωση καταγράφεται. */
  health: HealthSummaryEntry[] | null;
  loading: DrasiLoadingList;
  treasury: { summary: DrasiTreasurySummary; entries: TreasuryEntryView[] } | null;
  symvoulia: { id: string; title: string | null; date: string; agenda: string | null; minutes: string | null; finalized: boolean }[];
  review: DrasiReviewSummary | null;
  formsPending: { pending: number; total: number };
  /** Ο μύθος και οι ρόλοι· `null` όταν δεν έχει γραφτεί τίποτα. */
  mythos: Omit<DrasiMythosView, 'stelexi'> | null;
  /** Υπηρεσίες, υπεύθυνοι και χρονοδιάγραμμα. */
  ypiresies: DrasiYpiresiesView;
}

/** Το ωρολόγιο όπως το βλέπει η καρτέλα: ημέρες με ώρα έναρξης και στοιχεία. */
export interface DrasiScheduleView {
  days: { date: string; startTime: string; overridden: boolean; items: DrasiScheduleItemView[]; delays: DrasiDelayView[] }[];
  /** Τα στελέχη της δράσης (δικά μας, φιλοξενούμενα, εξωτερικά) — οι επιλογές για τους υπεύθυνους. */
  stelexi: DrasiScheduleStelexos[];
}

// ───────────────────────── Δράσεις: διατροφολόγιο ─────────────────────────

/** Γραμμή του ποσολογίου ενός γεύματος. */
export interface DrasiMealIngredient {
  /** Σταθερό — το id της γραμμής στο κοινό έγγραφο του γεύματος. */
  id: string;
  label: string;
  /** Συνολική ποσότητα ως κείμενο — «2 kg», «3 πακέτα». */
  qty: string;
  bought: boolean;
}

/** Γεύμα του διατροφολογίου: στοιχείο του ωρολογίου με είδος «Γεύμα» ή ετικέτα κολατσιού. */
export interface DrasiMealSummary {
  itemId: string;
  title: string;
  kind: DrasiScheduleKind;
  snack: DrasiSnack | null;
  startsAt: string;
  endsAt: string;
  /** Τι τρώμε· `null` όσο δεν έχει γραφτεί. */
  menu: string | null;
  hasRecipe: boolean;
  ingredients: number;
  bought: number;
}

export interface DrasiDiatrofologioView {
  /** Όλες οι ημέρες της δράσης, όπως στο πρόγραμμα — και όσες δεν έχουν γεύμα. */
  days: { date: string; meals: DrasiMealSummary[] }[];
}

/** Η σελίδα ενός γεύματος. */
/** Μία γραμμή της ροής δραστηριότητας της δράσης (βλ. `DrasiActivityView`). */
export interface DrasiActivityEvent {
  id: string;
  /** Το σημείο: το κομμάτι της διαδρομής του API (`schedule`, `groups`…) ή κοινό έγγραφο (`doc:item`…). */
  topic: string;
  /** `add`, `change`, `remove` ή `write` (σε κοινό έγγραφο). */
  verb: string;
  /** Πόσες συνεχόμενες αλλαγές του ίδιου ατόμου μαζεύει η γραμμή. */
  count: number;
  /** Η τελευταία της. */
  at: string;
  actor: { id: string; firstName: string; lastName: string } | null;
}

/** Η ροή δραστηριότητας και πότε την είδε τελευταία φορά ο χρήστης. */
export interface DrasiActivityView {
  lastSeenAt: string | null;
  events: DrasiActivityEvent[];
}

export interface DrasiMealView {
  itemId: string;
  /** YYYY-MM-DD στη ζώνη του Τοπικού. */
  date: string;
  title: string;
  kind: DrasiScheduleKind;
  snack: DrasiSnack | null;
  startsAt: string;
  endsAt: string;
  menu: string | null;
  /** Η συνταγή — Markdown με εικόνες. */
  recipe: string | null;
  ingredients: DrasiMealIngredient[];
}

export interface DrasiScheduleStelexos {
  /** Το id του χρήστη — αυτό γράφεται στους υπεύθυνους. */
  id: string;
  firstName: string;
  lastName: string;
  /** Από ποιο Τοπικό έρχεται, για φιλοξενούμενους και εξωτερικούς· `null` για τα δικά μας. */
  guestTopikoName: string | null;
}

// ───────────────────────── Αρχηγείο κλάδου ─────────────────────────

/** Στέλεχος του αρχηγείου: βαθμός από το e-SEO, υπευθυνότητες από τον κλάδο. */
export interface ArxigeioMember {
  userId: string;
  firstName: string;
  lastName: string;
  /** `null` ⇒ στέλεχος του κλάδου χωρίς ενεργό πτυχίο θέσης (π.χ. τοποθετήθηκε με το χέρι). */
  rank: LeaderRank | null;
  /** Ο τίτλος όπως στο e-SEO, π.χ. «Υπαρχηγός Σμήνους». */
  rankTitle: string | null;
  duties: KladosDuty[];
}

export interface ArxigeioView {
  klados: KladosType;
  members: ArxigeioMember[];
}

// ───────────────────────── Δράσεις: εξωτερικά στελέχη ─────────────────────────

/** Εξωτερικό στέλεχος μιας δράσης (π.χ. από άλλο Τοπικό), με πρόσβαση όσο η δράση είναι ανοιχτή. */
export interface DrasiExternalView {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** Από πού έρχεται (ελεύθερο κείμενο, π.χ. «Τοπικό Καλαμάτας»). */
  origin: string | null;
  /** `true` όταν έχει συνδεθεί τουλάχιστον μία φορά. */
  active: boolean;
  /**
   * `false` ⇒ φιλοξενούμενο στέλεχος που μπήκε από τους συμμετέχοντες χωρίς email:
   * είναι στη δράση, αλλά χωρίς λογαριασμό («Δώσε πρόσβαση»).
   */
  account: boolean;
  roles: DrasiRoleKind[];
}

/** Εξωτερικό στέλεχος (λογαριασμός για δράσεις) — η λίστα του υπερδιαχειριστή. */
export interface ExternalAccountRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** Από πού έρχεται (ελεύθερο κείμενο, π.χ. «Τοπικό Καλαμάτας»). */
  origin: string | null;
  /** Έχει συνδεθεί τουλάχιστον μία φορά. */
  activated: boolean;
  lastLoginAt: string | null;
  /** Οι δράσεις του· `open: false` ⇒ έκλεισε ή αρχειοθετήθηκε, εκεί δεν μπαίνει πια. */
  draseis: { id: string; title: string; klados: KladosType | null; open: boolean }[];
}

export interface DrasiExternalCreated {
  external: DrasiExternalView;
  invited: boolean;
  inviteError: string | null;
}

/** Δράση όπου ο χρήστης είναι στέλεχος — για την Αρχική («Οι δράσεις μου»). */
export interface MyDrasiView {
  id: string;
  title: string;
  type: DrasiType;
  status: string;
  dateStart: string;
  dateEnd: string;
  klados: KladosType | null;
  roles: DrasiRoleKind[];
}

// ───────────────────────── Δράσεις: υπηρεσίες ─────────────────────────

export interface DrasiYpiresiaView {
  id: string;
  name: string;
  /** Προκαθορισμένη (`EXORAISMOS`, `PIATA`…) ή `null` για πρόσθετη της δράσης. */
  kind: DrasiRoleKind | null;
  order: number;
  responsibles: { id: string; firstName: string; lastName: string; phone: string | null }[];
}

/** Μια «βάρδια»: ημέρα + μισό (0 = πρωί / όλη μέρα, 1 = απόγευμα). */
export interface DrasiYpiresiaSlotView {
  date: string;
  half: number;
  groupId: string;
  ypiresiaId: string;
}

export interface DrasiYpiresiesView {
  rotation: YpiresiesRotation;
  services: DrasiYpiresiaView[];
  /** Οι ομάδες που κάνουν υπηρεσίες: ενωμοτίες, φωλιές, πεντάδες, ΟΕ. */
  groups: { id: string; name: string; kind: DrasiGroupKind; kladosType: KladosType | null }[];
  /** Οι βάρδιες της δράσης κατά τη ρύθμιση κύλισης. */
  shifts: { date: string; half: number }[];
  slots: DrasiYpiresiaSlotView[];
}

// ───────────────────────── Δράσεις: ανακοινώσεις ─────────────────────────

/** Πόσο μεγάλη μια ανακοίνωση — σύντομο μήνυμα, όχι κείμενο. */
export const ANNOUNCEMENT_MAX = 1000;

/** Ανακοίνωση προς τα στελέχη της δράσης, με το «το είδαν N/M». Χωρίς απαντήσεις. */
export interface DrasiAnnouncementView {
  id: string;
  body: string;
  /** Σε ποιους ρόλους του αρχηγείου· κενό = σε όλα τα στελέχη. */
  roles: DrasiRoleKind[];
  by: { id: string; firstName: string; lastName: string } | null;
  at: string;
  /** Όσοι την πήραν — και πότε την είδε όποιος την είδε. */
  audience: { id: string; firstName: string; lastName: string; seenAt: string | null }[];
  /** Είναι για μένα και δεν την έχω δει ακόμα. */
  unseen: boolean;
}

// ───────────────────────── Δράσεις: καταμέτρηση ─────────────────────────

export interface DrasiHeadcountGroupView {
  id: string;
  name: string;
  /** Τα μέλη της ομάδας (`DrasiParticipant.id`) — όσοι μετρώνται. */
  members: { id: string; firstName: string; lastName: string }[];
  /** Η τελευταία μέτρηση της ομάδας — `null` αν δεν μετρήθηκε ακόμα. */
  check: { absentIds: string[]; by: { id: string; firstName: string; lastName: string } | null; at: string } | null;
}

/** «Αναχώρηση από Μέγαρα — 32/34, λείπουν: …», ζωντανά. */
export interface DrasiHeadcountView {
  id: string;
  title: string;
  groupKind: DrasiGroupKind;
  by: { id: string; firstName: string; lastName: string } | null;
  at: string;
  completedAt: string | null;
  closedAt: string | null;
  groups: DrasiHeadcountGroupView[];
  totals: { members: number; present: number; absent: number; checkedGroups: number; groups: number };
}

// ───────────────────────── Συμβούλια: ψηφοφορίες ─────────────────────────

/** Οι επιλογές του «Ναι/Όχι/Αποχή». */
export const POLL_YES_NO = ['Ναι', 'Όχι', 'Αποχή'] as const;

export const POLL_LIMITS = { question: 300, option: 120, options: 10 } as const;

/** Μια ψηφοφορία του συμβουλίου, με τα αποτελέσματα ζωντανά. */
export interface SymvoulioPollView {
  id: string;
  question: string;
  options: string[];
  /** Μυστική: φαίνεται ποιος ψήφισε, όχι τι. */
  secret: boolean;
  by: { id: string; firstName: string; lastName: string } | null;
  at: string;
  closedAt: string | null;
  /** Πόσοι διάλεξαν κάθε επιλογή (με τη σειρά των `options`). */
  counts: number[];
  /** Οι συμμετέχοντες του συμβουλίου: αν ψήφισαν — και, στις επώνυμες, τι. */
  voters: { id: string; firstName: string; lastName: string; voted: boolean; choice: number | null }[];
  /** Η δική μου ψήφος (στις μυστικές μόνο αν ψήφισα). */
  mine: { voted: boolean; choice: number | null };
  canVote: boolean;
  canManage: boolean;
}
