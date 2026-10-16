import { describe, expect, it } from 'vitest';
import { Doc } from 'yjs';
import type { RequestUser } from '../../common/auth/types';
import { CollabDocumentRegistry, textDocument, type CollabAccess } from './collab-documents';
import { CollabHistoryService, sameContent } from './collab-history.service';

const NOTE = 'note:11111111-1111-4111-8111-111111111111';
const user = (id: string) => ({ id, firstName: id === 'u-maria' ? 'Μαρία' : 'Σοφία', lastName: 'Π', topikoId: 't-1' }) as RequestUser;
const MARIA = user('u-maria');
const SOFIA = user('u-sofia');
const PEOPLE = [
  { id: 'u-maria', firstName: 'Μαρία', lastName: 'Π' },
  { id: 'u-sofia', firstName: 'Σοφία', lastName: 'Π' },
];

interface VersionRow {
  id: string;
  document: string;
  content: Record<string, unknown>;
  writerIds: string[];
  label: string | null;
  createdAt: Date;
}

/** Ένα κοινό έγγραφο με ένα κείμενο, στη μνήμη, και το ιστορικό του. */
function setup(options: { access?: Record<string, CollabAccess | null> } = {}) {
  const access = options.access ?? { 'u-maria': 'write', 'u-sofia': 'read' };
  const registry = new CollabDocumentRegistry();
  registry.register(
    textDocument({
      kind: 'note',
      arity: 1,
      fields: ['text'],
      labels: { text: 'Κείμενο' },
      access: async (u) => access[u.id] ?? null,
      load: async () => ({ text: '' }),
      save: async () => undefined,
      people: async () => PEOPLE,
    }),
  );
  const doc = new Doc();
  doc.getText('text').insert(0, 'Πρώτο κείμενο');
  const documents = new Map<string, Doc>([[NOTE, doc]]);

  let clock = 0;
  const versions: VersionRow[] = [];
  const reads: { document: string; userId: string; versionId: string; readAt: Date }[] = [];
  const byDate = (a: VersionRow, b: VersionRow) => b.createdAt.getTime() - a.createdAt.getTime();
  const matchDocument = (row: { document: string }, where: { document?: unknown }) =>
    typeof where.document === 'string'
      ? row.document === where.document
      : where.document && typeof where.document === 'object' && 'startsWith' in where.document
        ? row.document.startsWith((where.document as { startsWith: string }).startsWith)
        : true;
  const prisma = {
    collabVersion: {
      create: async ({ data }: { data: Omit<VersionRow, 'id' | 'createdAt'> }) => {
        const row = { ...data, id: `v-${versions.length + 1}`, createdAt: new Date(Date.UTC(2026, 9, 16, 10, 0, (clock += 1))) };
        versions.push(row);
        return { id: row.id };
      },
      findFirst: async ({ where }: { where: { document: string; createdAt?: { lt: Date } } }) =>
        versions
          .filter((v) => v.document === where.document && (!where.createdAt || v.createdAt < where.createdAt.lt))
          .sort(byDate)[0] ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => versions.find((v) => v.id === where.id) ?? null,
      findMany: async ({ where, skip = 0, take }: { where: { document: string; label?: null }; skip?: number; take?: number }) =>
        versions
          .filter((v) => v.document === where.document && (where.label === undefined || v.label === null))
          .sort(byDate)
          .slice(skip, take === undefined ? undefined : skip + take),
      update: async ({ where, data }: { where: { id: string }; data: Partial<VersionRow> }) => Object.assign(versions.find((v) => v.id === where.id)!, data),
      deleteMany: async ({ where }: { where: { id?: { in: string[] }; document?: unknown } }) => {
        for (let i = versions.length - 1; i >= 0; i -= 1) {
          const v = versions[i]!;
          if (where.id ? where.id.in.includes(v.id) : matchDocument(v, where)) versions.splice(i, 1);
        }
      },
    },
    docRead: {
      findUnique: async ({ where }: { where: { document_userId: { document: string; userId: string } } }) =>
        reads.find((r) => r.document === where.document_userId.document && r.userId === where.document_userId.userId) ?? null,
      upsert: async ({ where, create, update }: { where: { document_userId: { document: string; userId: string } }; create: Omit<(typeof reads)[number], 'readAt'>; update: Partial<(typeof reads)[number]> }) => {
        const row = reads.find((r) => r.document === where.document_userId.document && r.userId === where.document_userId.userId);
        if (row) Object.assign(row, update);
        else reads.push({ readAt: new Date(), ...create });
      },
      findMany: async ({ where }: { where: { document: string } }) =>
        reads.filter((r) => r.document === where.document).map((r) => ({ ...r, user: PEOPLE.find((p) => p.id === r.userId)! })),
      deleteMany: async ({ where }: { where: { document?: unknown } }) => {
        for (let i = reads.length - 1; i >= 0; i -= 1) if (matchDocument(reads[i]!, where)) reads.splice(i, 1);
      },
    },
    collabDocument: { findUnique: async () => null },
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => PEOPLE.filter((p) => where.id.in.includes(p.id)) },
  };

  const listeners = {
    written: [] as ((name: string, writers: ReadonlySet<string>) => void)[],
    idle: [] as ((name: string) => void)[],
    milestone: [] as ((name: string, label: string) => Promise<void>)[],
    removed: [] as ((name: string, prefix: boolean) => Promise<void>)[],
  };
  const broadcasts: string[] = [];
  const collab = {
    registry,
    hocuspocus: {
      documents,
      openDirectConnection: async () => ({
        transact: async (fn: (d: Doc) => void) => fn(doc),
        disconnect: async () => listeners.written.forEach((l) => l(NOTE, new Set([MARIA.id]))),
      }),
    },
    documentAccess: async (u: RequestUser, name: string) => {
      const target = registry.resolve(name);
      return target ? target.type.access(u, target.ids) : null;
    },
    isWritable: () => true,
    broadcast: (name: string, change: { topic: string }) => broadcasts.push(`${name}:${change.topic}`),
    onDocumentWritten: (l: (typeof listeners.written)[number]) => listeners.written.push(l),
    onDocumentIdle: (l: (typeof listeners.idle)[number]) => listeners.idle.push(l),
    onMilestone: (l: (typeof listeners.milestone)[number]) => listeners.milestone.push(l),
    onRemoved: (l: (typeof listeners.removed)[number]) => listeners.removed.push(l),
  };

  const service = new CollabHistoryService(prisma as never, collab as never);
  service.idleMs = 20;
  service.onModuleInit();

  const write = (text: string, by: string) => {
    const t = doc.getText('text');
    t.delete(0, t.length);
    t.insert(0, text);
    listeners.written.forEach((l) => l(NOTE, new Set([by])));
  };
  const idle = async () => {
    listeners.idle.forEach((l) => l(NOTE));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  return { service, versions, reads, broadcasts, listeners, doc, write, idle, wait };
}

describe('ιστορικό εκδόσεων', () => {
  it('έκδοση όταν το έγγραφο σταματήσει να αλλάζει — με όσους έγραψαν από την προηγούμενη', async () => {
    const { versions, write, wait } = setup();
    write('Δεύτερο', 'u-maria');
    write('Τρίτο', 'u-sofia');
    expect(versions).toHaveLength(0);
    await wait(40);
    expect(versions.map((v) => [v.content, v.writerIds.sort(), v.label])).toEqual([[{ text: 'Τρίτο' }, ['u-maria', 'u-sofia'], null]]);
  });

  it('έφυγε και ο τελευταίος: έκδοση αμέσως· ίδιο περιεχόμενο με την προηγούμενη: καμία νέα', async () => {
    const { versions, write, idle, listeners } = setup();
    write('Αλλαγή', 'u-maria');
    await idle();
    expect(versions).toHaveLength(1);
    listeners.written.forEach((l) => l(NOTE, new Set(['u-maria'])));
    await idle();
    expect(versions).toHaveLength(1);
  });

  it('ορόσημο: ετικέτα στην τελευταία έκδοση αν δεν άλλαξε τίποτα — αλλιώς νέα έκδοση με ετικέτα', async () => {
    const { versions, write, idle, listeners } = setup();
    write('Πρακτικά', 'u-maria');
    await idle();
    await Promise.all(listeners.milestone.map((l) => l(NOTE, 'Οριστικοποίηση')));
    expect(versions.map((v) => v.label)).toEqual(['Οριστικοποίηση']);

    write('Μετά', 'u-maria');
    await Promise.all(listeners.milestone.map((l) => l(NOTE, 'Εγκρίθηκε')));
    expect(versions.map((v) => [v.content.text, v.label])).toEqual([
      ['Πρακτικά', 'Οριστικοποίηση'],
      ['Μετά', 'Εγκρίθηκε'],
    ]);
  });

  it('κρατά ως 100 αυτόματες εκδόσεις — τα ορόσημα μένουν όλα', async () => {
    const { service, versions, write, idle, listeners } = setup();
    service.keepAuto = 2;
    write('α', 'u-maria');
    await Promise.all(listeners.milestone.map((l) => l(NOTE, 'Ορόσημο')));
    for (const text of ['β', 'γ', 'δ']) {
      write(text, 'u-maria');
      await idle();
    }
    expect(versions.map((v) => v.content.text).sort()).toEqual(['α', 'γ', 'δ']);
  });

  it('λίστα και προβολή: όποιος βλέπει το έγγραφο — με την προηγούμενη έκδοση για σύγκριση', async () => {
    const { service, write, idle } = setup();
    write('Παλιό', 'u-maria');
    await idle();
    write('Νέο', 'u-sofia');

    const list = await service.list(SOFIA, NOTE);
    // Ό,τι εκκρεμούσε έγινε έκδοση πριν από τη λίστα.
    expect(list.map((v) => v.writers.map((w) => w.id))).toEqual([['u-sofia'], ['u-maria']]);
    const view = await service.get(SOFIA, list[0]!.id);
    expect(view.parts).toEqual([{ key: 'text', label: 'Κείμενο', text: 'Νέο' }]);
    expect(view.previous).toEqual([{ key: 'text', label: 'Κείμενο', text: 'Παλιό' }]);
    await expect(service.list(user('u-xenos'), NOTE)).rejects.toThrow(/δεν βρέθηκε/);
  });

  it('επαναφορά: μόνο όποιος γράφει· η τωρινή μορφή μένει στο ιστορικό και η επαναφορά είναι νέα έκδοση', async () => {
    const { service, versions, doc, write, idle, broadcasts } = setup();
    write('Καλό κείμενο', 'u-maria');
    await idle();
    const good = versions[0]!.id;
    write('Χαλασμένο', 'u-sofia');

    await expect(service.restore(SOFIA, good, null)).rejects.toThrow(/αλλάξεις/);
    await service.restore(MARIA, good, null);

    expect(doc.getText('text').toString()).toBe('Καλό κείμενο');
    expect(versions.map((v) => [v.content.text, v.label, v.writerIds])).toEqual([
      ['Καλό κείμενο', null, ['u-maria']],
      ['Χαλασμένο', null, ['u-sofia']],
      ['Καλό κείμενο', 'Επαναφορά', ['u-maria']],
    ]);
    expect(broadcasts).toContain(`${NOTE}:versions`);
  });

  it('«Το διάβασαν»: όσοι άνοιξαν την τελευταία έκδοση, από τα στελέχη του εγγράφου', async () => {
    const { service, write, idle, listeners } = setup();
    write('Πρακτικά', 'u-maria');
    await idle();
    await service.read(SOFIA, NOTE);
    write('Διόρθωση', 'u-maria');
    await Promise.all(listeners.milestone.map((l) => l(NOTE, 'Οριστικοποίηση')));
    await service.read(MARIA, NOTE);

    const view = await service.readers(SOFIA, NOTE);
    expect(view.version?.label).toBe('Οριστικοποίηση');
    expect(view.audience.map((p) => p.id)).toEqual(['u-maria', 'u-sofia']);
    expect(view.readers.map((r) => [r.person.id, r.current]).sort()).toEqual([
      ['u-maria', true],
      ['u-sofia', false],
    ]);
  });

  it('σβήνεται το έγγραφο: σβήνουν οι εκδόσεις και τα «διάβασαν» του', async () => {
    const { service, versions, reads, write, idle, listeners } = setup();
    write('Κάτι', 'u-maria');
    await idle();
    await service.read(MARIA, NOTE);
    await Promise.all(listeners.removed.map((l) => l('note:', true)));
    expect(versions).toHaveLength(0);
    expect(reads).toHaveLength(0);
  });

  it('ίδιο περιεχόμενο ανεξάρτητα από τη σειρά των κλειδιών (JSONB)', () => {
    expect(sameContent({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true);
    expect(sameContent({ a: 1 }, { a: 2 })).toBe(false);
  });
});
