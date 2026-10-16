import { describe, expect, it } from 'vitest';
import { AccountRole, KladosType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { SymvouliaService } from './symvoulia.service';

const ID = 's-1';
const ME: RequestUser = {
  id: 'u-me',
  ssoId: null,
  email: 'x@example.org',
  firstName: 'Μαρία',
  lastName: 'Δοκιμή',
  role: AccountRole.KLADOS_ADMIN,
  adminKlados: KladosType.ODIGOI,
  kladoi: [KladosType.ODIGOI],
  grants: null,
  topikoId: 't-1',
};

/** Ένα συμβούλιο κλάδου στη μνήμη, με τους συμμετέχοντές του. */
function setup() {
  const participants = [{ symvoulioId: ID, userId: 'u-1' }];
  const updates: unknown[] = [];
  const tx = {
    symvoulio: { update: async ({ data }: { data: unknown }) => (updates.push(data), { id: ID }) },
    symvoulioParticipant: {
      deleteMany: async ({ where }: { where: { symvoulioId: string; userId?: { in: string[] } } }) => {
        for (let i = participants.length - 1; i >= 0; i -= 1) {
          const p = participants[i]!;
          if (p.symvoulioId === where.symvoulioId && (!where.userId || where.userId.in.includes(p.userId))) participants.splice(i, 1);
        }
      },
      createMany: async ({ data }: { data: { symvoulioId: string; userId: string }[] }) => {
        for (const row of data) if (!participants.some((p) => p.userId === row.userId)) participants.push(row);
      },
    },
  };
  const prisma = {
    symvoulio: { findFirst: async () => ({ id: ID, type: 'KLADOS', finalizedAt: null, klados: { type: 'ODIGOI' } }) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const service = new SymvouliaService(prisma as never, {} as never, {} as never);
  return { service, participants, updates, who: () => participants.map((p) => p.userId).sort() };
}

describe('συμμετέχοντες συμβουλίου ένας-ένας', () => {
  it('δύο που τσεκάρουν μαζί διαφορετικά στελέχη: μένουν και οι δύο', async () => {
    const { service, who } = setup();
    await service.update(ME, ID, { addParticipantIds: ['u-2'] });
    await service.update(ME, ID, { addParticipantIds: ['u-3'] });
    expect(who()).toEqual(['u-1', 'u-2', 'u-3']);
  });

  it('αφαίρεση: φεύγει μόνο αυτός', async () => {
    const { service, who } = setup();
    await service.update(ME, ID, { addParticipantIds: ['u-2'], removeParticipantIds: ['u-1'] });
    expect(who()).toEqual(['u-2']);
  });

  it('τα πεδία της κεφαλίδας γράφονται χωρίς τα «πρόσθεσε / αφαίρεσε»', async () => {
    const { service, updates } = setup();
    await service.update(ME, ID, { title: 'Συμβούλιο Οκτωβρίου', addParticipantIds: ['u-2'] });
    expect(updates).toEqual([{ title: 'Συμβούλιο Οκτωβρίου' }]);
  });
});
