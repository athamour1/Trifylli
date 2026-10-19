import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisService } from './draseis.service';

const DRASI = 'd-1';
const ARXIGOS = { id: 'u-arxigos', topikoId: 't-1', drasiGrant: { drasiId: DRASI, access: { full: true, view: [], edit: [] } } } as unknown as RequestUser;

const participant = (kind: 'MELOS' | 'STELEXOS', kladoi: string[]) => ({
  kind,
  user: { id: `u-${Math.random()}`, memberships: kladoi.map((type) => ({ klados: { type } })) },
});

function setup(participants: ReturnType<typeof participant>[]) {
  const prisma = {
    drasi: { findFirst: async () => ({ id: DRASI, title: 'Εκπαίδευση', klados: { type: 'ODIGOI' } }) },
    drasiParticipant: { findMany: async () => participants },
    ylikoCheckout: { findMany: async () => [] },
    klados: { findMany: async () => [] },
  };
  return new DraseisService(prisma as never, {} as never, {} as never, {} as never);
}

describe('στοιχεία δράσης ανά κλάδο', () => {
  it('φιλοξενούμενοι και εξωτερικοί (χωρίς δικό μας κλάδο) μετράνε στα σύνολα, σε δική τους γραμμή', async () => {
    const service = setup([
      ...Array.from({ length: 22 }, () => participant('MELOS', ['ODIGOI'])),
      // Στέλεχος από την Ελευσίνα: συμμετέχει, αλλά δεν ανήκει σε κλάδο μας.
      participant('STELEXOS', []),
    ]);
    const stats = await service.kataskinosiStats(ARXIGOS, DRASI);
    expect(stats.perKlados).toEqual([expect.objectContaining({ kladosType: 'ODIGOI', stelexi: 0, kataskinotes: 22, total: 22 })]);
    expect(stats.others).toEqual({ stelexi: 1, kataskinotes: 0, total: 1 });
    expect(stats.totals).toEqual({ stelexi: 1, kataskinotes: 22, total: 23 });
  });
});
