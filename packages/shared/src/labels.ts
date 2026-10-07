/** Ελληνικές ετικέτες για τα enums του `domain.ts` — μοναδική πηγή αλήθειας για το UI. */
import {
  AccountRole,
  CheckoutStatus,
  DrasiFeeKind,
  DrasiGroupKind,
  DrasiLedgerKind,
  DrasiRoleKind,
  DrasiStatus,
  DrasiType,
  KladosType,
  MemberKind,
  MemberStatus,
  ParousiaStatus,
  ProodosEntryKind,
  ProodosStatus,
  SymvoulioType,
  SyndromiStatus,
  TimelineSection,
  YlikoCategory,
} from './domain';

export const KLADOS_LABEL: Record<KladosType, string> = {
  ASTERIA: 'Αστέρια',
  POULIA: 'Πουλιά',
  ODIGOI: 'Οδηγοί',
  MEGALOI_ODIGOI: 'Μεγάλοι Οδηγοί',
};

/** Γενική τη γενική — για φράσεις όπως «Διαχειριστής Πουλιών». */
export const KLADOS_LABEL_GENITIVE: Record<KladosType, string> = {
  ASTERIA: 'Αστεριών',
  POULIA: 'Πουλιών',
  ODIGOI: 'Οδηγών',
  MEGALOI_ODIGOI: 'Μεγάλων Οδηγών',
};

export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  SUPER_ADMIN: 'Υπερδιαχειριστής',
  KLADOS_ADMIN: 'Διαχειριστής Κλάδου',
};

/**
 * Ο ρόλος όπως τον λέει κανείς στην πράξη: «Διαχειριστής Πουλιών», όχι
 * «Διαχειριστής Κλάδου (ΠΟΥΛΙΑ)».
 */
export function accountRoleLabel(role: AccountRole, klados: KladosType | null): string {
  if (role === AccountRole.SUPER_ADMIN) return ACCOUNT_ROLE_LABEL.SUPER_ADMIN;
  return klados ? `Διαχειριστής ${KLADOS_LABEL_GENITIVE[klados]}` : ACCOUNT_ROLE_LABEL.KLADOS_ADMIN;
}

export const MEMBER_KIND_LABEL: Record<MemberKind, string> = {
  MELOS: 'Μέλος',
  STELEXOS: 'Στέλεχος',
};

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ENERGO: 'Ενεργό',
  ANENERGO: 'Ανενεργό',
  APOCHOROISE: 'Αποχώρησε',
};

export const MAINTENANCE_KIND_LABEL: Record<string, string> = {
  DAMAGE: 'Βλάβη/Φθορά',
  REPAIR: 'Επιδιόρθωση',
};

export const RETURN_CONDITION_LABEL: Record<string, string> = {
  KALI: 'Καλή',
  FTHORA: 'Φθορά',
  VLAVI: 'Βλάβη',
  APOLEIA: 'Απώλεια',
};

export const YLIKO_CATEGORY_LABEL: Record<YlikoCategory, string> = {
  LEITOURGIKO: 'Λειτουργικό',
  PROGRAMMATIKO: 'Προγραμματιστικό',
  FARMAKEIO: 'Φαρμακείο',
};

export const DRASI_TYPE_LABEL: Record<DrasiType, string> = {
  MONOIMERI: 'Μονοήμερη',
  POLYIMERI: 'Πολυήμερη',
  KATASKINOSI: 'Κατασκήνωση',
};

export const DRASI_STATUS_LABEL: Record<DrasiStatus, string> = {
  PROSXEDIO: 'Προσχέδιο',
  ENERGI: 'Ενεργή',
  KLEISTI: 'Κλειστή',
};

export const DRASI_ROLE_LABEL: Record<DrasiRoleKind, string> = {
  ARXIGOS: 'Αρχηγός',
  PROGRAMMA: 'Πρόγραμμα',
  LEITOURGIA: 'Λειτουργία',
  TAMIAS: 'Ταμίας',
  TROFODOSIA: 'Τροφοδοσία',
  MAGEIRISSA: 'Μαγείρισσα',
  EXORAISMOS: 'Εξωραϊσμός',
  PIATA: 'Πλύσιμο πιάτων',
  MAGEIREMA: 'Μαγείρεμα',
  SERVIRISMA: 'Σερβίρισμα',
  KATHARIOTITA: 'Καθαριότητα',
  FARMAKEIO: 'Φαρμακείο',
  SOS: 'SOS',
};

export const SYMVOULIO_TYPE_LABEL: Record<SymvoulioType, string> = {
  KLADOU: 'Συμβούλιο Κλάδου',
  TOPIKOU: 'Συμβούλιο Τοπικού',
  STELEXON: 'Συμβούλιο Στελεχών',
};

export const PAROUSIA_LABEL: Record<ParousiaStatus, string> = {
  PAROUSIA: 'Παρών/ούσα',
  APOUSIA: 'Απών/ούσα',
  DIKAIOLOGIMENI: 'Δικαιολογημένη απουσία',
  ARGOPORIA: 'Αργοπορία',
};

export const TIMELINE_SECTION_LABEL: Record<TimelineSection, string> = {
  ANOIGMA: 'Άνοιγμα',
  KYRIO_MEROS: 'Κύριο Μέρος',
  KLEISIMO: 'Κλείσιμο',
};

export const CHECKOUT_STATUS_LABEL: Record<CheckoutStatus, string> = {
  DESMEFSI: 'Δέσμευση',
  PARALAVI: 'Παραλήφθηκε',
  EPISTROFI: 'Επιστράφηκε',
  AKYROSI: 'Ακυρώθηκε',
};

export const SYNDROMI_STATUS_LABEL: Record<SyndromiStatus, string> = {
  PLIROMENI: 'Πληρωμένη',
  MERIKI: 'Μερική καταβολή',
  EKKREMI: 'Εκκρεμεί',
  APALLAGI: 'Απαλλαγή',
};

export const PROODOS_STATUS_LABEL: Record<ProodosStatus, string> = {
  DEN_XEKINISE: 'Δεν ξεκίνησε',
  SE_EXELIXI: 'Σε εξέλιξη',
  OLOKLIROMENO: 'Ολοκληρωμένο',
};

export const PROODOS_ENTRY_KIND_LABEL: Record<ProodosEntryKind, string> = {
  YPOSCHESI: 'Υπόσχεση',
  MONOPATI: 'Μονοπάτι',
  PTYCHIO: 'Πτυχίο',
  PTYCHIO_ODIGISMOU: 'Πτυχίο Οδηγισμού',
};

/** Ετικέτες Κορυφών κατά σειρά (Α΄, Β΄, Γ΄). */
export const KORUFI_LABELS = ['Α΄ Κορυφή', 'Β΄ Κορυφή', 'Γ΄ Κορυφή'] as const;

/** Ετικέτες στοιχείων Καρτέλας Μεγάλων Οδηγών. */
export const MO_ENTRY_KIND_LABEL: Record<string, string> = {
  YPOSCHESI: 'Υπόσχεση',
  PROSANATOLISMOS: 'Προσανατολισμός',
  EIDIKEFSI: 'Ειδίκευση',
  YPEFTHYNOTITA: 'Υπευθυνότητα',
  EPITROPI: 'Επιτροπή',
};
/** Οι δύο πυξίδες των Μεγάλων Οδηγών, κατά σειρά. */
export const PYXIDES_LABELS = ['Ασημένια Πυξίδα', 'Χρυσή Πυξίδα'] as const;

/** Ετικέτες στοιχείων Καρτέλας Πουλιών. */
export const POULIA_ENTRY_KIND_LABEL: Record<string, string> = {
  YPOSCHESI: 'Υπόσχεση',
  VIMA: 'Βήμα',
  VIMA_KK: 'Βήμα Κίτρινου Κόμπου',
  PTYCHIO: 'Πτυχίο',
};
/** Τα δύο Φτερά των Πουλιών, κατά σειρά. */
export const FTERA_LABELS = ['1ο Φτερό', '2ο Φτερό'] as const;

/** Ετικέτες στοιχείων Καρτέλας Αστεριών. */
export const ASTERI_ENTRY_KIND_LABEL: Record<string, string> = {
  YPOSCHESI: 'Υπόσχεση',
  AKTINA: 'Δραστηριότητα ακτίνας',
  PTYCHIO: 'Πτυχίο',
};

/** Βοηθός για q-select options: `[{ value, label }]`. */
export function toOptions<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

// ─────────────────────────── Ταμείο & οικονομικά ───────────────────────────

export const TREASURY_ENTRY_KIND_LABEL: Record<string, string> = {
  INCOME: 'Έσοδο',
  EXPENSE: 'Έξοδο',
};

export const TREASURY_CATEGORY_LABEL: Record<string, string> = {
  SYNDROMI: 'Συνδρομές',
  DOREA: 'Δωρεά',
  EKDILOSI: 'Εκδήλωση',
  EPIXORIGISI: 'Επιχορήγηση',
  YLIKO: 'Υλικό',
  METAKINISI: 'Μετακίνηση',
  LEITOURGIKA: 'Λειτουργικά',
  ALLO: 'Άλλο',
  SYMMETOXI: 'Συμμετοχές',
  PROGRAMMA: 'Πρόγραμμα',
  DIATROFI: 'Διατροφή',
  APROVLEPTA: 'Απρόβλεπτα',
};

export const DRASI_FEE_KIND_LABEL: Record<DrasiFeeKind, string> = {
  PLIRIS: 'Πλήρης',
  MEIOMENI: 'Μειωμένη',
  STELEXOS: 'Στέλεχος',
  DOREAN: 'Δωρεάν',
};

export const DRASI_GROUP_KIND_LABEL: Record<DrasiGroupKind, string> = {
  PENTADA: 'Πεντάδα',
  FOLIA: 'Φωλιά',
  ENOMOTIA: 'Ενωμοτία',
  SKINI: 'Σκηνή',
  ALLO: 'Ομάδα',
};
export const DRASI_GROUP_KIND_PLURAL: Record<DrasiGroupKind, string> = {
  PENTADA: 'Πεντάδες',
  FOLIA: 'Φωλιές',
  ENOMOTIA: 'Ενωμοτίες',
  SKINI: 'Σκηνές',
  ALLO: 'Ομάδες',
};

export const DRASI_LEDGER_KIND_LABEL: Record<DrasiLedgerKind, string> = {
  PROKATAVOLI: 'Προκαταβολή από το ταμείο',
  EPISTROFI: 'Επιστροφή στο ταμείο',
  APODOSI: 'Απόδοση εξόδων στο στέλεχος',
};

export const PAYMENT_HANDLING_LABEL: Record<string, string> = {
  EISPRAXTHIKE: 'Εισπράχθηκε',
  PARADOTHIKE: 'Παραδόθηκε στον Τοπ. Έφορο',
  KATATETHIKE: 'Κατατέθηκε στην τράπεζα',
  TAKTOPOIITHIKE: 'Τακτοποιήθηκε',
};

/** Σύντομες ετικέτες για μπάρες/chips. */
export const PAYMENT_HANDLING_SHORT: Record<string, string> = {
  EISPRAXTHIKE: 'Είσπραξη',
  PARADOTHIKE: 'Παράδοση',
  KATATETHIKE: 'Κατάθεση',
  TAKTOPOIITHIKE: 'Τακτοπ.',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Μετρητά',
  BANK: 'Τράπεζα',
  ESEO: 'e-SEO',
};

export const DONOR_TYPE_LABEL: Record<string, string> = {
  GONEAS: 'Γονέας',
  STELEXOS: 'Στέλεχος',
  ALLO: 'Άλλο',
};

// ─────────────────────────── Ιδιότητες μέλους ───────────────────────────

export const IDIOTITA_LABEL: Record<string, string> = {
  ASTERI: 'Αστέρι',
  POULI: 'Πουλί',
  ODIGOS: 'Οδηγός',
  MEGALOS_ODIGOS: 'Μεγάλος Οδηγός',
  STELEXOS: 'Στέλεχος',
  TOPIKO_SYMVOULIO: 'Τοπικό Συμβούλιο',
  OMADA_SYNERGASIAS: 'Ομάδα Συνεργασίας',
  SYNDIASKEPSI: 'Μέλος Συνδιάσκεψης',
  FILOS_ODIGISMOU: 'Φίλος του Οδηγισμού',
};
