import { describe, expect, it } from 'vitest';
import { AccountRole, KladosType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { SyggentrwseisService } from './syggentrwseis.service';

const ODIGOI_ADMIN: RequestUser = {
  id: 'u-admin',
  ssoId: null,
  email: 'admin@example.org',
  firstName: 'Ελένη',
  lastName: 'Αρχηγός',
  role: AccountRole.KLADOS_ADMIN,
  adminKlados: KladosType.ODIGOI,
  kladoi: [KladosType.ODIGOI],
  grants: null,
  topikoId: 't-1',
};

function setup() {
  const queries: unknown[] = [];
  const prisma = {
    syggentrwsh: {
      findFirst: async () => ({
        id: 's-1',
        date: new Date('2026-10-23T12:00:00Z'),
        klados: { id: 'k-odigoi', type: KladosType.ODIGOI, name: 'Οδηγοί' },
        drasi: null,
        timeline: [],
        parts: [],
        ylikoItems: [],
        stelexi: [],
        checkouts: [],
      }),
    },
    user: {
      findMany: async (args: unknown) => {
        queries.push(args);
        return [
          { id: 'm-1', firstName: 'Μαρία', lastName: 'Παππά', birthDate: new Date('2016-10-21T00:00:00Z') },
          { id: 'm-2', firstName: 'Σοφία', lastName: 'Νίκα', birthDate: new Date('2016-11-30T00:00:00Z') },
        ];
      },
    },
  };
  const collab = { flushPending: async () => undefined };
  return { service: new SyggentrwseisService(prisma as never, {} as never, collab as never), queries };
}

describe('συγκέντρωση: γενέθλια της εβδομάδας', () => {
  it('τα μέλη του κλάδου με γενέθλια 3 μέρες γύρω από τη συγκέντρωση', async () => {
    const { service, queries } = setup();
    const view = await service.findOne(ODIGOI_ADMIN, 's-1');
    expect(view.birthdays).toEqual([
      { userId: 'm-1', firstName: 'Μαρία', lastName: 'Παππά', day: '2026-10-21', age: 10 },
    ]);
    expect(queries[0]).toMatchObject({
      where: { status: 'ENERGO', guestTopikoCode: null, memberships: { some: { kladosId: 'k-odigoi', leftAt: null } } },
    });
  });

  it('στέλεχος χωρίς `meloi:read` στον κλάδο: η συγκέντρωση ναι, οι ημερομηνίες γέννησης όχι', async () => {
    const { service, queries } = setup();
    const stelexos: RequestUser = {
      ...ODIGOI_ADMIN,
      role: AccountRole.STELEXOS,
      adminKlados: null,
      grants: { ODIGOI: ['calendar:read'] },
      activeCapability: 'calendar:read',
    };
    const view = await service.findOne(stelexos, 's-1');
    expect(view.birthdays).toEqual([]);
    expect(queries).toEqual([]);
  });
});
