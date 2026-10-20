import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { drasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DraseisDiatrofologioService } from './draseis-diatrofologio.service';

const DRASI = '00000000-0000-4000-8000-000000000001';

function staff(roles: DrasiRoleKind[] = []): RequestUser {
  return {
    id: 'u-1',
    topikoId: 't-1',
    drasiGrant: { drasiId: DRASI, access: drasiAccess({ full: false, staff: true, roles }) },
  } as unknown as RequestUser;
}

const form = (participantId: string, lastName: string, data: Record<string, unknown>) => ({
  participantId,
  data,
  participant: { user: { firstName: 'Μαρία', lastName, memberships: [] }, groups: [] },
});

function setup() {
  const forms = [
    form('p-1', 'Αλφα', { allergies: true, allergiesDetails: 'φυστίκια', diet: false }),
    form('p-2', 'Βήτα', { allergies: false, diet: false }),
    form('p-3', 'Γάμμα', { allergies: true, allergiesDetails: '  ' }),
  ];
  const prisma = {
    drasiParticipant: { count: async () => 5 },
    drasiForm: { findMany: async () => forms },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new DraseisDiatrofologioService(prisma as never, {} as never, {} as never, audit as never, {} as never);
  return { service, audit };
}

describe('αλλεργίες & διατροφή (F16)', () => {
  it('απλό στέλεχος χωρίς ρόλο: απαγορεύεται και δεν καταγράφεται ανάγνωση', async () => {
    const { service, audit } = setup();
    await expect(service.foodNeeds(staff(), DRASI)).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('η μαγείρισσα βλέπει και η ανάγνωση καταγράφεται μία φορά με το πλήθος δηλώσεων', async () => {
    const { service, audit } = setup();
    const u = staff(['MAGEIRISSA']);
    const view = await service.foodNeeds(u, DRASI);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(u, 'drasi.food.read', 'drasi', DRASI, { count: 3 });
    expect(view.submitted).toBe(3);
    expect(view.expected).toBe(5);
  });

  it('δήλωση με «Όχι» και στα δύο δεν μπαίνει στη λίστα· «Ναι» χωρίς λεπτομέρειες το γράφει', async () => {
    const { service } = setup();
    const view = await service.foodNeeds(staff(['MAGEIRISSA']), DRASI);
    expect(view.people.map((p) => p.participantId)).toEqual(['p-1', 'p-3']);
    expect(view.people[0]).toMatchObject({ allergies: 'φυστίκια', diet: null });
    expect(view.people[1]).toMatchObject({ allergies: 'ναι (χωρίς λεπτομέρειες)', diet: null });
  });
});
