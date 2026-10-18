import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { drasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DraseisFormsService } from './draseis-forms.service';

const DRASI = 'd-1';

/** Ο χρήστης όπως τον αφήνει ο `DrasiPermGuard`: με τα δικαιώματά του στη δράση. */
function staff(roles: DrasiRoleKind[] = []): RequestUser {
  return {
    id: 'u-1',
    topikoId: 't-1',
    drasiGrant: { drasiId: DRASI, access: drasiAccess({ full: false, staff: true, roles }) },
  } as unknown as RequestUser;
}

function setup(type: 'YGEIA' | 'SYMMETOXI') {
  const form = {
    id: 'f-1',
    drasiId: DRASI,
    participantId: 'p-1',
    type,
    status: 'SUBMITTED',
    data: { allergies: 'φιστίκια' },
    signerName: 'Μαρία Παπά',
    signerRole: 'GONEAS',
    signatureFileId: null,
    submittedIp: null,
    sentAt: null,
    expiresAt: null,
    submittedAt: new Date('2026-11-01'),
    purgedAt: null,
    participant: { user: { firstName: 'Ελένη', lastName: 'Παπά' } },
  };
  const audited: string[] = [];
  const prisma = { drasiForm: { findFirst: async () => form, findMany: async () => [form] } };
  const access = { load: async () => ({ id: DRASI, title: 'Κατασκήνωση', dateStart: new Date('2026-11-14') }) };
  const audit = { record: async (_user: unknown, action: string) => void audited.push(action) };
  const service = new DraseisFormsService(prisma as never, access as never, {} as never, audit as never, {} as never, {} as never, {} as never);
  return { service, audited };
}

describe('έντυπα υγείας: μόνο αρχηγός, Τοπικό και φαρμακείο (F6)', () => {
  it('στέλεχος χωρίς ρόλο δεν ανοίγει το πιστοποιητικό υγείας', async () => {
    const { service, audited } = setup('YGEIA');
    await expect(service.view(staff(), DRASI, 'f-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(audited).toEqual([]);
  });

  it('ούτε η Λειτουργία, που εκδίδει τους συνδέσμους', async () => {
    const { service } = setup('YGEIA');
    await expect(service.view(staff(['LEITOURGIA']), DRASI, 'f-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ο ρόλος Φαρμακείο και ο Αρχηγός το ανοίγουν — και καταγράφεται', async () => {
    for (const role of ['FARMAKEIO', 'ARXIGOS'] as const) {
      const { service, audited } = setup('YGEIA');
      await expect(service.view(staff([role]), DRASI, 'f-1')).resolves.toMatchObject({ data: { allergies: 'φιστίκια' } });
      expect(audited).toEqual(['drasi.health.read']);
    }
  });

  it('η δήλωση συμμετοχής μένει ανοιχτή σε κάθε στέλεχος', async () => {
    const { service } = setup('SYMMETOXI');
    await expect(service.view(staff(), DRASI, 'f-1')).resolves.toMatchObject({ type: 'SYMMETOXI' });
  });

  it('ούτε το PDF ενός πιστοποιητικού ούτε όλα μαζί για στέλεχος χωρίς ρόλο', async () => {
    const { service } = setup('YGEIA');
    await expect(service.pdf(staff(), DRASI, 'f-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.pdfAll(staff(), DRASI, 'YGEIA' as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
