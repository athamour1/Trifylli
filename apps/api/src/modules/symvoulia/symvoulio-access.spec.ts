import { describe, expect, it } from 'vitest';
import {
  AccountRole,
  KladosType,
  STELEXOS_BASE_CAPABILITIES,
  SymvoulioType,
  drasiAccess,
  type DrasiAccess,
  type DrasiRoleKind,
} from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { SymvoulioAccess } from './symvoulio-access';

function account(id: string, role: AccountRole, extra: Partial<RequestUser> = {}): RequestUser {
  return {
    id,
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

/** Στέλεχος του κλάδου με δικαίωμα γραφής στα συμβούλιά του (γραμματέας). */
const grammateas = account('u-grammateas', AccountRole.STELEXOS, {
  kladoi: [KladosType.ODIGOI],
  grants: { [KladosType.ODIGOI]: [...STELEXOS_BASE_CAPABILITIES, 'symvoulio:klados:write'] },
});
const arxigos = account('u-arxigos', AccountRole.STELEXOS, { kladoi: [KladosType.ODIGOI], grants: { [KladosType.ODIGOI]: [...STELEXOS_BASE_CAPABILITIES] } });
const external = account('u-external', AccountRole.EXTERNAL);
const outsider = account('u-outsider', AccountRole.STELEXOS, { kladoi: [KladosType.ODIGOI], grants: { [KladosType.ODIGOI]: [...STELEXOS_BASE_CAPABILITIES] } });

/** Ό,τι θα έβγαζε ο `DrasiAccessService` για τον καθένα στη δράση `d-1`. */
const IN_DRASI: Record<string, DrasiAccess> = {
  'u-grammateas': drasiAccess({ full: false, staff: true, roles: [] }),
  'u-arxigos': drasiAccess({ full: false, staff: true, roles: ['ARXIGOS' as DrasiRoleKind] }),
  'u-external': drasiAccess({ full: false, staff: true, roles: ['ARXIGOS' as DrasiRoleKind] }),
  'u-outsider': drasiAccess({ full: false, staff: false, roles: [] }),
};
const drasi = { accessFor: async (user: RequestUser) => IN_DRASI[user.id]! };
const access = new SymvoulioAccess(drasi as never);

const ofDrasi = (type: SymvoulioType) => ({ type, drasiId: 'd-1', klados: type === SymvoulioType.KLADOU ? { type: KladosType.ODIGOI } : null });

describe('συμβούλιο δράσης: τα δικαιώματα της δράσης, όχι του κλάδου', () => {
  it('γραμματέας του κλάδου που στη δράση είναι απλό στέλεχος: βλέπει, δεν γράφει', async () => {
    expect(await access.grant(grammateas, ofDrasi(SymvoulioType.KLADOU))).toEqual({ view: true, write: false });
  });

  it('ο αρχηγός της δράσης γράφει, και σε συμβούλιο δράσης του Τοπικού', async () => {
    expect(await access.grant(arxigos, ofDrasi(SymvoulioType.KLADOU))).toEqual({ view: true, write: true });
    expect(await access.grant(arxigos, ofDrasi(SymvoulioType.TOPIKOU))).toEqual({ view: true, write: true });
  });

  it('εξωτερικό στέλεχος με ρόλο στη δράση: γράφει, χωρίς κανένα δικαίωμα κλάδου', async () => {
    expect(await access.grant(external, ofDrasi(SymvoulioType.KLADOU))).toEqual({ view: true, write: true });
  });

  it('στέλεχος του κλάδου έξω από τη δράση: τίποτα', async () => {
    expect(await access.grant(outsider, ofDrasi(SymvoulioType.KLADOU))).toEqual({ view: false, write: false });
  });

  it('συμβούλιο κλάδου χωρίς δράση: μένει στα δικαιώματα κλάδου', async () => {
    const kladou = { type: SymvoulioType.KLADOU, drasiId: null, klados: { type: KladosType.ODIGOI } };
    expect(await access.grant(grammateas, kladou)).toEqual({ view: true, write: true });
    expect(await access.grant(arxigos, kladou)).toEqual({ view: true, write: false });
    expect(await access.grant(external, kladou)).toEqual({ view: false, write: false });
  });
});
