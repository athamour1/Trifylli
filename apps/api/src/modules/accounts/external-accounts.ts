import type { ExternalAccountRow, KladosType } from '@trifylli/shared';

/** Ό,τι διαβάζει η λίστα του υπερδιαχειριστή για ένα εξωτερικό στέλεχος. */
export interface ExternalAccountSource {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  guestTopikoName: string | null;
  ssoId: string | null;
  lastLoginAt: Date | null;
  participations: {
    drasi: { id: string; title: string; status: string; archivedAt: Date | null; klados: { type: string } | null };
  }[];
}

/**
 * Ένα εξωτερικό στέλεχος για τη λίστα του υπερδιαχειριστή. Μια δράση που
 * έκλεισε ή αρχειοθετήθηκε μένει στη λίστα, αλλά όχι ως ανοιχτή: εκεί η
 * πρόσβασή του έχει ήδη λήξει μόνη της.
 */
export function toExternalAccountRow(u: ExternalAccountSource): ExternalAccountRow {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    origin: u.guestTopikoName,
    activated: !!u.ssoId,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    draseis: u.participations.map(({ drasi }) => ({
      id: drasi.id,
      title: drasi.title,
      klados: (drasi.klados?.type as KladosType | undefined) ?? null,
      open: drasi.status !== 'KLEISTI' && !drasi.archivedAt,
    })),
  };
}
