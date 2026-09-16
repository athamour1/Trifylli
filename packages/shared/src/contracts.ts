/** Κοινά σχήματα payload μεταξύ API και PWA. */
import type {
  AccountRole,
  CheckoutStatus,
  DrasiType,
  KladosType,
  MemberKind,
  MemberStatus,
  ParousiaStatus,
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
