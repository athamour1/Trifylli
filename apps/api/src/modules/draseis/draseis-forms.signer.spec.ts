import { BadRequestException } from '@nestjs/common';
import { DRASI_FORM_FIELDS } from '@trifylli/shared';
import { describe, expect, it } from 'vitest';
import { DraseisFormsService } from './draseis-forms.service';

const TOKEN = 'a'.repeat(43);

/** Δήλωση συμμετοχής ανήλικου παιδιού· στο μητρώο η μητέρα έχει μόνο μικρό όνομα. */
function setup() {
  const form = {
    id: 'f-1',
    drasiId: 'd-1',
    type: 'SYMMETOXI',
    status: 'SENT',
    expiresAt: new Date(Date.now() + 86_400_000),
    drasi: { title: 'Κατασκήνωση', dateStart: new Date('2027-07-05'), dateEnd: new Date('2027-07-12'), location: null, topikoId: 't-1', kladosId: null, topiko: { name: 'Μέγαρα' }, klados: null },
    participant: {
      kind: 'MELOS',
      user: { firstName: 'Ελένη', lastName: 'Παπά', birthDate: new Date('2015-03-01'), eseoId: null, street: null, postalCode: null, city: null, area: null, guardians: [{ fullName: 'Μαρία', kind: 'MOTHER' }] },
    },
  };
  const updates: Record<string, unknown>[] = [];
  const prisma = {
    drasiForm: {
      findUnique: async () => form,
      update: async ({ data }: { data: Record<string, unknown> }) => void updates.push(data),
    },
  };
  const collab = { broadcast: () => undefined };
  const service = new DraseisFormsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, collab as never);
  // Κάθε πεδίο με έγκυρη τιμή — εδώ μετράει μόνο ο υπογράφων.
  const answers: Record<string, string | boolean> = {};
  for (const f of DRASI_FORM_FIELDS.SYMMETOXI) answers[f.key] = f.kind === 'yesno' ? true : f.kind === 'select' ? f.options![0]! : 'x';
  answers.consent = true;
  return { service, updates, answers };
}

describe('υπογράφων στα έντυπα', () => {
  it('το μητρώο δίνει το όνομα όπως είναι — όχι με το επώνυμο του παιδιού', async () => {
    const { service } = setup();
    const view = await service.open(TOKEN, undefined);
    expect(view.signers).toEqual([{ name: 'Μαρία', role: 'GONEAS' }]);
  });

  it('ο γονέας γράφει το δικό του ονοματεπώνυμο: γίνεται δεκτό, ιδιότητα από τη φόρμα', async () => {
    const { service, updates, answers } = setup();
    await service.submit(TOKEN, { answers, signerName: '  Μαρία   Γεωργίου ', signerRole: 'GONEAS', consent: true } as never, undefined);
    expect(updates.at(-1)).toMatchObject({ status: 'SUBMITTED', signerName: 'Μαρία Γεωργίου', signerRole: 'GONEAS' });
  });

  it('όνομα του μητρώου: η ιδιότητα έρχεται από το μητρώο', async () => {
    const { service, updates, answers } = setup();
    await service.submit(TOKEN, { answers, signerName: 'Μαρία', signerRole: 'KIDEMONAS', consent: true } as never, undefined);
    expect(updates.at(-1)).toMatchObject({ signerName: 'Μαρία', signerRole: 'GONEAS' });
  });

  it('κενό όνομα ή «ο ίδιος» για ανήλικο: απορρίπτεται', async () => {
    const { service, answers } = setup();
    await expect(service.submit(TOKEN, { answers, signerName: '   ', signerRole: 'GONEAS', consent: true } as never, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submit(TOKEN, { answers, signerName: 'Ελένη Παπά', signerRole: 'IDIOS', consent: true } as never, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
