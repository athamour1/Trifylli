import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisHeadcountService } from './draseis-headcount.service';

const DRASI = 'd-1';
const user = (id: string) => ({ id, topikoId: 't-1' }) as RequestUser;
const ARXIGOS = user('u-arxigos');
const MARIA = user('u-maria');

/** Δύο ενωμοτίες (Αετοί: p1,p2,p3 · Γλάροι: p4,p5) και μια άδεια. */
function setup() {
  const groups = [
    { id: 'g-aetoi', name: 'Αετοί', kind: 'ENOMOTIA', members: ['p1', 'p2', 'p3'] },
    { id: 'g-glaroi', name: 'Γλάροι', kind: 'ENOMOTIA', members: ['p4', 'p5'] },
    { id: 'g-adeia', name: 'Άδεια', kind: 'ENOMOTIA', members: [] as string[] },
  ];
  const headcounts: { id: string; drasiId: string; title: string; groupKind: string; createdById: string; createdAt: Date; completedAt: Date | null; closedAt: Date | null }[] = [];
  const checks: { headcountId: string; groupId: string; absentIds: string[]; total: number; checkedById: string; checkedAt: Date; receivedAt?: Date }[] = [];
  const memberView = (id: string) => ({ participant: { id, user: { firstName: id, lastName: 'Χ' } } });
  const prisma = {
    drasiGroup: {
      findMany: async ({ where }: { where: { kind: string } }) => groups.filter((g) => g.kind === where.kind).map((g) => ({ id: g.id, name: g.name, members: g.members.map(memberView) })),
      findFirst: async ({ where }: { where: { id: string; kind: string } }) => {
        const g = groups.find((x) => x.id === where.id && x.kind === where.kind);
        return g ? { id: g.id, name: g.name, members: g.members.map((participantId) => ({ participantId })) } : null;
      },
    },
    drasiHeadcount: {
      create: async ({ data }: { data: Omit<(typeof headcounts)[number], 'id' | 'createdAt' | 'completedAt' | 'closedAt'> }) => {
        const row = { ...data, id: `h-${headcounts.length + 1}`, createdAt: new Date(), completedAt: null, closedAt: null };
        headcounts.push(row);
        return { id: row.id };
      },
      findFirst: async ({ where }: { where: { id: string } }) => headcounts.find((h) => h.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; completedAt?: null }; data: Partial<(typeof headcounts)[number]> }) => {
        const hit = headcounts.filter((h) => h.id === where.id && (where.completedAt !== null || h.completedAt === null));
        for (const h of hit) Object.assign(h, data);
        return { count: hit.length };
      },
    },
    drasiHeadcountCheck: {
      findUnique: async ({ where }: { where: { headcountId_groupId: { headcountId: string; groupId: string } } }) =>
        checks.find((c) => c.headcountId === where.headcountId_groupId.headcountId && c.groupId === where.headcountId_groupId.groupId) ?? null,
      upsert: async ({ where, create, update }: { where: { headcountId_groupId: { headcountId: string; groupId: string } }; create: (typeof checks)[number]; update: Partial<(typeof checks)[number]> }) => {
        const row = checks.find((c) => c.headcountId === where.headcountId_groupId.headcountId && c.groupId === where.headcountId_groupId.groupId);
        if (row) Object.assign(row, update);
        else checks.push(create);
      },
      findMany: async ({ where }: { where: { headcountId: string } }) => checks.filter((c) => c.headcountId === where.headcountId),
    },
    drasiParticipant: { findMany: async () => [{ userId: 'u-maria' }, { userId: 'u-sofia' }] },
    drasiRole: { findMany: async () => [{ userId: 'u-arxigos' }] },
  };
  const access = { load: async () => ({ id: DRASI, title: 'Κατασκήνωση' }) };
  const notified: { userIds: string[]; title: string }[] = [];
  const notifications = { notify: async (userIds: string[], input: { title: string }) => void notified.push({ userIds: [...userIds].sort(), title: input.title }) };
  const service = new DraseisHeadcountService(prisma as never, access as never, notifications as never);
  const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
  return { service, checks, headcounts, notified, at };
}

describe('καταμέτρηση της δράσης', () => {
  it('ξεκινά ο Αρχηγός — το μαθαίνουν τα στελέχη· χωρίς ομάδες με μέλη: όχι', async () => {
    const { service, notified } = setup();
    await service.start(ARXIGOS, DRASI, 'Αναχώρηση από Μέγαρα', 'ENOMOTIA');
    expect(notified).toEqual([{ userIds: ['u-maria', 'u-sofia'], title: 'Καταμέτρηση «Αναχώρηση από Μέγαρα» — δράση «Κατασκήνωση»' }]);
    await expect(service.start(ARXIGOS, DRASI, 'Σκηνές', 'SKINI')).rejects.toThrow(/ομάδες/);
  });

  it('όποιος μετρά: όσοι λείπουν μετρούν μόνο αν είναι μέλη — και ο Αρχηγός μαθαίνει πόσοι, όχι ποιοι', async () => {
    const { service, checks, notified, at } = setup();
    const { id } = await service.start(ARXIGOS, DRASI, 'Αναχώρηση', 'ENOMOTIA');
    notified.length = 0;
    await service.check(MARIA, DRASI, id, 'g-aetoi', ['p3', 'p9'], at('10:00'));

    expect(checks[0]).toMatchObject({ absentIds: ['p3'], total: 3, checkedById: 'u-maria' });
    expect(notified).toEqual([{ userIds: ['u-arxigos'], title: 'Καταμέτρηση «Αναχώρηση»: λείπει 1 από «Αετοί»' }]);
  });

  it('χωρίς σήμα: μια παλιότερη μέτρηση που φτάνει αργότερα δεν σβήνει τη νεότερη', async () => {
    const { service, checks, at } = setup();
    const { id } = await service.start(ARXIGOS, DRASI, 'Αναχώρηση', 'ENOMOTIA');
    await service.check(MARIA, DRASI, id, 'g-glaroi', [], at('10:05'));
    await service.check(user('u-sofia'), DRASI, id, 'g-glaroi', ['p4'], at('10:00'));
    expect(checks[0]).toMatchObject({ absentIds: [], checkedById: 'u-maria' });
  });

  it('μετρήθηκαν όλες οι ομάδες (οι άδειες δεν μετράνε): μία ειδοποίηση με το σύνολο', async () => {
    const { service, headcounts, notified, at } = setup();
    const { id } = await service.start(ARXIGOS, DRASI, 'Αναχώρηση', 'ENOMOTIA');
    notified.length = 0;
    await service.check(MARIA, DRASI, id, 'g-aetoi', [], at('10:00'));
    await service.check(MARIA, DRASI, id, 'g-glaroi', ['p5'], at('10:01'));
    await service.check(MARIA, DRASI, id, 'g-glaroi', ['p5'], at('10:02'));

    expect(headcounts[0]?.completedAt).toBeInstanceOf(Date);
    // Η δεύτερη μέτρηση των Γλάρων, με τους ίδιους απόντες, δεν ξαναειδοποιεί.
    expect(notified.map((n) => n.title)).toEqual([
      'Καταμέτρηση «Αναχώρηση»: λείπει 1 από «Γλάροι»',
      'Καταμέτρηση «Αναχώρηση»: 4/5 — λείπει 1',
    ]);
  });
});
