/** Η φόρμα «Νέος φιλοξενούμενος» του διαλόγου συμμετεχόντων. */
export interface NewGuestForm {
  /** Το id του φιλοξενούμενου Τοπικού της δράσης. */
  topiko: string;
  firstName: string;
  lastName: string;
  kind: 'MELOS' | 'STELEXOS';
  /** Μόνο για παιδί, όπως και ο κηδεμόνας. */
  birthDate: string;
  guardianName: string;
  guardianPhone: string;
  /** Μόνο για στέλεχος: με email παίρνει πρόσβαση στη δράση. */
  email: string;
  phone: string;
}

/**
 * Πού πάει ο νέος φιλοξενούμενος, με μόνο τα πεδία της περίπτωσής του — το API
 * απορρίπτει άγνωστα πεδία, και ό,τι γράφτηκε πριν αλλάξει το «Παιδί/Στέλεχος»
 * δεν πρέπει να ταξιδέψει.
 *  - Παιδί: φιλοξενούμενος με κηδεμόνα.
 *  - Στέλεχος με email: εξωτερικό στέλεχος (όπως στο Αρχηγείο) — λογαριασμός για
 *    τη δράση, πρόσκληση για κωδικό, πρόσβαση με τον ρόλο που θα πάρει.
 *  - Στέλεχος χωρίς email: φιλοξενούμενος χωρίς πρόσβαση στην εφαρμογή.
 */
export function newGuestRequest(
  drasiId: string,
  form: NewGuestForm,
  topikoName: string,
): { external: boolean; url: string; body: Record<string, unknown> } {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();

  if (form.kind === 'STELEXOS') {
    const email = form.email.trim();
    const phone = form.phone.trim() || undefined;
    if (email) {
      return { external: true, url: `/draseis/${drasiId}/externals`, body: { firstName, lastName, email, phone, origin: topikoName } };
    }
    return { external: false, url: `/draseis/${drasiId}/guests`, body: { topikoName, firstName, lastName, kind: 'STELEXOS', phone } };
  }

  return {
    external: false,
    url: `/draseis/${drasiId}/guests`,
    body: {
      topikoName,
      firstName,
      lastName,
      kind: 'MELOS',
      birthDate: form.birthDate ? new Date(`${form.birthDate}T12:00:00`).toISOString() : undefined,
      guardianName: form.guardianName.trim() || undefined,
      guardianPhone: form.guardianPhone.trim() || undefined,
    },
  };
}
