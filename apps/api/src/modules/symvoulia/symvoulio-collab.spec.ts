import { describe, expect, it } from 'vitest';
import { AccountRole, KladosType, STELEXOS_BASE_CAPABILITIES, SymvoulioType, type Capability } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { SymvoulioAccess } from './symvoulio-access';
import { SymvoulioCollab } from './symvoulio-collab';

const ID = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';

function account(role: AccountRole, extra: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'u-1',
    ssoId: null,
    email: 'x@example.org',
    firstName: 'Μαρία',
    lastName: 'Δοκιμή',
    role,
    adminKlados: null,
    kladoi: [],
    grants: null,
    topikoId: 'topiko',
    ...extra,
  };
}

const superAdmin = account(AccountRole.SUPER_ADMIN);
const odigoiAdmin = account(AccountRole.KLADOS_ADMIN, { adminKlados: KladosType.ODIGOI, kladoi: [KladosType.ODIGOI] });
const pouliaAdmin = account(AccountRole.KLADOS_ADMIN, { adminKlados: KladosType.POULIA, kladoi: [KladosType.POULIA] });
const stelexos = (caps: readonly Capability[]) =>
  account(AccountRole.STELEXOS, { kladoi: [KladosType.ODIGOI], grants: { [KladosType.ODIGOI]: [...caps] } });
const external = account(AccountRole.EXTERNAL);

function collab(row: { type: SymvoulioType; klados: KladosType | null; finalizedAt?: Date | null } | null) {
  const prisma = {
    symvoulio: {
      findFirst: async () =>
        row && { type: row.type, finalizedAt: row.finalizedAt ?? null, klados: row.klados ? { type: row.klados } : null },
    },
  };
  return new SymvoulioCollab(prisma as never, { registry: { register: () => undefined } } as never, new SymvoulioAccess({} as never));
}

describe('πρακτικά συμβουλίου — ποιος γράφει και ποιος βλέπει', () => {
  const kladou = { type: SymvoulioType.KLADOU, klados: KladosType.ODIGOI };
  const topikou = { type: SymvoulioType.TOPIKOU, klados: null };

  it.each([
    ['υπερδιαχειριστής', superAdmin, 'write'],
    ['διαχειριστής του κλάδου', odigoiAdmin, 'write'],
    ['διαχειριστής άλλου κλάδου', pouliaAdmin, null],
    ['στέλεχος του κλάδου', stelexos(STELEXOS_BASE_CAPABILITIES), 'read'],
    ['γραμματέας του κλάδου', stelexos([...STELEXOS_BASE_CAPABILITIES, 'symvoulio:klados:write']), 'write'],
    ['εξωτερικό στέλεχος', external, null],
  ] as const)('συμβούλιο κλάδου: %s → %s', async (_label, user, expected) => {
    expect(await collab(kladou).access(user, [ID])).toBe(expected);
  });

  it.each([
    ['υπερδιαχειριστής', superAdmin, 'write'],
    ['διαχειριστής κλάδου', odigoiAdmin, 'read'],
  ] as const)('συμβούλιο Τοπικού: %s → %s', async (_label, user, expected) => {
    expect(await collab(topikou).access(user, [ID])).toBe(expected);
  });

  it('μετά την οριστικοποίηση κανείς δεν γράφει', async () => {
    expect(await collab({ ...kladou, finalizedAt: new Date() }).access(superAdmin, [ID])).toBe('read');
  });

  it('συμβούλιο που δεν υπάρχει (ή αρχειοθετήθηκε) = καμία σύνδεση', async () => {
    expect(await collab(null).access(superAdmin, [ID])).toBeNull();
  });
});
