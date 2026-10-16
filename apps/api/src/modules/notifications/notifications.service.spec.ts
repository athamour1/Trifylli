import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { NotificationsService, type PushSender } from './notifications.service';

const ME = { id: 'u-1' } as RequestUser;

function setup(options: { muted?: { userId: string; kind: string }[]; subscriptions?: { userId: string; endpoint: string }[]; gone?: string[] } = {}) {
  const rows: { id: string; userId: string; kind: string; title: string; link: string | null; readAt: Date | null; createdAt: Date }[] = [];
  const subscriptions = (options.subscriptions ?? []).map((s, i) => ({ id: `s-${i}`, p256dh: 'k', auth: 'a', ...s }));
  const broadcasts: string[] = [];
  const pushed: string[] = [];
  const prisma = {
    notificationSetting: {
      findMany: async ({ where }: { where: { userId: { in: string[] }; kind: string; enabled: boolean } }) =>
        (options.muted ?? []).filter((m) => where.userId.in.includes(m.userId) && m.kind === where.kind),
    },
    notification: {
      createMany: async ({ data }: { data: { userId: string; kind: string; title: string; link?: string | null }[] }) => {
        for (const row of data) rows.push({ id: `n-${rows.length}`, readAt: null, createdAt: new Date(), link: null, ...row });
      },
      findMany: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId).reverse(),
      count: async ({ where }: { where: { userId: string; readAt: null } }) => rows.filter((r) => r.userId === where.userId && !r.readAt).length,
      updateMany: async ({ where, data }: { where: { userId: string; id?: string; readAt: null }; data: { readAt: Date } }) => {
        for (const r of rows) if (r.userId === where.userId && (!where.id || r.id === where.id) && !r.readAt) r.readAt = data.readAt;
      },
    },
    pushSubscription: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) => subscriptions.filter((s) => where.userId.in.includes(s.userId)),
      deleteMany: async ({ where }: { where: { endpoint: { in: string[] } } }) => {
        for (let i = subscriptions.length - 1; i >= 0; i -= 1) if (where.endpoint.in.includes(subscriptions[i]!.endpoint)) subscriptions.splice(i, 1);
      },
    },
  };
  const collab = { broadcast: (name: string) => broadcasts.push(name), registry: { register: () => undefined } };
  const push: PushSender = {
    enabled: true,
    send: async (subscription, payload) => {
      pushed.push(`${subscription.endpoint}:${JSON.parse(payload).title}`);
      return options.gone?.includes(subscription.endpoint) ? 'gone' : 'ok';
    },
  };
  const service = new NotificationsService(prisma as never, collab as never, push);
  return { service, rows, broadcasts, pushed, subscriptions };
}

describe('ειδοποιήσεις', () => {
  it('φτάνουν σε όσους δεν έχουν κλείσει το είδος — στο καμπανάκι, ζωντανά και ως push', async () => {
    const { service, rows, broadcasts, pushed } = setup({
      muted: [{ userId: 'u-3', kind: 'role' }],
      subscriptions: [{ userId: 'u-2', endpoint: 'https://push/2' }],
    });
    await service.notify(['u-2', 'u-3', 'u-2'], { kind: 'role', title: 'Νέος ρόλος στη δράση «Πεζοπορία»', link: '/draseis/d-1' });

    expect(rows.map((r) => r.userId)).toEqual(['u-2']);
    expect(broadcasts).toEqual(['user:u-2']);
    expect(pushed).toEqual(['https://push/2:Νέος ρόλος στη δράση «Πεζοπορία»']);
  });

  it('συσκευή που δεν υπάρχει πια (410 από την υπηρεσία push) σβήνεται', async () => {
    const { service, subscriptions } = setup({ subscriptions: [{ userId: 'u-2', endpoint: 'https://push/old' }], gone: ['https://push/old'] });
    await service.notify(['u-2'], { kind: 'role', title: 'Τίτλος' });
    expect(subscriptions).toEqual([]);
  });

  it('το καμπανάκι: αδιάβαστα, «διαβάστηκε», «όλα διαβάστηκαν»', async () => {
    const { service } = setup();
    await service.notify(['u-1'], { kind: 'role', title: 'Α' });
    await service.notify(['u-1'], { kind: 'responsible', title: 'Β' });
    const before = await service.list(ME);
    expect(before.unread).toBe(2);

    await service.markRead(ME, before.items[0]!.id);
    expect((await service.list(ME)).unread).toBe(1);
    await service.markAllRead(ME);
    expect((await service.list(ME)).unread).toBe(0);
  });
});
