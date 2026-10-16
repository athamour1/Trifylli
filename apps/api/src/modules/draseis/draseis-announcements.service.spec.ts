import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisAnnouncementsService } from './draseis-announcements.service';

const DRASI = 'd-1';
const user = (id: string) => ({ id, topikoId: 't-1' }) as RequestUser;
const PEOPLE = ['u-arxigos', 'u-maria', 'u-sofia', 'u-tamias'].map((id) => ({ id, firstName: id, lastName: 'Χ' }));

function setup() {
  const roles = [
    { userId: 'u-arxigos', kind: 'ARXIGOS' },
    { userId: 'u-tamias', kind: 'TAMIAS' },
  ];
  const participants = [{ userId: 'u-maria' }, { userId: 'u-sofia' }, { userId: 'u-arxigos' }];
  const announcements: { id: string; drasiId: string; body: string; roles: string[]; audienceIds: string[]; createdById: string; createdAt: Date }[] = [];
  const seen: { announcementId: string; userId: string; seenAt: Date }[] = [];
  const prisma = {
    drasiRole: {
      findMany: async ({ where }: { where: { kind?: { in: string[] } } }) => roles.filter((r) => !where.kind || where.kind.in.includes(r.kind)),
    },
    drasiParticipant: { findMany: async () => participants },
    drasiAnnouncement: {
      create: async ({ data }: { data: Omit<(typeof announcements)[number], 'id' | 'createdAt'> }) => {
        const row = { ...data, id: `a-${announcements.length + 1}`, createdAt: new Date() };
        announcements.push(row);
        return { id: row.id };
      },
      findMany: async ({ where }: { where: { drasiId: string; id?: { in: string[] }; audienceIds?: { has: string } } }) =>
        announcements
          .filter((a) => a.drasiId === where.drasiId && (!where.id || where.id.in.includes(a.id)) && (!where.audienceIds || a.audienceIds.includes(where.audienceIds.has)))
          .map((a) => ({ ...a, createdBy: PEOPLE.find((p) => p.id === a.createdById) ?? null, seen: seen.filter((s) => s.announcementId === a.id) })),
    },
    drasiAnnouncementSeen: {
      create: async ({ data }: { data: { announcementId: string; userId: string } }) => void seen.push({ ...data, seenAt: new Date() }),
      createMany: async ({ data }: { data: { announcementId: string; userId: string }[] }) => {
        for (const row of data) if (!seen.some((s) => s.announcementId === row.announcementId && s.userId === row.userId)) seen.push({ ...row, seenAt: new Date() });
      },
    },
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => PEOPLE.filter((p) => where.id.in.includes(p.id)) },
  };
  const access = { load: async () => ({ id: DRASI, title: 'Κατασκήνωση' }) };
  const notified: { userIds: string[]; kind: string; title: string }[] = [];
  const notifications = { notify: async (userIds: string[], input: { kind: string; title: string }) => void notified.push({ userIds: [...userIds].sort(), ...input }) };
  const service = new DraseisAnnouncementsService(prisma as never, access as never, notifications as never);
  return { service, notified };
}

describe('ανακοινώσεις της δράσης', () => {
  it('σε όλα τα στελέχη: ειδοποίηση χωρίς το κείμενο, και «το είδαν» — ο αποστολέας ήδη', async () => {
    const { service, notified } = setup();
    await service.create(user('u-arxigos'), DRASI, '  Αύριο ξεκινάμε στις 7:00 από την πλατεία.  ', []);

    expect(notified).toEqual([{ userIds: ['u-maria', 'u-sofia', 'u-tamias'], kind: 'announcement', title: 'Ανακοίνωση — δράση «Κατασκήνωση»', link: '/draseis/d-1' }]);
    const [view] = await service.list(user('u-maria'), DRASI);
    expect(view?.body).toBe('Αύριο ξεκινάμε στις 7:00 από την πλατεία.');
    expect(view?.audience.filter((p) => p.seenAt).map((p) => p.id)).toEqual(['u-arxigos']);
    expect(view?.unseen).toBe(true);
  });

  it('σε ρόλους: μόνο όσοι τους έχουν· «τις είδα» μόνο για όποιον αφορά', async () => {
    const { service } = setup();
    const { id } = await service.create(user('u-arxigos'), DRASI, 'Ταμείο: αποδείξεις ως την Κυριακή', ['TAMIAS']);
    await service.seen(user('u-maria'), DRASI, [id]);
    await service.seen(user('u-tamias'), DRASI, [id]);

    const [view] = await service.list(user('u-tamias'), DRASI);
    expect(view?.audience.map((p) => [p.id, !!p.seenAt])).toEqual([['u-tamias', true]]);
    expect(view?.unseen).toBe(false);
  });

  it('κενή ή χωρίς παραλήπτες: όχι', async () => {
    const { service } = setup();
    await expect(service.create(user('u-arxigos'), DRASI, '   ', [])).rejects.toThrow(/Κενή/);
    await expect(service.create(user('u-arxigos'), DRASI, 'Γεια', ['MAGEIRISSA'])).rejects.toThrow(/κανείς/);
  });
});
