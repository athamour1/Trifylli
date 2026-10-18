import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AccountRole, KladosType, STELEXOS_BASE_CAPABILITIES, drasiAccess, type DrasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { SymvouliaService } from './symvoulia.service';
import { SymvoulioAccess } from './symvoulio-access';
import { SymvoulioCollab } from './symvoulio-collab';

function stelexos(id: string, caps: string[]): RequestUser {
  return {
    id,
    ssoId: null,
    email: 'x@example.org',
    firstName: 'Μαρία',
    lastName: 'Δοκιμή',
    role: AccountRole.STELEXOS,
    adminKlados: null,
    kladoi: [KladosType.ODIGOI],
    grants: { [KladosType.ODIGOI]: [...STELEXOS_BASE_CAPABILITIES, ...caps] },
    topikoId: 't-1',
  } as RequestUser;
}

/** Γραφει τα συμβούλια του κλάδου, αλλά στη δράση είναι απλό στέλεχος. */
const grammateas = stelexos('u-grammateas', ['symvoulio:klados:write']);
const arxigos = stelexos('u-arxigos', []);
const outsider = stelexos('u-outsider', []);
const IN_DRASI: Record<string, DrasiAccess> = {
  'u-grammateas': drasiAccess({ full: false, staff: true, roles: [] }),
  'u-arxigos': drasiAccess({ full: false, staff: true, roles: ['ARXIGOS' as DrasiRoleKind] }),
  'u-outsider': drasiAccess({ full: false, staff: false, roles: [] }),
};

const COUNCIL = { id: 's-1', type: 'KLADOU', drasiId: 'd-1', finalizedAt: null, archivedAt: null, klados: { type: 'ODIGOI', name: 'Οδηγοί' }, participants: [] };
const KLADOS_COUNCIL = { ...COUNCIL, id: 's-2', drasiId: null };

function setup() {
  const prisma = {
    symvoulio: {
      findFirst: async ({ where }: { where: { id: string } }) => [COUNCIL, KLADOS_COUNCIL].find((s) => s.id === where.id) ?? null,
      findMany: async () => [COUNCIL, KLADOS_COUNCIL].map((s) => ({ ...s, chair: null, _count: { participants: 0 } })),
      update: async () => COUNCIL,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ symvoulio: { update: async () => COUNCIL } }),
  };
  const access = new SymvoulioAccess({ accessFor: async (user: RequestUser) => IN_DRASI[user.id]! } as never);
  const collabService = { flushPending: async () => undefined, registry: { register: () => undefined } };
  const service = new SymvouliaService(prisma as never, {} as never, collabService as never, {} as never, access);
  const collab = new SymvoulioCollab(prisma as never, collabService as never, access);
  return { service, collab };
}

describe('συμβούλιο δράσης: ανοίγει όποιος βλέπει τη δράση, γράφει όποιος έχει ρόλο', () => {
  it('ο γραμματέας του κλάδου με απλή προβολή στη δράση: το ανοίγει μόνο για ανάγνωση', async () => {
    const { service, collab } = setup();
    await expect(service.findOne(grammateas, 's-1')).resolves.toMatchObject({ canWrite: false });
    await expect(service.update(grammateas, 's-1', { title: 'Άλλο' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await collab.access(grammateas, ['s-1'])).toBe('read');
  });

  it('ο αρχηγός της δράσης γράφει, χωρίς δικαίωμα στα συμβούλια του κλάδου', async () => {
    const { service, collab } = setup();
    await expect(service.findOne(arxigos, 's-1')).resolves.toMatchObject({ canWrite: true });
    await expect(service.update(arxigos, 's-1', { title: 'Άλλο' })).resolves.toBeTruthy();
    expect(await collab.access(arxigos, ['s-1'])).toBe('write');
  });

  it('στέλεχος του κλάδου έξω από τη δράση: δεν το ανοίγει, ούτε το βλέπει στη λίστα', async () => {
    const { service, collab } = setup();
    await expect(service.findOne(outsider, 's-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await collab.access(outsider, ['s-1'])).toBeNull();
    expect((await service.list(outsider)).map((s) => s.id)).toEqual(['s-2']);
  });

  it('το συμβούλιο του κλάδου μένει στα δικαιώματα κλάδου, όποιος κι αν είναι ο ρόλος σε δράσεις', async () => {
    const { service } = setup();
    await expect(service.findOne(grammateas, 's-2')).resolves.toMatchObject({ canWrite: true });
    await expect(service.findOne(arxigos, 's-2')).resolves.toMatchObject({ canWrite: false });
  });
});
