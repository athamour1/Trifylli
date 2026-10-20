import { describe, expect, it } from 'vitest';
import { guestTopikaErrors, guestTopikaPayload, toGuestTopikoForm, type GuestTopikoForm } from '../src/components/drasi/types';

const card = (over: Partial<GuestTopikoForm>): GuestTopikoForm => ({
  key: 'k',
  topikoName: '',
  kladoi: [],
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  contactPhone: '',
  contactHasAccount: false,
  ...over,
});

describe('guestTopikaErrors', () => {
  it('η κάρτα που δεν συμπληρώθηκε δεν εμποδίζει την αποθήκευση', () => {
    expect(guestTopikaErrors([card({})])).toEqual([null]);
  });

  it('κάρτα με στοιχεία αλλά χωρίς όνομα θέλει όνομα', () => {
    const [error] = guestTopikaErrors([card({ kladoi: ['ODIGOI'], topikoName: '  ' })]);
    expect(error).toEqual(expect.any(String));
  });

  it('το ίδιο Τοπικό δύο φορές: λάθος μόνο στη δεύτερη κάρτα', () => {
    const errors = guestTopikaErrors([
      card({ topikoName: 'Χαλάνδρι' }),
      card({ topikoName: 'ΧΑΛΑΝΔΡΙ ' }),
      card({ topikoName: 'Ελευσίνα' }),
    ]);
    expect(errors[0]).toBeNull();
    expect(errors[1]).toEqual(expect.any(String));
    expect(errors[2]).toBeNull();
  });
});

describe('υπεύθυνος Τοπικού', () => {
  it('μισός υπεύθυνος δεν αποθηκεύεται: θέλει επώνυμο και όνομα', () => {
    expect(guestTopikaErrors([card({ topikoName: 'Ελευσίνα', contactFirstName: 'Πηνελόπη' })])[0]).toMatch(/επώνυμο/);
    expect(guestTopikaErrors([card({ topikoName: 'Ελευσίνα', contactFirstName: 'Π', contactLastName: 'Γ', contactEmail: 'όχι-email' })])[0]).toMatch(/email/);
  });

  it('παλιά εγγραφή με μόνο «Όνομα Επώνυμο»: σπάει στα δύο πεδία', () => {
    const form = toGuestTopikoForm({ id: 'g', topikoName: 'ΤΤ Ελευσίνας', kladoi: [], contactName: 'Πηνελόπη Γιακοβάκη', contactPhone: null, contact: null });
    expect(form).toMatchObject({ contactFirstName: 'Πηνελόπη', contactLastName: 'Γιακοβάκη' });
  });
});

describe('guestTopikaPayload', () => {
  it('στέλνει μόνο τα πεδία του API — το κλειδί της κάρτας μένει στη φόρμα', () => {
    const payload = guestTopikaPayload([
      card({ key: 'a', id: 'a', topikoName: ' Χαλάνδρι ', kladoi: ['ODIGOI'], contactFirstName: ' Μαρία ', contactLastName: 'Π. ', contactPhone: '69 ' }),
      card({ key: 'new-1', topikoName: 'Ελευσίνα' }),
    ]);
    expect(payload).toEqual({
      items: [
        { id: 'a', topikoName: 'Χαλάνδρι', kladoi: ['ODIGOI'], contactFirstName: 'Μαρία', contactLastName: 'Π.', contactEmail: undefined, contactPhone: '69' },
        { topikoName: 'Ελευσίνα', kladoi: [], contactFirstName: undefined, contactLastName: undefined, contactEmail: undefined, contactPhone: undefined },
      ],
    });
    expect(Object.keys(payload.items[1]!)).not.toContain('id');
  });

  it('οι κάρτες που δεν συμπληρώθηκαν δεν στέλνονται', () => {
    expect(guestTopikaPayload([card({ key: 'new-1' }), card({ key: 'new-2', topikoName: 'Μαρούσι' })]).items).toEqual([
      { topikoName: 'Μαρούσι', kladoi: [], contactFirstName: undefined, contactLastName: undefined, contactEmail: undefined, contactPhone: undefined },
    ]);
  });
});
