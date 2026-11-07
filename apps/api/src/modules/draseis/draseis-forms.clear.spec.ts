import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisFormsService } from './draseis-forms.service';

const DRASI = 'd-1';
const ME = { id: 'u-1', topikoId: 't-1' } as RequestUser;

function setup(status: string, signature = true) {
  const form: Record<string, unknown> = {
    id: 'f-1',
    drasiId: DRASI,
    type: 'YGEIA',
    status,
    data: { allergies: 'φιστίκια' },
    signerName: 'Μαρία Παπά',
    signerRole: 'GONEAS',
    signatureFileId: signature ? 'file-1' : null,
    signatureFile: signature ? { id: 'file-1', objectKey: 'sig/1' } : null,
    submittedAt: new Date('2026-11-01'),
  };
  const deletedObjects: string[] = [];
  const deletedFiles: string[] = [];
  const audited: string[] = [];
  const prisma = {
    drasiForm: {
      findFirst: async ({ where }: { where: { id: string } }) => (where.id === form.id ? form : null),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(form, data),
    },
    storedFile: { delete: async ({ where }: { where: { id: string } }) => void deletedFiles.push(where.id) },
  };
  const access = { load: async () => ({ id: DRASI }) };
  const storage = { delete: async (key: string) => void deletedObjects.push(key) };
  const audit = { record: async (_user: unknown, action: string) => void audited.push(action) };
  const service = new DraseisFormsService(
    prisma as never,
    access as never,
    storage as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, form, deletedObjects, deletedFiles, audited };
}

describe('έντυπα: καθαρισμός συμπληρωμένου', () => {
  it('σβήνουν απαντήσεις, υπογράφων και υπογραφή — και γυρίζει στο «Δεν στάλθηκε»', async () => {
    const { service, form, deletedObjects, deletedFiles, audited } = setup('SUBMITTED');

    await expect(service.clear(ME, DRASI, 'f-1')).resolves.toEqual({ cleared: true });

    expect(form).toMatchObject({
      status: 'PENDING',
      data: Prisma.DbNull,
      signerName: null,
      signerRole: null,
      signatureFileId: null,
      submittedAt: null,
      tokenHash: null,
      sentAt: null,
    });
    expect(deletedObjects).toEqual(['sig/1']);
    expect(deletedFiles).toEqual(['file-1']);
    expect(audited).toEqual(['drasi.form.clear']);
  });

  it('χωρίς υπογραφή: δεν σβήνει αρχείο', async () => {
    const { service, deletedObjects } = setup('SUBMITTED', false);
    await service.clear(ME, DRASI, 'f-1');
    expect(deletedObjects).toEqual([]);
  });

  it('μόνο συμπληρωμένο — όχι ένα που περιμένει απάντηση', async () => {
    for (const status of ['PENDING', 'SENT', 'OPENED', 'VOID']) {
      const { service, form } = setup(status);
      await expect(service.clear(ME, DRASI, 'f-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(form.status).toBe(status);
    }
  });

  it('έντυπο άλλης δράσης ή ανύπαρκτο: δεν βρέθηκε', async () => {
    const { service } = setup('SUBMITTED');
    await expect(service.clear(ME, DRASI, 'f-other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
