import { describe, expect, it } from 'vitest';
import { guestTopikaErrors, guestTopikaPayload, type GuestTopikoForm } from '../src/components/drasi/types';

const card = (over: Partial<GuestTopikoForm>): GuestTopikoForm => ({
  key: 'k',
  topikoName: '',
  kladoi: [],
  contactName: '',
  contactPhone: '',
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

describe('guestTopikaPayload', () => {
  it('στέλνει μόνο τα πεδία του API — το κλειδί της κάρτας μένει στη φόρμα', () => {
    const payload = guestTopikaPayload([
      card({ key: 'a', id: 'a', topikoName: ' Χαλάνδρι ', kladoi: ['ODIGOI'], contactName: ' Μαρία ', contactPhone: '69 ' }),
      card({ key: 'new-1', topikoName: 'Ελευσίνα' }),
    ]);
    expect(payload).toEqual({
      items: [
        { id: 'a', topikoName: 'Χαλάνδρι', kladoi: ['ODIGOI'], contactName: 'Μαρία', contactPhone: '69' },
        { topikoName: 'Ελευσίνα', kladoi: [], contactName: undefined, contactPhone: undefined },
      ],
    });
    expect(Object.keys(payload.items[1]!)).not.toContain('id');
  });

  it('οι κάρτες που δεν συμπληρώθηκαν δεν στέλνονται', () => {
    expect(guestTopikaPayload([card({ key: 'new-1' }), card({ key: 'new-2', topikoName: 'Μαρούσι' })]).items).toEqual([
      { topikoName: 'Μαρούσι', kladoi: [], contactName: undefined, contactPhone: undefined },
    ]);
  });
});
