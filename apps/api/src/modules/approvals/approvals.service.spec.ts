import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { CollabDocumentRegistry, type CollabAccess } from '../collab/collab-documents';
import { ApprovalsService } from './approvals.service';

const DRASI = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const DOC = `drasi:${DRASI}:item:${ITEM}`;
const TITLE = 'στο «Πεζοπορία» — δράση «Κατασκήνωση»';

const user = (id: string) => ({ id, firstName: id, lastName: 'Χ', topikoId: 't-1' }) as RequestUser;
const MARIA = user('u-maria'); // υπεύθυνη του στοιχείου: γράφει
const ARXIGOS = user('u-arxigos'); // εγκρίνει
const SOFIA = user('u-sofia'); // μόνο βλέπει

interface ApprovalRow {
  document: string;
  status: string;
  requestedById: string | null;
  requestedAt: Date | null;
  decidedById: string | null;
  decidedAt: Date | null;
  approvedVersionId: string | null;
  returnNote: string | null;
  changedAfter: boolean;
}

function setup() {
  let content: Record<string, unknown> = { description: 'Πορεία από το ρέμα.' };
  const versions = new Map<string, Record<string, unknown>>();
  const rows: ApprovalRow[] = [];
  const access: Record<string, CollabAccess | null> = { 'u-maria': 'write', 'u-arxigos': 'write', 'u-sofia': 'read' };

  const registry = new CollabDocumentRegistry();
  registry.register({
    kind: 'drasi:item',
    arity: 2,
    access: async (u) => access[u.id] ?? null,
    seed: async () => true,
    project: async () => undefined,
    about: async () => ({ title: TITLE, link: `/draseis/${DRASI}/programma/${ITEM}`, watchers: ['u-maria'], activity: { room: `drasi:${DRASI}:room`, topic: 'comment:item' } }),
    snapshot: () => content,
    present: (c) => [{ key: 'description', label: 'Προγραμματικό', text: String(c.description ?? '') }],
    approval: {
      field: 'description',
      approvers: async () => ['u-arxigos', 'u-admin'],
      canDecide: async (u) => u.id === 'u-arxigos',
    },
  });
  registry.register({ kind: 'drasi:room', arity: 1, room: true, access: async (u) => (access[u.id] ? 'read' : null), seed: async () => true, project: async () => undefined });

  const find = (document: string) => rows.find((r) => r.document === document);
  const prisma = {
    docApproval: {
      findUnique: async ({ where }: { where: { document: string } }) => {
        const row = find(where.document);
        return row ? { ...row, requestedBy: row.requestedById ? { id: row.requestedById, firstName: row.requestedById, lastName: 'Χ' } : null, decidedBy: row.decidedById ? { id: row.decidedById, firstName: row.decidedById, lastName: 'Χ' } : null } : null;
      },
      upsert: async ({ where, create, update }: { where: { document: string }; create: Partial<ApprovalRow>; update: Partial<ApprovalRow> }) => {
        const row = find(where.document);
        if (row) Object.assign(row, update);
        else rows.push({ document: where.document, status: 'PROXEIRO', requestedById: null, requestedAt: null, decidedById: null, decidedAt: null, approvedVersionId: null, returnNote: null, changedAfter: false, ...create });
      },
      update: async ({ where, data }: { where: { document: string }; data: Partial<ApprovalRow> }) => Object.assign(find(where.document)!, data),
      findMany: async ({ where }: { where: { document: { startsWith: string } } }) => rows.filter((r) => r.document.startsWith(where.document.startsWith)),
      deleteMany: async ({ where }: { where: { document: string | { startsWith: string } } }) => {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const d = rows[i]!.document;
          if (typeof where.document === 'string' ? d === where.document : d.startsWith(where.document.startsWith)) rows.splice(i, 1);
        }
      },
    },
    collabVersion: {
      findUnique: async ({ where }: { where: { id: string } }) => (versions.has(where.id) ? { id: where.id, content: versions.get(where.id), createdAt: new Date() } : null),
    },
  };

  const written: ((name: string, writers: ReadonlySet<string>) => void)[] = [];
  const removed: ((name: string, prefix: boolean) => Promise<void>)[] = [];
  const broadcasts: string[] = [];
  const activity: string[] = [];
  const collab = {
    registry,
    documentAccess: async (u: RequestUser, name: string) => {
      const target = registry.resolve(name);
      return target ? target.type.access(u, target.ids) : null;
    },
    flush: async () => undefined,
    broadcast: (name: string, change: { topic: string }) => broadcasts.push(`${name}:${change.topic}`),
    apiChanged: (change: { room: string; topic: string }) => activity.push(`${change.room}:${change.topic}`),
    onDocumentWritten: (l: (typeof written)[number]) => written.push(l),
    onRemoved: (l: (typeof removed)[number]) => removed.push(l),
  };
  const history = {
    milestone: async (_name: string, label: string) => {
      const id = `v-${versions.size + 1}-${label}`;
      versions.set(id, { ...content });
      return id;
    },
    current: async () => content,
  };
  const notified: { userIds: string[]; kind: string; title: string }[] = [];
  const notifications = { notify: async (userIds: string[], input: { kind: string; title: string }) => void notified.push({ userIds: [...userIds].sort(), kind: input.kind, title: input.title }) };
  const comments: { by: string; field: string | null | undefined; body: string; notify: boolean | undefined }[] = [];
  const commentsService = {
    create: async (u: RequestUser, input: { field?: string | null; body: string }, _origin: string | null, options: { notify?: boolean } = {}) =>
      void comments.push({ by: u.id, field: input.field, body: input.body, notify: options.notify }),
  };

  const service = new ApprovalsService(prisma as never, collab as never, history as never, notifications as never, commentsService as never);
  service.onModuleInit();
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
  const write = async (description: string) => {
    content = { description };
    written.forEach((l) => l(DOC, new Set(['u-maria'])));
    await settled();
  };
  return { service, rows, notified, comments, broadcasts, activity, removed, settled, write };
}

describe('έγκριση προγραμματικών και γευμάτων', () => {
  it('«Για έλεγχο»: το ζητά όποιος γράφει — και το μαθαίνουν όσοι εγκρίνουν', async () => {
    const { service, rows, notified, settled } = setup();
    await expect(service.request(SOFIA, DOC, null)).rejects.toThrow(/γράφει/);
    await service.request(MARIA, DOC, null);
    await settled();

    expect(rows[0]?.status).toBe('ELEGXOS');
    expect(notified).toEqual([{ userIds: ['u-admin', 'u-arxigos'], kind: 'approval', title: `Για έλεγχο ${TITLE}` }]);
  });

  it('«Έγκριση»: μόνο ο Αρχηγός της δράσης ή διαχειριστής — με ορόσημο στο ιστορικό, και το μαθαίνουν οι υπεύθυνοι', async () => {
    const { service, rows, notified, settled } = setup();
    await service.request(MARIA, DOC, null);
    await settled();
    notified.length = 0;

    await expect(service.approve(MARIA, DOC, null)).rejects.toThrow(/Εγκρίνει/);
    await service.approve(ARXIGOS, DOC, null);
    await settled();

    expect(rows[0]).toMatchObject({ status: 'EGKRITHIKE', decidedById: 'u-arxigos', approvedVersionId: 'v-1-Εγκρίθηκε', changedAfter: false });
    expect(notified).toEqual([{ userIds: ['u-maria'], kind: 'approval', title: `Εγκρίθηκε ${TITLE}` }]);
  });

  it('«Επιστροφή»: θέλει σχόλιο, που μπαίνει στα σχόλια του κειμένου — μία ειδοποίηση, όχι δύο', async () => {
    const { service, rows, comments, notified, settled } = setup();
    await service.request(MARIA, DOC, null);
    await settled();
    notified.length = 0;

    await expect(service.giveBack(ARXIGOS, DOC, '  ', null)).rejects.toThrow(/σχόλιο/);
    await service.giveBack(ARXIGOS, DOC, 'Λείπει η εναλλακτική αν βρέξει.', null);
    await settled();

    expect(rows[0]).toMatchObject({ status: 'PROXEIRO', returnNote: 'Λείπει η εναλλακτική αν βρέξει.' });
    expect(comments).toEqual([{ by: 'u-arxigos', field: 'description', body: 'Λείπει η εναλλακτική αν βρέξει.', notify: false }]);
    expect(notified).toEqual([{ userIds: ['u-maria'], kind: 'approval', title: `Επιστροφή για διορθώσεις ${TITLE}` }]);
  });

  it('αλλαγή μετά την έγκριση: μένει «Εγκρίθηκε» με σήμα, και το μαθαίνει όποιος ενέκρινε — μία φορά', async () => {
    const { service, rows, notified, write, settled } = setup();
    await service.approve(ARXIGOS, DOC, null);
    await settled();
    notified.length = 0;

    await write('Πορεία από το ρέμα. Και βροχή: στο αμφιθέατρο.');
    await write('Πορεία από το ρέμα. Και βροχή: στο αμφιθέατρο!');
    expect(rows[0]).toMatchObject({ status: 'EGKRITHIKE', changedAfter: true });
    expect(notified).toEqual([{ userIds: ['u-arxigos'], kind: 'approval', title: `Άλλαξε μετά την έγκριση ${TITLE}` }]);

    // Γύρισε όπως εγκρίθηκε: χωρίς σήμα.
    await write('Πορεία από το ρέμα.');
    expect(rows[0]?.changedAfter).toBe(false);
  });

  it('σύγκριση: η εγκεκριμένη μορφή δίπλα στην τωρινή', async () => {
    const { service, write, settled } = setup();
    await service.approve(ARXIGOS, DOC, null);
    await settled();
    await write('Νέα πορεία.');

    const compare = await service.compare(SOFIA, DOC);
    expect(compare.approved[0]?.text).toBe('Πορεία από το ρέμα.');
    expect(compare.current[0]?.text).toBe('Νέα πορεία.');
  });

  it('η κατάσταση λέει και τι μπορεί ο χρήστης', async () => {
    const { service } = setup();
    expect(await service.state(MARIA, DOC)).toMatchObject({ status: 'PROXEIRO', canRequest: true, canDecide: false });
    expect(await service.state(ARXIGOS, DOC)).toMatchObject({ canRequest: true, canDecide: true });
    expect(await service.state(SOFIA, DOC)).toMatchObject({ canRequest: false, canDecide: false });
  });

  it('σύνοψη της δράσης: όποιος βλέπει τη δράση', async () => {
    const { service } = setup();
    await service.request(MARIA, DOC, null);
    expect(await service.summary(SOFIA, DRASI)).toEqual([{ document: DOC, status: 'ELEGXOS', changedAfter: false }]);
    await expect(service.summary(user('u-xenos'), DRASI)).rejects.toThrow(/δεν βρέθηκε/);
  });

  it('κάθε αλλαγή φτάνει ζωντανά (έγγραφο + δωμάτιο της δράσης)· σβήνεται μαζί με το έγγραφο', async () => {
    const { service, rows, broadcasts, activity, removed } = setup();
    await service.request(MARIA, DOC, 'tab-1');
    expect(broadcasts).toEqual([`${DOC}:approval`]);
    expect(activity).toEqual([`drasi:${DRASI}:room:approvals`]);
    await Promise.all(removed.map((l) => l(`drasi:${DRASI}:`, true)));
    expect(rows).toHaveLength(0);
  });
});
