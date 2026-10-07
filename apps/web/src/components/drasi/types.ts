import type { DrasiRoleKind, KladosType } from '@trifylli/shared';

/** Φιλοξενούμενο Τοπικό όπως το κρατά η φόρμα (wizard & ρυθμίσεις). */
export interface GuestTopikoForm {
  topikoCode: string;
  topikoName: string;
  kladoi: KladosType[];
  contactName: string;
  contactPhone: string;
}

/** Ευθύνες ανά είδος: ποια στελέχη (ids) έχουν την καθεμία. */
export type RolesMap = Record<DrasiRoleKind, string[]>;

export function emptyRoles(kinds: readonly DrasiRoleKind[]): RolesMap {
  return Object.fromEntries(kinds.map((k) => [k, [] as string[]])) as RolesMap;
}
