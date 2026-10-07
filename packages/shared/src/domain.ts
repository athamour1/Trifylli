/**
 * Λεξιλόγιο του πεδίου (domain vocabulary) του Σ.Ε.Ο.
 *
 * Οι τιμές των enums είναι σταθερές (μη μεταφράσιμες) και ταυτίζονται 1:1 με τα
 * Prisma enums, ώστε API και UI να μιλούν την ίδια γλώσσα. Οι ελληνικές ετικέτες
 * ζουν στο `labels.ts`.
 */

/** Οι κλάδοι ενός Τοπικού Τμήματος. */
export const KladosType = {
  ASTERIA: 'ASTERIA',
  POULIA: 'POULIA',
  ODIGOI: 'ODIGOI',
  MEGALOI_ODIGOI: 'MEGALOI_ODIGOI',
} as const;
export type KladosType = (typeof KladosType)[keyof typeof KladosType];

/**
 * Τύπος λογαριασμού — **μόνο** για όσους μπαίνουν στην εφαρμογή.
 *
 * Το Τοπικό λειτουργεί με πέντε λογαριασμούς: έναν υπερδιαχειριστή και έναν
 * διαχειριστή ανά κλάδο. Ο τύπος λέει *τι* μπορεί να κάνει κάποιος, το
 * `adminKlados` *πού*: ένας `KLADOS_ADMIN` έχει πάντα ακριβώς έναν κλάδο.
 *
 * Τα μέλη και τα στελέχη **δεν** είναι λογαριασμοί — είναι εγγραφές μητρώου
 * (βλ. `MemberKind`) και δεν κάνουν login.
 */
export const AccountRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  KLADOS_ADMIN: 'KLADOS_ADMIN',
} as const;
export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole];

/**
 * Τι είναι ένα άτομο μέσα στο μητρώο.
 *
 * Ξεχωριστό από τον `AccountRole` επειδή απαντά σε άλλη ερώτηση: τα στατιστικά
 * κατασκήνωσης θέλουν «πόσα στελέχη, πόσοι κατασκηνωτές», ανεξάρτητα από το
 * ποιος έχει πρόσβαση στην εφαρμογή.
 */
export const MemberKind = {
  /** Παιδί/οδηγός — μέλος του κλάδου. */
  MELOS: 'MELOS',
  /** Ενήλικο στέλεχος. */
  STELEXOS: 'STELEXOS',
} as const;
export type MemberKind = (typeof MemberKind)[keyof typeof MemberKind];

/** Κατάσταση μέλους στο μητρώο. */
export const MemberStatus = {
  ENERGO: 'ENERGO',
  ANENERGO: 'ANENERGO',
  APOCHOROISE: 'APOCHOROISE',
} as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

/** Κατηγορία υλικού. */
export const YlikoCategory = {
  /** Σκηνές, εργαλεία, μαγειρικά — ο,τι στηρίζει τη λειτουργία. */
  LEITOURGIKO: 'LEITOURGIKO',
  /** Γραφική ύλη, αναλώσιμα, υλικό δράσεων. */
  PROGRAMMATIKO: 'PROGRAMMATIKO',
  /** Φαρμακευτικό υλικό — συγχρονίζεται με Ouchtracker. */
  FARMAKEIO: 'FARMAKEIO',
} as const;
export type YlikoCategory = (typeof YlikoCategory)[keyof typeof YlikoCategory];

/** Είδος σημείωσης συντήρησης υλικού. */
export const MaintenanceKind = {
  DAMAGE: 'DAMAGE',
  REPAIR: 'REPAIR',
} as const;
export type MaintenanceKind = (typeof MaintenanceKind)[keyof typeof MaintenanceKind];

/** Κατάσταση υλικού κατά την επιστροφή (σύντομη απογραφή). */
export const ReturnCondition = {
  KALI: 'KALI',
  FTHORA: 'FTHORA',
  VLAVI: 'VLAVI',
  APOLEIA: 'APOLEIA',
} as const;
export type ReturnCondition = (typeof ReturnCondition)[keyof typeof ReturnCondition];

/** Τύπος δράσης. */
export const DrasiType = {
  MONOIMERI: 'MONOIMERI',
  POLYIMERI: 'POLYIMERI',
  KATASKINOSI: 'KATASKINOSI',
} as const;
export type DrasiType = (typeof DrasiType)[keyof typeof DrasiType];

/**
 * Κατάσταση δράσης.
 *
 * `PROSXEDIO`: το wizard δεν ολοκληρώθηκε — η δράση υπάρχει για να μη χαθεί
 * τίποτα, αλλά δεν μετράει σε ημερολόγιο και στατιστικά. `KLEISTI`: τελείωσε και
 * το ταμείο της κλείδωσε. Βλ. docs/draseis.md (F0).
 */
export const DrasiStatus = {
  PROSXEDIO: 'PROSXEDIO',
  ENERGI: 'ENERGI',
  KLEISTI: 'KLEISTI',
} as const;
export type DrasiStatus = (typeof DrasiStatus)[keyof typeof DrasiStatus];

/**
 * Ευθύνες μέσα σε μία δράση: το **αρχηγείο** (σχεδόν πάντα παρόν) και οι
 * **υπηρεσίες** (κατ' επιλογήν — δεν έχει κάθε δράση μαγείρεμα ή SOS).
 *
 * Ένα enum και όχι δύο, γιατί και στις δύο περιπτώσεις η ερώτηση είναι η ίδια:
 * «ποιο στέλεχος είναι υπεύθυνο για τι». Η διάκριση είναι μόνο εμφάνισης —
 * βλ. `DRASI_ARXIGEIO_KINDS` / `DRASI_YPIRESIA_KINDS`.
 */
export const DrasiRoleKind = {
  // Αρχηγείο
  ARXIGOS: 'ARXIGOS',
  PROGRAMMA: 'PROGRAMMA',
  LEITOURGIA: 'LEITOURGIA',
  TAMIAS: 'TAMIAS',
  TROFODOSIA: 'TROFODOSIA',
  /** Το άτομο που μαγειρεύει — διαφορετικό από την υπηρεσία `MAGEIREMA`, που βοηθά. */
  MAGEIRISSA: 'MAGEIRISSA',
  // Υπηρεσίες
  EXORAISMOS: 'EXORAISMOS',
  PIATA: 'PIATA',
  MAGEIREMA: 'MAGEIREMA',
  SERVIRISMA: 'SERVIRISMA',
  KATHARIOTITA: 'KATHARIOTITA',
  FARMAKEIO: 'FARMAKEIO',
  SOS: 'SOS',
} as const;
export type DrasiRoleKind = (typeof DrasiRoleKind)[keyof typeof DrasiRoleKind];

export const DRASI_ARXIGEIO_KINDS: readonly DrasiRoleKind[] = [
  'ARXIGOS',
  'PROGRAMMA',
  'LEITOURGIA',
  'TAMIAS',
  'TROFODOSIA',
  'MAGEIRISSA',
];
export const DRASI_YPIRESIA_KINDS: readonly DrasiRoleKind[] = [
  'EXORAISMOS',
  'PIATA',
  'MAGEIREMA',
  'SERVIRISMA',
  'KATHARIOTITA',
  'FARMAKEIO',
  'SOS',
];

/**
 * Τύπος συμβουλίου.
 *
 * Ο κλάδος έχει **έναν**: το συμβούλιό του. Η παλιότερη διάκριση σε Ομάδας /
 * Υπευθύνων / Ενωμοτίας ζητούσε από τα στελέχη να κατατάξουν κάτι που στην
 * πράξη είναι μία συνάντηση. Στο Τοπικό η διάκριση κρατά νόημα, γιατί τα δύο
 * σώματα είναι όντως διαφορετικά.
 */
export const SymvoulioType = {
  KLADOU: 'KLADOU',
  TOPIKOU: 'TOPIKOU',
  STELEXON: 'STELEXON',
} as const;
export type SymvoulioType = (typeof SymvoulioType)[keyof typeof SymvoulioType];

export const KLADOS_SYMVOULIA: readonly SymvoulioType[] = [SymvoulioType.KLADOU];

export const TOPIKO_SYMVOULIA: readonly SymvoulioType[] = [
  SymvoulioType.TOPIKOU,
  SymvoulioType.STELEXON,
];

/** Παρουσία μέλους σε συγκέντρωση ή δράση. */
export const ParousiaStatus = {
  PAROUSIA: 'PAROUSIA',
  APOUSIA: 'APOUSIA',
  DIKAIOLOGIMENI: 'DIKAIOLOGIMENI',
  ARGOPORIA: 'ARGOPORIA',
} as const;
export type ParousiaStatus = (typeof ParousiaStatus)[keyof typeof ParousiaStatus];

/** Στάδιο ενός κομματιού συγκέντρωσης. */
export const TimelineSection = {
  ANOIGMA: 'ANOIGMA',
  KYRIO_MEROS: 'KYRIO_MEROS',
  KLEISIMO: 'KLEISIMO',
} as const;
export type TimelineSection = (typeof TimelineSection)[keyof typeof TimelineSection];

/**
 * Η σειρά με την οποία εκτελείται — και επομένως εμφανίζεται — μια συγκέντρωση.
 *
 * Τα κλειδιά ενός object literal δεν έχουν εγγυημένη σειρά για τον αναγνώστη του
 * κώδικα, και τόσο το API όσο και η PWA πρέπει να συμφωνούν· γι' αυτό η σειρά
 * δηλώνεται ρητά εδώ αντί να προκύπτει από το `TimelineSection`.
 */
export const TIMELINE_SECTION_ORDER: readonly TimelineSection[] = [
  TimelineSection.ANOIGMA,
  TimelineSection.KYRIO_MEROS,
  TimelineSection.KLEISIMO,
];

/**
 * Κύκλος ζωής δέσμευσης υλικού. Η `DESMEFSI` κρατά το υλικό χωρίς να το βγάζει
 * φυσικά από την αποθήκη — εκεί πατάει η αποφυγή διπλοκρατήσεων.
 */
export const CheckoutStatus = {
  DESMEFSI: 'DESMEFSI',
  PARALAVI: 'PARALAVI',
  EPISTROFI: 'EPISTROFI',
  AKYROSI: 'AKYROSI',
} as const;
export type CheckoutStatus = (typeof CheckoutStatus)[keyof typeof CheckoutStatus];

/** Οι καταστάσεις που δεσμεύουν πραγματικά ποσότητα από το απόθεμα. */
export const BLOCKING_CHECKOUT_STATUSES: readonly CheckoutStatus[] = [
  CheckoutStatus.DESMEFSI,
  CheckoutStatus.PARALAVI,
];

/** Κατάσταση συνδρομής για μια περίοδο. */
export const SyndromiStatus = {
  PLIROMENI: 'PLIROMENI',
  MERIKI: 'MERIKI',
  EKKREMI: 'EKKREMI',
  APALLAGI: 'APALLAGI',
} as const;
export type SyndromiStatus = (typeof SyndromiStatus)[keyof typeof SyndromiStatus];

/** Κατάσταση ατομικού στόχου προόδου. */
export const ProodosStatus = {
  DEN_XEKINISE: 'DEN_XEKINISE',
  SE_EXELIXI: 'SE_EXELIXI',
  OLOKLIROMENO: 'OLOKLIROMENO',
} as const;
export type ProodosStatus = (typeof ProodosStatus)[keyof typeof ProodosStatus];

/** Πηγή εγγραφής — ξεχωρίζει τα χειρόγραφα από τα συγχρονισμένα δεδομένα. */
export const DataSource = {
  LOCAL: 'LOCAL',
  ESEO: 'ESEO',
  OUCHTRACKER: 'OUCHTRACKER',
} as const;
export type DataSource = (typeof DataSource)[keyof typeof DataSource];

/**
 * Καρτέλα Ατομικής Προόδου Κλάδου Οδηγών.
 *
 * Σε αντίθεση με το σταθερό checklist των άλλων κλάδων, ο Οδηγός επιλέγει και
 * «περνάει» τα δικά του Μονοπάτια και Πτυχία: Υπόσχεση → Μονοπάτια & Πτυχία →
 * Κορυφές (βλ. βοήθημα στελεχών Κλάδου Οδηγών, Κεφ. 7).
 */
export const ProodosEntryKind = {
  /** Το πρώτο βήμα — δίνεται μία φορά. */
  YPOSCHESI: 'YPOSCHESI',
  /** Δραστηριότητα που επιλέγει/παρουσιάζει ο Οδηγός, σε μία από τις 4 ενότητες. */
  MONOPATI: 'MONOPATI',
  /** Πτυχίο επιλογής. */
  PTYCHIO: 'PTYCHIO',
  /** Πτυχίο Οδηγισμού (Α΄/Β΄/Γ΄ — οδηγικές γνώσεις). */
  PTYCHIO_ODIGISMOU: 'PTYCHIO_ODIGISMOU',
} as const;
export type ProodosEntryKind = (typeof ProodosEntryKind)[keyof typeof ProodosEntryKind];

/** Οι 4 θεματικές ενότητες των Μονοπατιών. */
export const MONOPATI_THEMES = [
  'Ο εαυτός μου και οι δυνατότητές του',
  'Κοινωνικό περιβάλλον – προσφορά',
  'Φύση και περιβάλλον',
  'Τέχνη και δημιουργία',
] as const;
export type MonopatiTheme = (typeof MONOPATI_THEMES)[number];

/** Κάθε Κορυφή: 4 Μονοπάτια + 1 Πτυχίο Οδηγισμού + 1 Πτυχίο επιλογής. */
export const KORUFI_REQUIREMENT = { monopatia: 4, ptychiaOdigismou: 1, ptychia: 1 } as const;
/** Συνολικές Κορυφές: Α΄, Β΄, Γ΄. */
export const KORUFES_TOTAL = 3;

/**
 * Καρτέλα Ατομικής Προόδου Κλάδου Μεγάλων Οδηγών.
 *
 * Υπόσχεση → Ασημένια Πυξίδα → Χρυσή Πυξίδα. Στοιχεία: Προσανατολισμοί (σε 7
 * ενότητες), Ειδικεύσεις, Υπευθυνότητες, Επιτροπές (βλ. «Ατομική Πρόοδος Μ.Ο.»,
 * Σ.Ε.Ο. 2025).
 */
export const MOEntryKind = {
  YPOSCHESI: 'YPOSCHESI',
  PROSANATOLISMOS: 'PROSANATOLISMOS',
  EIDIKEFSI: 'EIDIKEFSI',
  YPEFTHYNOTITA: 'YPEFTHYNOTITA',
  EPITROPI: 'EPITROPI',
} as const;
export type MOEntryKind = (typeof MOEntryKind)[keyof typeof MOEntryKind];

/** Οι 7 ενότητες των Προσανατολισμών. */
export const MO_ENOTITES = [
  'Φροντίζω Εμένα',
  'Γνωρίζω τον Εαυτό μου',
  'Δημιουργώ και Εκφράζομαι Ελεύθερα',
  'Αναλαμβάνω Δράση',
  'Ζω (σ)την Φύση',
  'Σκέφτομαι Παγκόσμια',
  'Τεχνολογία και Επιχειρηματικότητα',
] as const;
export type MOEnotita = (typeof MO_ENOTITES)[number];

/** Κατηγορία για ειδικές Επιτροπές (Εξωτερικής Δράσης ή Συνεργασία με Ειδικό). */
export const EPITROPI_EIDIKI = 'EIDIKI';

/** Ασημένια Πυξίδα: 7 Προσανατολισμοί (1/ενότητα) + 1 Υπευθυνότητα + 2 Επιτροπές. */
export const ASIMENIA_REQ = { enotites: 7, ypefthynotites: 1, epitropes: 2 } as const;
/** Χρυσή Πυξίδα (μετά την Ασημένια): 3 Προσανατολισμοί (3 ενότητες) + 1 ειδική Επιτροπή + 1 Ειδίκευση. */
export const CHRYSI_REQ = { prosanatolismoi: 3, epitropiEidiki: 1, eidikefseis: 1 } as const;

/**
 * Καρτέλα Ατομικής Προόδου Κλάδου Πουλιών (Σμήνος).
 *
 * Υπόσχεση → 1ο Φτερό → 2ο Φτερό → Κίτρινος Κόμπος, παράλληλα με Πτυχία. Το
 * περιεχόμενο είναι Βήματα (βιβλίο «Βήματα στον Κόσμο», Ενότητα Β).
 */
export const PouliaEntryKind = {
  YPOSCHESI: 'YPOSCHESI',
  VIMA: 'VIMA',
  VIMA_KK: 'VIMA_KK',
  PTYCHIO: 'PTYCHIO',
} as const;
export type PouliaEntryKind = (typeof PouliaEntryKind)[keyof typeof PouliaEntryKind];

/** Τα 3 κεφάλαια/άξονες των Βημάτων. */
export const POULIA_KEFALAIA = ['Ανεβαίνω Ψηλότερα', 'Κοντά στη Φύση', 'Δίνω Χέρι'] as const;
export type PouliaKefalaio = (typeof POULIA_KEFALAIA)[number];

/**
 * 1ο Φτερό = 3 Βήματα από κάθε κεφάλαιο· 2ο Φτερό = 6 από κάθε κεφάλαιο
 * (σωρευτικά)· Κίτρινος Κόμπος = 2 Βήματα Κίτρινου Κόμπου.
 */
export const FTERO_REQ = { ftero1PerKefalaio: 3, ftero2PerKefalaio: 6, kitrinosKompos: 2 } as const;

/**
 * Καρτέλα Ατομικής Προόδου Κλάδου Αστεριών (Γαλαξία).
 *
 * «Για να Γίνω Αστέρι» (1 δραστηριότητα από κάθε μία από τις 7 ακτίνες) →
 * Υπόσχεση → Πτυχία (βιβλίο «Βοήθημα Κλάδου Αστεριών»).
 */
export const AsteriEntryKind = {
  YPOSCHESI: 'YPOSCHESI',
  AKTINA: 'AKTINA',
  PTYCHIO: 'PTYCHIO',
} as const;
export type AsteriEntryKind = (typeof AsteriEntryKind)[keyof typeof AsteriEntryKind];

/** Οι 7 ακτίνες του αστεριού «για να Γίνω Αστέρι». */
export const ASTERI_AKTINES = [
  'Για να Γίνω Αστέρι',
  'Φαντασία',
  'Φύση',
  'Κίνηση',
  'Εμείς και οι Άλλοι',
  'Αισθήσεις',
  'Τέχνη',
] as const;
export type AsteriAktina = (typeof ASTERI_AKTINES)[number];

/** Συνολικά Πτυχία Αστεριών (5 κανονικά + 2 Διανυκτέρευσης + 2 Χαρούμενου Ταξιδιού). */
export const ASTERI_PTYCHIA_TOTAL = 9;

// ─────────────────────────── Ταμείο & οικονομικά ───────────────────────────

/** Είδος κίνησης ταμείου. */
export const TreasuryEntryKind = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;
export type TreasuryEntryKind = (typeof TreasuryEntryKind)[keyof typeof TreasuryEntryKind];

/**
 * Κατηγορίες κινήσεων. Αποθηκεύονται ως string (όχι Prisma enum) ώστε να
 * προστίθενται νέες χωρίς migration· η εγκυρότητα ελέγχεται στο DTO.
 */
export const TreasuryCategory = {
  SYNDROMI: 'SYNDROMI',
  DOREA: 'DOREA',
  EKDILOSI: 'EKDILOSI',
  EPIXORIGISI: 'EPIXORIGISI',
  YLIKO: 'YLIKO',
  METAKINISI: 'METAKINISI',
  LEITOURGIKA: 'LEITOURGIKA',
  ALLO: 'ALLO',
  // Κατηγορίες δράσης (από το υπόδειγμα ταμείου κατασκήνωσης — βλ. docs/draseis.md F1).
  /** Έσοδο: συμμετοχές — μετριούνται από τις πληρωμές, όχι από κινήσεις. */
  SYMMETOXI: 'SYMMETOXI',
  /** Έξοδο: πρόγραμμα (γραφική ύλη, φωτοτυπίες, μαγαζάκι). */
  PROGRAMMA: 'PROGRAMMA',
  DIATROFI: 'DIATROFI',
  APROVLEPTA: 'APROVLEPTA',
} as const;
export type TreasuryCategory = (typeof TreasuryCategory)[keyof typeof TreasuryCategory];

/** Οι κατηγορίες του ταμείου ΜΙΑΣ ΔΡΑΣΗΣ — ένα φύλλο ανά κατηγορία εξόδων στην εξαγωγή. */
export const DRASI_INCOME_CATEGORIES: readonly TreasuryCategory[] = ['EPIXORIGISI', 'DOREA', 'ALLO'];
export const DRASI_EXPENSE_CATEGORIES: readonly TreasuryCategory[] = [
  'METAKINISI',
  'LEITOURGIKA',
  'PROGRAMMA',
  'DIATROFI',
  'APROVLEPTA',
  'ALLO',
];

/** Είδος συμμετοχής στο κόστος της δράσης. */
export const DrasiFeeKind = {
  PLIRIS: 'PLIRIS',
  MEIOMENI: 'MEIOMENI',
  STELEXOS: 'STELEXOS',
  DOREAN: 'DOREAN',
} as const;
export type DrasiFeeKind = (typeof DrasiFeeKind)[keyof typeof DrasiFeeKind];

/**
 * Λογαριασμός στελέχους μέσα στη δράση: το ταμείο του έδωσε μετρητά για αγορές
 * (προκαταβολή), το στέλεχος επέστρεψε ρέστα, ή το ταμείο του απέδωσε έξοδα
 * που πλήρωσε από την τσέπη. Βλ. docs/draseis.md F2.
 */
export const DrasiLedgerKind = {
  PROKATAVOLI: 'PROKATAVOLI',
  EPISTROFI: 'EPISTROFI',
  APODOSI: 'APODOSI',
} as const;
export type DrasiLedgerKind = (typeof DrasiLedgerKind)[keyof typeof DrasiLedgerKind];

/** Ποιες κατηγορίες προτείνονται ανά είδος κίνησης. */
export const TREASURY_INCOME_CATEGORIES: readonly TreasuryCategory[] = [
  'SYNDROMI',
  'DOREA',
  'EKDILOSI',
  'EPIXORIGISI',
  'ALLO',
];
export const TREASURY_EXPENSE_CATEGORIES: readonly TreasuryCategory[] = [
  'YLIKO',
  'EKDILOSI',
  'METAKINISI',
  'LEITOURGIKA',
  'ALLO',
];

/**
 * Η πορεία των μετρητών συνδρομών (4 στάδια):
 * εισπράχθηκε από στέλεχος → παραδόθηκε στον Τοπικό Έφορο → κατατέθηκε στην
 * τράπεζα → τακτοποιήθηκε/πληρώθηκε.
 */
export const PaymentHandlingStatus = {
  EISPRAXTHIKE: 'EISPRAXTHIKE',
  PARADOTHIKE: 'PARADOTHIKE',
  KATATETHIKE: 'KATATETHIKE',
  TAKTOPOIITHIKE: 'TAKTOPOIITHIKE',
} as const;
export type PaymentHandlingStatus =
  (typeof PaymentHandlingStatus)[keyof typeof PaymentHandlingStatus];

/** Η σειρά των σταδίων — για μπάρες προόδου και «επόμενο βήμα». */
export const PAYMENT_HANDLING_FLOW: readonly PaymentHandlingStatus[] = [
  'EISPRAXTHIKE',
  'PARADOTHIKE',
  'KATATETHIKE',
  'TAKTOPOIITHIKE',
];

/**
 * Μέχρι ποιο στάδιο προχωρά η πληρωμή ένας **διαχειριστής κλάδου**: είσπραξη και
 * παράδοση στον Τοπικό Έφορο. Την κατάθεση στην τράπεζα και την τακτοποίηση τις
 * κάνει ο Έφορος (υπερδιαχειριστής) από το Τοπικό.
 */
export const PAYMENT_HANDLING_KLADOS_STAGES: readonly PaymentHandlingStatus[] = [
  'EISPRAXTHIKE',
  'PARADOTHIKE',
];

/** Τρόπος πληρωμής συνδρομής. */
export const PaymentMethod = {
  CASH: 'CASH',
  BANK: 'BANK',
  ESEO: 'ESEO',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Από ποιον προέρχεται μια δωρεά. */
export const DonorType = {
  GONEAS: 'GONEAS',
  STELEXOS: 'STELEXOS',
  ALLO: 'ALLO',
} as const;
export type DonorType = (typeof DonorType)[keyof typeof DonorType];

/** Σκοπός αποθηκευμένου αρχείου (καθορίζει τα δικαιώματα πρόσβασης). */
export const FilePurpose = {
  RECEIPT: 'RECEIPT',
  /** Εικόνα ενσωματωμένη σε σημείωση Markdown (ατζέντες, πρακτικά…). */
  MARKDOWN: 'MARKDOWN',
} as const;
export type FilePurpose = (typeof FilePurpose)[keyof typeof FilePurpose];

/** Επιτρεπτοί τύποι αρχείων για αποδείξεις (εικόνα ή PDF). */
export const RECEIPT_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Επιτρεπτοί τύποι εικόνας για το Markdown (χωρίς PDF). */
export const MARKDOWN_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
];
export const MAX_MARKDOWN_IMAGE_BYTES = 5 * 1024 * 1024;

// ─────────────────────────── Ιδιότητες μέλους ───────────────────────────

/**
 * Η «ιδιότητα» ενός ατόμου στο μητρώο — παράγεται από το `OrgMemberDTO.type`
 * του e-SEO. Το e-SEO δίνει **μία κύρια** ιδιότητα ανά άτομο.
 *
 * Χαρτογράφηση e-SEO → ιδιότητα:
 *   STAR→ASTERI, BIRD→POULI, GUIDE|NAVY_GUIDE→ODIGOS,
 *   BIG_GUIDE|BIG_NAVY_GUIDE→MEGALOS_ODIGOS, ADULT_LEADER→STELEXOS,
 *   LOCAL_COUNCIL_MEMBER→TOPIKO_SYMVOULIO, COOP_GROUP_MEMBER→OMADA_SYNERGASIAS,
 *   CONFERENCE_MEMBER→SYNDIASKEPSI, FRIEND_OF_GUIDING→FILOS_ODIGISMOU.
 */
export const Idiotita = {
  ASTERI: 'ASTERI',
  POULI: 'POULI',
  ODIGOS: 'ODIGOS',
  MEGALOS_ODIGOS: 'MEGALOS_ODIGOS',
  STELEXOS: 'STELEXOS',
  TOPIKO_SYMVOULIO: 'TOPIKO_SYMVOULIO',
  OMADA_SYNERGASIAS: 'OMADA_SYNERGASIAS',
  SYNDIASKEPSI: 'SYNDIASKEPSI',
  FILOS_ODIGISMOU: 'FILOS_ODIGISMOU',
} as const;
export type Idiotita = (typeof Idiotita)[keyof typeof Idiotita];

/** Όλες οι ιδιότητες, με τη σειρά που δείχνονται στα φίλτρα. */
export const IDIOTITA_VALUES: readonly Idiotita[] = [
  'ASTERI',
  'POULI',
  'ODIGOS',
  'MEGALOS_ODIGOS',
  'STELEXOS',
  'TOPIKO_SYMVOULIO',
  'OMADA_SYNERGASIAS',
  'SYNDIASKEPSI',
  'FILOS_ODIGISMOU',
];
