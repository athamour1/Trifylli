import { describe, expect, it } from 'vitest';
import { AccountRole, KladosType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { CalendarService } from './calendar.service';

const SUPER: RequestUser = {
  id: 'u-super',
  ssoId: null,
  email: 'efores@example.org',
  firstName: 'Ελένη',
  lastName: 'Έφορος',
  role: AccountRole.SUPER_ADMIN,
  adminKlados: null,
  kladoi: [],
  grants: null,
  topikoId: 't-1',
};

const ODIGOI_ADMIN: RequestUser = {
  ...SUPER,
  id: 'u-odigoi',
  role: AccountRole.KLADOS_ADMIN,
  adminKlados: KladosType.ODIGOI,
  kladoi: [KladosType.ODIGOI],
};

const OCTOBER = { from: new Date('2026-09-30T21:00:00Z'), to: new Date('2026-10-31T21:59:59Z') };

function setup() {
  const calls: { symvoulio?: unknown; user?: unknown[] } = { user: [] };
  const prisma = {
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    drasi: {
      findMany: async () => [
        { id: 'd-1', title: 'Εκδρομή', type: 'EKDROMI', dateStart: new Date('2026-10-10T06:00:00Z'), dateEnd: new Date('2026-10-10T16:00:00Z'), klados: { type: KladosType.ODIGOI } },
        { id: 'd-2', title: 'Γιορτή Τοπικού', type: 'EKDILOSI', dateStart: new Date('2026-10-12T06:00:00Z'), dateEnd: new Date('2026-10-12T16:00:00Z'), klados: null },
      ],
    },
    syggentrwsh: {
      findMany: async () => [
        { id: 's-1', title: null, date: new Date('2026-10-06T00:00:00Z'), startTime: new Date('2026-10-06T15:00:00Z'), endTime: null, klados: { type: KladosType.ODIGOI } },
      ],
    },
    symvoulio: {
      findMany: async (args: { where: unknown }) => {
        calls.symvoulio = args.where;
        return [
          { id: 'c-1', title: null, type: 'KLADOU', date: new Date('2026-10-08T16:00:00Z'), drasiId: null, klados: { type: KladosType.ODIGOI } },
          { id: 'c-2', title: null, type: 'TOPIKOU', date: new Date('2026-10-15T16:00:00Z'), drasiId: null, klados: null },
          { id: 'c-3', title: null, type: 'STELEXON', date: new Date('2026-10-20T16:00:00Z'), drasiId: null, klados: null },
        ];
      },
    },
    user: {
      findMany: async (args: unknown) => {
        calls.user?.push(args);
        return [
          {
            id: 'm-1',
            firstName: 'Μαρία',
            lastName: 'Παππά',
            birthDate: new Date('2016-10-22T00:00:00Z'),
            memberships: [{ kind: 'MELOS', klados: { type: KladosType.ODIGOI } }],
          },
          {
            // Στέλεχος σε δύο κλάδους: ένα γεγονός, στην πηγή «Στελέχη».
            id: 'm-2',
            firstName: 'Σοφία',
            lastName: 'Νίκα',
            birthDate: new Date('1995-10-03T00:00:00Z'),
            memberships: [
              { kind: 'STELEXOS', klados: { type: KladosType.ODIGOI } },
              { kind: 'STELEXOS', klados: { type: KladosType.POULIA } },
            ],
          },
        ];
      },
    },
  };
  return { service: new CalendarService(prisma as never), calls };
}

describe('ημερολόγιο: πηγές και γενέθλια', () => {
  it('κάθε γεγονός λέει σε ποιον ανήκει: κλάδος, Τοπικό ή Στελέχη', async () => {
    const { service } = setup();
    const events = await service.events(SUPER, OCTOBER.from, OCTOBER.to, undefined, { birthdays: true });
    expect(events.map((e) => [e.id, e.kind, e.source])).toEqual([
      ['birthday:m-2:2026-10-03', 'BIRTHDAY', 'STELEXON'],
      ['s-1', 'SYGGENTRWSH', 'KLADOS'],
      ['c-1', 'SYMVOULIO', 'KLADOS'],
      ['d-1', 'DRASI', 'KLADOS'],
      ['d-2', 'DRASI', 'TOPIKO'],
      ['c-2', 'SYMVOULIO', 'TOPIKO'],
      ['c-3', 'SYMVOULIO', 'STELEXON'],
      ['birthday:m-1:2026-10-22', 'BIRTHDAY', 'KLADOS'],
    ]);
    expect(events.find((e) => e.id === 'birthday:m-1:2026-10-22')).toMatchObject({
      title: 'Μαρία Παππά · 10 χρονών',
      allDay: true,
      kladosType: KladosType.ODIGOI,
      href: '/meloi/m-1',
    });
  });

  it('το ημερολόγιο κλάδου φέρνει και τα συμβούλια του Τοπικού, όχι συμβούλια δράσεων', async () => {
    const { service, calls } = setup();
    await service.events(ODIGOI_ADMIN, OCTOBER.from, OCTOBER.to, KladosType.ODIGOI);
    expect(calls.symvoulio).toMatchObject({
      OR: [
        { klados: { type: KladosType.ODIGOI } },
        { kladosId: null, drasiId: null, type: { in: ['TOPIKOU', 'STELEXON'] } },
      ],
    });
  });

  it('γενέθλια μόνο όταν ζητηθούν (όχι στην αρχική οθόνη)', async () => {
    const { service, calls } = setup();
    const events = await service.events(SUPER, OCTOBER.from, OCTOBER.to);
    expect(events.some((e) => e.kind === 'BIRTHDAY')).toBe(false);
    expect(calls.user).toEqual([]);
  });

  it('γενέθλια μόνο από τους κλάδους που βλέπει ο χρήστης', async () => {
    const { service, calls } = setup();
    await service.events(ODIGOI_ADMIN, OCTOBER.from, OCTOBER.to, undefined, { birthdays: true });
    expect(calls.user?.[0]).toMatchObject({
      where: { memberships: { some: { leftAt: null, klados: { type: { in: [KladosType.ODIGOI] } } } } },
    });
  });
});
