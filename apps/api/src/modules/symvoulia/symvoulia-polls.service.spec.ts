import { describe, expect, it } from 'vitest';
import { Doc } from 'yjs';
import type { RequestUser } from '../../common/auth/types';
import { SymvouliaPollsService } from './symvoulia-polls.service';

const SYMVOULIO = 's-1';
const user = (id: string, firstName = id) => ({ id, firstName, lastName: 'Χ', topikoId: 't-1' }) as RequestUser;
const PROEDROS = user('u-proedros', 'Άννα');
const MARIA = user('u-maria', 'Μαρία');
const SOFIA = user('u-sofia', 'Σοφία');
const XENOS = user('u-xenos', 'Ξένος');

function setup() {
  const participants = ['u-proedros', 'u-maria', 'u-sofia'];
  const polls: { id: string; symvoulioId: string; question: string; options: string[]; secret: boolean; createdById: string; createdAt: Date; closedAt: Date | null }[] = [];
  const votes: { pollId: string; userId: string; choice: number | null; votedAt?: Date }[] = [];
  const ballots: { pollId: string; choice: number }[] = [];
  const doc = new Doc();
  doc.getText('minutes').insert(0, 'Συζητήθηκε η εκδρομή.');
  const person = (id: string) => ({ id, firstName: id === 'u-maria' ? 'Μαρία' : id === 'u-sofia' ? 'Σοφία' : 'Άννα', lastName: 'Χ' });
  const withRelations = (poll: (typeof polls)[number]) => ({
    ...poll,
    createdBy: person(poll.createdById),
    votes: votes.filter((v) => v.pollId === poll.id),
    ballots: ballots.filter((b) => b.pollId === poll.id),
    symvoulio: { title: 'Μηνιαίο' },
  });
  const prisma = {
    symvoulioParticipant: { findMany: async () => participants.map((id) => ({ userId: id, user: person(id) })) },
    symvoulio: { findUnique: async () => ({ title: 'Μηνιαίο' }) },
    symvoulioPoll: {
      create: async ({ data }: { data: Omit<(typeof polls)[number], 'id' | 'createdAt' | 'closedAt'> }) => {
        const row = { ...data, id: `p-${polls.length + 1}`, createdAt: new Date(Date.now() + polls.length), closedAt: null };
        polls.push(row);
        return { id: row.id };
      },
      findMany: async ({ where }: { where: { symvoulioId: string; closedAt?: null } }) =>
        polls.filter((p) => p.symvoulioId === where.symvoulioId && (where.closedAt !== null || !p.closedAt)).reverse().map(withRelations),
      findFirst: async ({ where }: { where: { id: string } }) => polls.find((p) => p.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => withRelations(polls.find((p) => p.id === where.id)!),
      updateMany: async ({ where, data }: { where: { id: string; closedAt: null }; data: { closedAt: Date } }) => {
        const hit = polls.filter((p) => p.id === where.id && !p.closedAt);
        for (const p of hit) Object.assign(p, data);
        return { count: hit.length };
      },
      deleteMany: async () => undefined,
    },
    symvoulioPollVote: {
      upsert: async ({ create, update }: { create: (typeof votes)[number]; update: Partial<(typeof votes)[number]> }) => {
        const row = votes.find((v) => v.pollId === create.pollId && v.userId === create.userId);
        if (row) Object.assign(row, update);
        else votes.push(create);
      },
      create: ({ data }: { data: (typeof votes)[number] }) => async () => {
        if (votes.some((v) => v.pollId === data.pollId && v.userId === data.userId)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        votes.push(data);
      },
    },
    symvoulioPollBallot: { create: ({ data }: { data: (typeof ballots)[number] }) => async () => void ballots.push(data) },
    // Οι εντολές της συναλλαγής εκτελούνται με τη σειρά· η πρώτη που αποτυγχάνει σταματά τις υπόλοιπες.
    $transaction: async (steps: (() => Promise<void>)[]) => {
      for (const step of steps) await step();
    },
  };
  const access: Record<string, 'read' | 'write' | null> = { 'u-proedros': 'write', 'u-maria': 'read', 'u-sofia': 'read', 'u-xenos': null };
  const collab = {
    documentAccess: async (u: RequestUser) => access[u.id] ?? null,
    hocuspocus: {
      openDirectConnection: async () => ({ transact: async (fn: (d: Doc) => void) => fn(doc), disconnect: async () => undefined }),
    },
  };
  const notified: { userIds: string[]; title: string }[] = [];
  const notifications = { notify: async (userIds: string[], input: { title: string }) => void notified.push({ userIds: [...userIds].sort(), title: input.title }) };
  const service = new SymvouliaPollsService(prisma as never, collab as never, notifications as never);
  return { service, doc, notified, polls };
}

describe('ψηφοφορίες στα συμβούλια', () => {
  it('την ανοίγει όποιος γράφει το συμβούλιο — Ναι/Όχι/Αποχή εξ ορισμού — και το μαθαίνουν οι συμμετέχοντες', async () => {
    const { service, notified } = setup();
    await expect(service.open(MARIA, SYMVOULIO, { question: 'Εκδρομή;' })).rejects.toThrow(/γράφει/);
    await service.open(PROEDROS, SYMVOULIO, { question: 'Εκδρομή στις 25/10;' });

    const [poll] = await service.list(MARIA, SYMVOULIO);
    expect(poll?.options).toEqual(['Ναι', 'Όχι', 'Αποχή']);
    expect(poll?.canVote).toBe(true);
    expect(notified).toEqual([{ userIds: ['u-maria', 'u-sofia'], title: 'Ψηφοφορία στο συμβούλιο «Μηνιαίο»' }]);
  });

  it('επώνυμη: ψηφίζουν οι συμμετέχοντες, η ψήφος αλλάζει όσο είναι ανοιχτή, και φαίνεται ποιος ψήφισε τι', async () => {
    const { service } = setup();
    const { id } = await service.open(PROEDROS, SYMVOULIO, { question: 'Εκδρομή;' });
    await service.vote(MARIA, SYMVOULIO, id, 1);
    await service.vote(MARIA, SYMVOULIO, id, 0);
    await service.vote(SOFIA, SYMVOULIO, id, 0);
    await expect(service.vote(XENOS, SYMVOULIO, id, 0)).rejects.toThrow(/δεν βρέθηκε/);

    const [poll] = await service.list(PROEDROS, SYMVOULIO);
    expect(poll?.counts).toEqual([2, 0, 0]);
    expect(poll?.voters.map((v) => [v.id, v.choice])).toEqual([
      ['u-proedros', null],
      ['u-maria', 0],
      ['u-sofia', 0],
    ]);
  });

  it('μυστική: μετράει μία φορά, και κανείς δεν βλέπει τι ψήφισε ο άλλος', async () => {
    const { service } = setup();
    const { id } = await service.open(PROEDROS, SYMVOULIO, { question: 'Νέος ταμίας: Σοφία;', secret: true });
    await service.vote(MARIA, SYMVOULIO, id, 0);
    await expect(service.vote(MARIA, SYMVOULIO, id, 1)).rejects.toThrow(/δεν αλλάζει/);

    const [poll] = await service.list(PROEDROS, SYMVOULIO);
    expect(poll?.counts).toEqual([1, 0, 0]);
    expect(poll?.voters.find((v) => v.id === 'u-maria')).toMatchObject({ voted: true, choice: null });
    const [mine] = await service.list(MARIA, SYMVOULIO);
    expect(mine).toMatchObject({ mine: { voted: true, choice: null }, canVote: false });
  });

  it('κλείνει: το αποτέλεσμα στο τέλος των πρακτικών, μία φορά — και δεν ψηφίζεται πια', async () => {
    const { service, doc } = setup();
    const { id } = await service.open(PROEDROS, SYMVOULIO, { question: 'Εκδρομή;' });
    await service.vote(MARIA, SYMVOULIO, id, 0);
    await service.close(PROEDROS, SYMVOULIO, id);
    await service.close(PROEDROS, SYMVOULIO, id);

    const minutes = doc.getText('minutes').toString();
    expect(minutes.startsWith('Συζητήθηκε η εκδρομή.\n\n**Ψηφοφορία:** Εκδρομή;\nΝαι 1 · Όχι 0 · Αποχή 0 — ψήφισαν 1 από 3')).toBe(true);
    expect(minutes.match(/\*\*Ψηφοφορία/g)).toHaveLength(1);
    await expect(service.vote(SOFIA, SYMVOULIO, id, 0)).rejects.toThrow(/έκλεισε/);
  });

  it('πριν από την οριστικοποίηση κλείνουν όσες είναι ανοιχτές', async () => {
    const { service, polls, doc } = setup();
    await service.open(PROEDROS, SYMVOULIO, { question: 'Α;' });
    await service.open(PROEDROS, SYMVOULIO, { question: 'Β;', options: ['Σάββατο', 'Κυριακή'] });
    await service.closeAllOpen(PROEDROS, SYMVOULIO);
    expect(polls.every((p) => p.closedAt)).toBe(true);
    expect(doc.getText('minutes').toString()).toContain('Σάββατο 0 · Κυριακή 0');
  });
});
