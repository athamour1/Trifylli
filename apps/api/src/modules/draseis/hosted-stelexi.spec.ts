import { describe, expect, it } from 'vitest';
import { AccountRole, KladosType, STELEXOS_BASE_CAPABILITIES } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisService } from './draseis.service';

const stelexos = (klados: KladosType): RequestUser => ({
  id: `u-${klados}`,
  ssoId: null,
  email: `${klados}@example.org`,
  firstName: 'Στέλεχος',
  lastName: klados,
  role: AccountRole.STELEXOS,
  adminKlados: null,
  kladoi: [klados],
  grants: { [klados]: STELEXOS_BASE_CAPABILITIES },
  topikoId: 't-1',
});
const ASTERIA = stelexos(KladosType.ASTERIA);
const ODIGOI = stelexos(KladosType.ODIGOI);

/** Δράση των Οδηγών όπου ο χρήστης είναι στέλεχος στους συμμετέχοντες. */
function accessService(status: 'ANOIXTI' | 'KLEISTI') {
  const prisma = {
    drasi: {
      findFirst: async () => ({
        status,
        archivedAt: null,
        klados: { type: KladosType.ODIGOI },
        kladoi: [{ klados: { type: KladosType.ODIGOI } }],
        roles: [],
        participants: [{ id: 'p-1' }],
        ypiresies: [],
      }),
    },
  };
  return new DrasiAccessService(prisma as never);
}

describe('στέλεχος άλλου κλάδου σε δράση', () => {
  it('όσο η δράση είναι ανοιχτή: βλέπει τη δράση ως στέλεχος', async () => {
    const access = await accessService('ANOIXTI').accessFor(ASTERIA, 'd-1');
    expect(access.view).toContain('episkopisi');
    expect(access.full).toBe(false);
  });

  it('με το κλείσιμο: η πρόσβαση λήγει — όχι όμως για στέλεχος του κλάδου της δράσης', async () => {
    expect((await accessService('KLEISTI').accessFor(ASTERIA, 'd-1')).view).toEqual([]);
    expect((await accessService('KLEISTI').accessFor(ODIGOI, 'd-1')).view).toContain('episkopisi');
  });

  it('«Στελέχη άλλων κλάδων»: στελέχη κλάδων εκτός δράσης, όχι όσοι είναι ήδη μέσα ή και σε κλάδο της', async () => {
    const queries: { where: Record<string, unknown> }[] = [];
    const prisma = {
      drasi: { findFirst: async () => ({ id: 'd-1', klados: { type: KladosType.ODIGOI } }) },
      drasiKlados: { findMany: async () => [{ klados: { type: KladosType.POULIA } }] },
      user: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          queries.push(args);
          return [
            {
              id: 'u-eyh',
              firstName: 'Εύη',
              lastName: 'Πανταζή',
              accountRole: null,
              memberships: [{ klados: { type: KladosType.MEGALOI_ODIGOI } }, { klados: { type: KladosType.ASTERIA } }],
            },
          ];
        },
      },
    };
    const admin = { ...ODIGOI, drasiGrant: { drasiId: 'd-1', access: { full: true, view: [], edit: [] } } } as RequestUser;
    const service = new DraseisService(prisma as never, {} as never, {} as never, {} as never);
    const rows = await service.otherKladosStelexi(admin, 'd-1', ' Πανταζ ');

    expect(rows).toEqual([
      { id: 'u-eyh', firstName: 'Εύη', lastName: 'Πανταζή', kladoi: ['ASTERIA', 'MEGALOI_ODIGOI'], hasAccount: false },
    ]);
    expect(queries[0]?.where).toMatchObject({
      participations: { none: { drasiId: 'd-1' } },
      memberships: {
        some: { leftAt: null, kind: 'STELEXOS', klados: { type: { notIn: ['ODIGOI', 'POULIA'] } } },
        none: { leftAt: null, klados: { type: { in: ['ODIGOI', 'POULIA'] } } },
      },
      OR: [{ firstName: { contains: 'Πανταζ' } }, { lastName: { contains: 'Πανταζ' } }],
    });
  });
});
