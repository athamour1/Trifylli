import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { DrasiRemindersService } from './drasi-reminders.service';

const DRASI = { id: 'd-1', title: 'Κατασκήνωση', dateStart: new Date('2026-10-28T06:00:00Z'), dateEnd: new Date('2026-10-30T15:00:00Z'), dayStartTimes: null, topiko: { timezone: 'Europe/Athens' } };

/** Μια ημέρα με δύο στοιχεία· το δεύτερο έχει καθυστέρηση 15΄. */
function setup() {
  const sent = new Set<string>();
  const notified: { userIds: string[]; kind: string; title: string; link?: string | null }[] = [];
  const prisma = {
    drasi: { findMany: async () => [DRASI] },
    drasiReminder: {
      create: async ({ data }: { data: { itemId: string; startsAt: Date } }) => {
        const key = `${data.itemId}@${data.startsAt.toISOString()}`;
        if (sent.has(key)) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        sent.add(key);
      },
    },
  };
  const plan = {
    days: async () => [
      {
        date: '2026-10-28',
        items: [
          { id: 'i-1', title: 'Πεζοπορία', startsAt: '2026-10-28T07:00:00.000Z', delayMin: 0, responsibles: [{ id: 'u-maria' }] },
          { id: 'i-2', title: 'Φαγητό', startsAt: '2026-10-28T09:00:00.000Z', delayMin: 15, responsibles: [{ id: 'u-sofia' }, { id: 'u-eleni' }] },
          { id: 'i-3', title: 'Χωρίς υπεύθυνο', startsAt: '2026-10-28T07:00:00.000Z', delayMin: 0, responsibles: [] },
        ],
      },
    ],
  };
  const notifications = { notify: async (userIds: string[], input: { kind: string; title: string; link?: string | null }) => void notified.push({ userIds, ...input }) };
  const jobs = { start: () => ({ fail: () => undefined, finish: async () => undefined }) };
  const service = new DrasiRemindersService(prisma as never, plan as never, notifications as never, jobs as never);
  return { service, notified };
}

describe('υπενθυμίσεις «σε 10΄ αρχίζει»', () => {
  it('στους υπευθύνους, 10΄ πριν — μία φορά, όσες φορές κι αν τρέξει το cron', async () => {
    const { service, notified } = setup();
    expect(await service.sendDue(new Date('2026-10-28T06:50:00Z'))).toBe(1);
    expect(await service.sendDue(new Date('2026-10-28T06:51:00Z'))).toBe(0);
    expect(notified).toEqual([
      {
        userIds: ['u-maria'],
        kind: 'reminder',
        title: 'Σε 10΄ αρχίζει «Πεζοπορία» — δράση «Κατασκήνωση» · έχεις την ευθύνη',
        link: '/draseis/d-1/programma/i-1',
      },
    ]);
  });

  it('με τη διορθωμένη ώρα: η καθυστέρηση μετακινεί και την υπενθύμιση', async () => {
    const { service, notified } = setup();
    expect(await service.sendDue(new Date('2026-10-28T08:50:00Z'))).toBe(0);
    expect(await service.sendDue(new Date('2026-10-28T09:05:00Z'))).toBe(1);
    expect(notified[0]?.userIds).toEqual(['u-sofia', 'u-eleni']);
  });
});
