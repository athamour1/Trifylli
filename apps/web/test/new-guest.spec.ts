import { describe, expect, it } from 'vitest';
import { newGuestRequest, type NewGuestForm } from '../src/components/drasi/new-guest';

const form = (over: Partial<NewGuestForm>): NewGuestForm => ({
  topiko: 't1',
  firstName: ' Μαρία ',
  lastName: ' Παππά ',
  kind: 'MELOS',
  birthDate: '',
  guardianName: '',
  guardianPhone: '',
  email: '',
  phone: '',
  ...over,
});

describe('newGuestRequest', () => {
  it('παιδί: φιλοξενούμενος με κηδεμόνα και ημερομηνία γέννησης', () => {
    const r = newGuestRequest('d1', form({ birthDate: '2015-03-02', guardianName: 'Ελένη', guardianPhone: '69 ' }), 'Ελευσίνα');
    expect(r).toEqual({
      external: false,
      url: '/draseis/d1/guests',
      body: {
        topikoName: 'Ελευσίνα',
        firstName: 'Μαρία',
        lastName: 'Παππά',
        kind: 'MELOS',
        birthDate: new Date('2015-03-02T12:00:00').toISOString(),
        guardianName: 'Ελένη',
        guardianPhone: '69',
      },
    });
  });

  it('στέλεχος με email: εξωτερικό στέλεχος — μόνο τα πεδία που δέχεται το endpoint', () => {
    const r = newGuestRequest('d1', form({ kind: 'STELEXOS', email: ' maria@example.gr ', phone: '6900000000' }), 'Ελευσίνα');
    expect(r).toEqual({
      external: true,
      url: '/draseis/d1/externals',
      body: { firstName: 'Μαρία', lastName: 'Παππά', email: 'maria@example.gr', phone: '6900000000', origin: 'Ελευσίνα' },
    });
  });

  it('στέλεχος χωρίς email: φιλοξενούμενος χωρίς πρόσβαση, με το δικό του τηλέφωνο', () => {
    const r = newGuestRequest('d1', form({ kind: 'STELEXOS', phone: '6900000000' }), 'Ελευσίνα');
    expect(r).toEqual({
      external: false,
      url: '/draseis/d1/guests',
      body: { topikoName: 'Ελευσίνα', firstName: 'Μαρία', lastName: 'Παππά', kind: 'STELEXOS', phone: '6900000000' },
    });
  });

  it('ό,τι γράφτηκε πριν αλλάξει το «Παιδί/Στέλεχος» δεν στέλνεται', () => {
    const stelexos = newGuestRequest('d1', form({ kind: 'STELEXOS', guardianName: 'Ελένη', guardianPhone: '69', birthDate: '2015-03-02' }), 'Ελευσίνα');
    expect(stelexos.body).not.toHaveProperty('guardianName');
    expect(stelexos.body).not.toHaveProperty('guardianPhone');
    expect(stelexos.body).not.toHaveProperty('birthDate');

    const paidi = newGuestRequest('d1', form({ kind: 'MELOS', email: 'maria@example.gr', phone: '6900000000' }), 'Ελευσίνα');
    expect(paidi.url).toBe('/draseis/d1/guests');
    expect(paidi.body).not.toHaveProperty('email');
    expect(paidi.body).not.toHaveProperty('phone');
  });
});
