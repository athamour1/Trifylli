import {
  guestTopikoKey,
  type DrasiExternalView,
  type DrasiGuestTopikoView,
  type DrasiRoleKind,
  type DrasiScheduleKind,
  type KladosType,
} from '@trifylli/shared';

/** Φιλοξενούμενο Τοπικό όπως το κρατά η φόρμα (wizard & ρυθμίσεις). */
export interface GuestTopikoForm {
  /** Σταθερό κλειδί της κάρτας στη λίστα — μένει στη φόρμα, δεν στέλνεται. */
  key: string;
  /** Μόνο όσα είναι ήδη αποθηκευμένα: με αυτό η μετονομασία κρατά το ίδιο Τοπικό. */
  id?: string;
  topikoName: string;
  kladoi: KladosType[];
  contactName: string;
  contactPhone: string;
}

let newCards = 0;

export function emptyGuestTopiko(): GuestTopikoForm {
  newCards += 1;
  return { key: `new-${newCards}`, topikoName: '', kladoi: [], contactName: '', contactPhone: '' };
}

export function toGuestTopikoForm(g: DrasiGuestTopikoView): GuestTopikoForm {
  return {
    key: g.id,
    id: g.id,
    topikoName: g.topikoName,
    kladoi: [...g.kladoi],
    contactName: g.contactName ?? '',
    contactPhone: g.contactPhone ?? '',
  };
}

/** Κάρτα που δεν συμπληρώθηκε καθόλου — δεν μετράει. */
function isBlank(g: GuestTopikoForm): boolean {
  return !g.topikoName.trim() && !g.contactName.trim() && !g.contactPhone.trim() && g.kladoi.length === 0;
}

/** Ανά κάρτα, τι εμποδίζει την αποθήκευση: όνομα που λείπει ή Τοπικό που υπάρχει ήδη πιο πάνω. */
export function guestTopikaErrors(list: readonly GuestTopikoForm[]): (string | null)[] {
  const seen = new Set<string>();
  return list.map((g) => {
    if (isBlank(g)) return null;
    if (!g.topikoName.trim()) return 'Γράψε το όνομα του Τοπικού.';
    const key = guestTopikoKey(g.topikoName);
    if (seen.has(key)) return 'Αυτό το Τοπικό υπάρχει ήδη πιο πάνω.';
    seen.add(key);
    return null;
  });
}

/** Το σώμα του `PUT /draseis/:id/guest-topika` — το API αντικαθιστά το σύνολο. */
export function guestTopikaPayload(list: readonly GuestTopikoForm[]) {
  return {
    items: list
      .filter((g) => !isBlank(g))
      .map((g) => ({
        ...(g.id ? { id: g.id } : {}),
        topikoName: g.topikoName.trim(),
        kladoi: g.kladoi,
        contactName: g.contactName.trim() || undefined,
        contactPhone: g.contactPhone.trim() || undefined,
      })),
  };
}

/** Ευθύνες ανά είδος: ποια στελέχη (ids) έχουν την καθεμία. */
export type RolesMap = Record<DrasiRoleKind, string[]>;

export function emptyRoles(kinds: readonly DrasiRoleKind[]): RolesMap {
  return Object.fromEntries(kinds.map((k) => [k, [] as string[]])) as RolesMap;
}

/** Εξωτερικό στέλεχος ως επιλογή σε ρόλους/υπηρεσίες — όσοι δεν έχουν λογαριασμό το γράφουν. */
export function externalStelexosOption(e: DrasiExternalView): { label: string; value: string; caption: string } {
  const kind = e.account ? 'Εξωτερικό' : 'Χωρίς πρόσβαση';
  return { label: `${e.lastName} ${e.firstName}`.trim(), value: e.userId, caption: e.origin ? `${kind} · ${e.origin}` : kind };
}

interface NamedPerson {
  id: string;
  firstName: string;
  lastName: string;
}

interface RoleOption {
  label: string;
  value: string;
  caption: string;
}

/**
 * Οι επιλογές για το αρχηγείο μιας δράσης: μόνο τα στελέχη που συμμετέχουν
 * (δικά μας, φιλοξενούμενα, εξωτερικά). Όσοι έχουν ήδη ρόλο χωρίς να συμμετέχουν
 * (από πριν ισχύσει ο κανόνας, ή βγήκαν από τους συμμετέχοντες) έρχονται χωριστά:
 * φαίνονται μόνο στον ρόλο τους, για να βγουν.
 */
export function drasiRoleOptions(
  stelexi: readonly NamedPerson[],
  holders: readonly NamedPerson[],
  captionOf: (id: string) => string = () => '',
): { options: RoleOption[]; outsiders: RoleOption[] } {
  const label = (p: NamedPerson) => `${p.lastName} ${p.firstName}`.trim();
  const inDrasi = new Set(stelexi.map((s) => s.id));
  const options = [...stelexi]
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'el') || a.firstName.localeCompare(b.firstName, 'el'))
    .map((s) => ({ label: label(s), value: s.id, caption: captionOf(s.id) }));
  const outsiders = new Map<string, RoleOption>();
  for (const h of holders) {
    if (!inDrasi.has(h.id)) outsiders.set(h.id, { label: label(h), value: h.id, caption: 'Δεν είναι στους συμμετέχοντες' });
  }
  return { options, outsiders: [...outsiders.values()] };
}

/** Πρόχειρος έλεγχος πριν το API (που απαντά με αγγλικό μήνυμα του class-validator). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Η ετικέτα των υπευθύνων ενός στοιχείου: «Υπεύθυνος» για έναν (ή όσο δεν έχει οριστεί κανείς), «Υπεύθυνοι» από δύο και πάνω. */
export function responsiblesLabel(count: number): string {
  return count > 1 ? 'Υπεύθυνοι' : 'Υπεύθυνος';
}

/**
 * Η λεζάντα κάτω από τον τίτλο ενός στοιχείου του ωρολογίου: είδος · τόπος · υπεύθυνοι.
 * Στο κινητό (`compact`) χωρά λίγο: το είδος μένει έξω — το λέει ήδη το
 * εικονίδιο — και τα ονόματα μπαίνουν χωρίς το «υπεύθυνος:».
 */
export function scheduleCaption(item: { kindLabel: string; location: string | null; responsibles: string[] }, compact: boolean): string {
  const names = item.responsibles.join(', ');
  const who = !names ? null : compact ? names : `${responsiblesLabel(item.responsibles.length).toLocaleLowerCase('el')}: ${names}`;
  return [compact ? null : item.kindLabel, item.location, who].filter(Boolean).join(' · ');
}

/** Το εικονίδιο κάθε είδους στοιχείου του ωρολογίου — ίδιο στο ωρολόγιο, στο προγραμματικό και στο kanban. */
export const SCHEDULE_KIND_ICON: Record<DrasiScheduleKind, string> = {
  DRASTIRIOTITA: 'hiking',
  GEVMA: 'restaurant',
  XEKOURASI: 'bedtime',
  METAKINISI: 'directions_bus',
  TELETI: 'flag',
  YPIRESIA: 'cleaning_services',
  ALLO: 'more_horiz',
};
export const SCHEDULE_KIND_COLOR: Record<DrasiScheduleKind, string> = {
  DRASTIRIOTITA: 'klados',
  GEVMA: 'orange-7',
  XEKOURASI: 'indigo-4',
  METAKINISI: 'blue-grey-6',
  TELETI: 'red-6',
  YPIRESIA: 'teal-6',
  ALLO: 'grey-6',
};
