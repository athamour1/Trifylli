import { guestTopikoKey, type DrasiExternalView, type DrasiGuestTopikoView, type DrasiRoleKind, type KladosType } from '@trifylli/shared';

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

/** Πρόχειρος έλεγχος πριν το API (που απαντά με αγγλικό μήνυμα του class-validator). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
