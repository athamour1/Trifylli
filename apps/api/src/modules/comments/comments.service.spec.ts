import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { CollabDocumentRegistry, type CollabAccess, type CollabDocumentType } from '../collab/collab-documents';
import { CommentsService } from './comments.service';

const DRASI = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const DOC = `drasi:${DRASI}:item:${ITEM}`;
const ANCHOR = { start: 'AQKs3c4FAA==', end: 'AQKs3c4FBQE=' };

const user = (id: string, firstName = 'Μαρία', lastName = 'Παππά') => ({ id, firstName, lastName, topikoId: 't-1' }) as RequestUser;
const MARIA = user('u-maria');
const SOFIA = user('u-sofia', 'Σοφία', 'Κων');
const ELENI = user('u-eleni', 'Ελένη', 'Δημ');
const XENOS = user('u-xenos', 'Ξένος', 'Χ');

interface Row {
  id: string;
  document: string;
  field: string | null;
  anchorStart: string | null;
  anchorEnd: string | null;
  quote: string | null;
  body: string;
  mentionIds: string[];
  authorId: string | null;
  parentId: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  editedAt: Date | null;
  createdAt: Date;
}

const PEOPLE = [
  { id: MARIA.id, firstName: 'Μαρία', lastName: 'Παππά' },
  { id: SOFIA.id, firstName: 'Σοφία', lastName: 'Κων' },
  { id: ELENI.id, firstName: 'Ελένη', lastName: 'Δημ' },
];

/** Τα σχόλια στη μνήμη, ένα είδος εγγράφου (στοιχείο του ωρολογίου) και ό,τι ειδοποιείται. */
function setup(options: { access?: Record<string, CollabAccess | null>; watchers?: string[] } = {}) {
  const rows: Row[] = [];
  let next = 0;
  const person = (id: string | null) => PEOPLE.find((p) => p.id === id) ?? null;
  const view = (row: Row) => ({ ...row, author: person(row.authorId), resolvedBy: person(row.resolvedById) });
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return (value as Record<string, unknown>[]).some((part) => matches(row, part));
      if (value && typeof value === 'object' && 'startsWith' in value) return String(row[key as keyof Row]).startsWith((value as { startsWith: string }).startsWith);
      return row[key as keyof Row] === value;
    });

  const prisma = {
    comment: {
      create: async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `c-${(next += 1)}`,
          field: null,
          anchorStart: null,
          anchorEnd: null,
          quote: null,
          mentionIds: [],
          authorId: null,
          parentId: null,
          resolvedAt: null,
          resolvedById: null,
          editedAt: null,
          createdAt: new Date(Date.now() + next),
          document: '',
          body: '',
          ...data,
        };
        rows.push(row);
        return view(row);
      },
      // Αντίγραφα, όπως το Prisma: μια αλλαγή μετά δεν αλλάζει ό,τι διαβάστηκε πριν.
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row, mentionIds: [...row.mentionIds] } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row, mentionIds: [...row.mentionIds] } : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).map(view),
      count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return view(row);
      },
      delete: async ({ where }: { where: { id: string } }) => {
        for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i]!.id === where.id || rows[i]!.parentId === where.id) rows.splice(i, 1);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i]!, where)) rows.splice(i, 1);
      },
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => PEOPLE.filter((p) => where.id.in.includes(p.id)),
    },
  };

  const access = options.access ?? { [MARIA.id]: 'write', [SOFIA.id]: 'read', [ELENI.id]: 'write' };
  const registry = new CollabDocumentRegistry();
  const item: CollabDocumentType = {
    kind: 'drasi:item',
    arity: 2,
    access: async (u) => access[u.id] ?? null,
    seed: async () => true,
    project: async () => undefined,
    about: async () => ({
      title: 'στο «Πεζοπορία» — δράση «Κατασκήνωση»',
      link: `/draseis/${DRASI}/programma/${ITEM}`,
      watchers: options.watchers ?? [],
      activity: { room: `drasi:${DRASI}:room`, topic: 'comment:item' },
    }),
    people: async () => PEOPLE,
  };
  registry.register(item);
  registry.register({ kind: 'drasi:room', arity: 1, room: true, access: async () => 'read', seed: async () => true, project: async () => undefined });

  const broadcasts: { name: string; topic: string; origin: string | null }[] = [];
  const activity: { room: string; topic: string; by: string | null }[] = [];
  const removedListeners: ((name: string, prefix: boolean) => Promise<void>)[] = [];
  const collab = {
    registry,
    documentAccess: async (u: RequestUser, name: string) => {
      const target = registry.resolve(name);
      return target ? target.type.access(u, target.ids) : null;
    },
    broadcast: (name: string, change: { topic: string; origin: string | null }) => broadcasts.push({ name, topic: change.topic, origin: change.origin }),
    apiChanged: (change: { room: string; topic: string; by: string | null }) => activity.push({ room: change.room, topic: change.topic, by: change.by }),
    onRemoved: (listener: (name: string, prefix: boolean) => Promise<void>) => removedListeners.push(listener),
  };
  const notified: { userIds: string[]; kind: string; title: string; link?: string | null }[] = [];
  const notifications = {
    notify: async (userIds: string[], input: { kind: string; title: string; link?: string | null }) => void notified.push({ userIds: [...userIds].sort(), ...input }),
  };

  const service = new CommentsService(prisma as never, collab as never, notifications as never);
  service.onModuleInit();
  /** Οι ειδοποιήσεις φεύγουν χωρίς αναμονή — περιμένουμε να τελειώσουν. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
  const removed = (name: string, prefix: boolean) => Promise.all(removedListeners.map((listener) => listener(name, prefix)));
  return { service, rows, broadcasts, activity, notified, settled, removed };
}

describe('σχόλια στα κοινά έγγραφα', () => {
  it('σχολιάζει όποιος βλέπει το έγγραφο, ακόμα κι αν δεν το γράφει', async () => {
    const { service, rows } = setup();
    const comment = await service.create(SOFIA, { document: DOC, field: 'description', anchor: ANCHOR, quote: 'το μονοπάτι', body: 'Πόσο απέχει;' }, null);

    expect(comment.author).toEqual(PEOPLE[1]);
    expect(comment.anchor).toEqual(ANCHOR);
    expect(rows).toHaveLength(1);
  });

  it('όποιος δεν βλέπει το έγγραφο: σαν να μην υπάρχει', async () => {
    const { service } = setup();
    await expect(service.create(XENOS, { document: DOC, body: 'Γεια' }, null)).rejects.toThrow(/δεν βρέθηκε/);
    await expect(service.list(XENOS, DOC)).rejects.toThrow(/δεν βρέθηκε/);
  });

  it('δωμάτια και άγνωστα ονόματα δεν σχολιάζονται', async () => {
    const { service } = setup();
    await expect(service.create(MARIA, { document: `drasi:${DRASI}:room`, body: 'Γεια' }, null)).rejects.toThrow(/δεν βρέθηκε/);
    await expect(service.create(MARIA, { document: 'whatever', body: 'Γεια' }, null)).rejects.toThrow(/δεν βρέθηκε/);
  });

  it('κενό σχόλιο ή φράση χωρίς κείμενο ή χαλασμένη θέση: όχι', async () => {
    const { service } = setup();
    await expect(service.create(MARIA, { document: DOC, body: '   ' }, null)).rejects.toThrow(/Κενό/);
    await expect(service.create(MARIA, { document: DOC, anchor: ANCHOR, body: 'Α' }, null)).rejects.toThrow(/κείμενο/);
    await expect(service.create(MARIA, { document: DOC, field: 'description', anchor: { start: '<script>', end: 'x' }, body: 'Α' }, null)).rejects.toThrow(/θέση/);
  });

  it('απάντηση σε απάντηση: πάει στο ίδιο νήμα, χωρίς δική της φράση', async () => {
    const { service } = setup();
    const root = await service.create(MARIA, { document: DOC, field: 'description', anchor: ANCHOR, quote: 'μονοπάτι', body: 'Πόσο απέχει;' }, null);
    const reply = await service.create(SOFIA, { document: DOC, parentId: root.id, body: '3 χλμ.' }, null);
    const again = await service.create(ELENI, { document: DOC, parentId: reply.id, field: 'description', anchor: ANCHOR, body: 'Ευχαριστώ' }, null);

    expect(again.parentId).toBe(root.id);
    expect(again.anchor).toBeNull();
    const threads = await service.list(MARIA, DOC);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies.map((r) => r.body)).toEqual(['3 χλμ.', 'Ευχαριστώ']);
  });

  it('@αναφορά: ειδοποιείται μόνο όποιο στέλεχος είναι στη λίστα — όχι ο ίδιος, όχι ξένοι', async () => {
    const { service, notified, settled } = setup();
    const comment = await service.create(MARIA, { document: DOC, body: '@Σοφία Κ. το βλέπεις;', mentionIds: [SOFIA.id, MARIA.id, XENOS.id] }, null);
    await settled();

    expect(comment.mentions.map((m) => m.id).sort()).toEqual([MARIA.id, SOFIA.id].sort());
    expect(notified).toEqual([
      { userIds: [SOFIA.id], kind: 'mention', title: 'Μαρία Π. σε ανέφερε σε σχόλιο στο «Πεζοπορία» — δράση «Κατασκήνωση»', link: `/draseis/${DRASI}/programma/${ITEM}?comment=${comment.id}` },
    ]);
  });

  it('νέο σχόλιο: το μαθαίνουν οι υπεύθυνοι· απάντηση: όσοι είναι στο νήμα — μία φορά ο καθένας', async () => {
    const { service, notified, settled } = setup({ watchers: [ELENI.id, MARIA.id] });
    const root = await service.create(MARIA, { document: DOC, body: 'Θέλει χάρτη' }, null);
    await settled();
    expect(notified).toEqual([{ userIds: [ELENI.id], kind: 'comment', title: 'Νέο σχόλιο στο «Πεζοπορία» — δράση «Κατασκήνωση»', link: `/draseis/${DRASI}/programma/${ITEM}?comment=${root.id}` }]);

    notified.length = 0;
    await service.create(SOFIA, { document: DOC, parentId: root.id, body: 'Τον φέρνω @Ελένη Δ.', mentionIds: [ELENI.id] }, null);
    await settled();
    expect(notified).toEqual([
      { userIds: [ELENI.id], kind: 'mention', title: 'Σοφία Κ. σε ανέφερε σε σχόλιο στο «Πεζοπορία» — δράση «Κατασκήνωση»', link: `/draseis/${DRASI}/programma/${ITEM}?comment=${root.id}` },
      { userIds: [MARIA.id], kind: 'comment', title: 'Απάντηση σε σχόλιο στο «Πεζοπορία» — δράση «Κατασκήνωση»', link: `/draseis/${DRASI}/programma/${ITEM}?comment=${root.id}` },
    ]);
  });

  it('επεξεργασία μόνο από τον συντάκτη· ειδοποιούνται μόνο οι νέες αναφορές', async () => {
    const { service, notified, settled } = setup();
    const comment = await service.create(MARIA, { document: DOC, body: '@Σοφία Κ.', mentionIds: [SOFIA.id] }, null);
    await expect(service.edit(SOFIA, comment.id, { body: 'Άλλο' }, null)).rejects.toThrow(/συντάκτη/);
    await settled();

    notified.length = 0;
    const edited = await service.edit(MARIA, comment.id, { body: '@Σοφία Κ. @Ελένη Δ.', mentionIds: [SOFIA.id, ELENI.id] }, null);
    await settled();
    expect(edited.editedAt).not.toBeNull();
    expect(notified.map((n) => [n.kind, n.userIds])).toEqual([['mention', [ELENI.id]]]);
  });

  it('διαγραφή μόνο από τον συντάκτη — φεύγουν και οι απαντήσεις', async () => {
    const { service, rows } = setup();
    const root = await service.create(MARIA, { document: DOC, body: 'Θέλει χάρτη' }, null);
    await service.create(SOFIA, { document: DOC, parentId: root.id, body: 'Ναι' }, null);

    await expect(service.remove(SOFIA, root.id, null)).rejects.toThrow(/συντάκτη/);
    await service.remove(MARIA, root.id, null);
    expect(rows).toHaveLength(0);
  });

  it('«Επιλύθηκε»: όλο το νήμα, από όποιον βλέπει — και ξανά ανοιχτό', async () => {
    const { service } = setup();
    const root = await service.create(MARIA, { document: DOC, body: 'Θέλει χάρτη' }, null);
    const reply = await service.create(MARIA, { document: DOC, parentId: root.id, body: 'Ναι' }, null);

    await expect(service.resolve(SOFIA, reply.id, true, null)).rejects.toThrow(/νήμα/);
    const resolved = await service.resolve(SOFIA, root.id, true, null);
    expect(resolved.resolvedBy?.id).toBe(SOFIA.id);
    const reopened = await service.resolve(MARIA, root.id, false, null);
    expect(reopened.resolvedAt).toBeNull();
  });

  it('κάθε αλλαγή φτάνει ζωντανά σε όσους έχουν ανοιχτό το έγγραφο· τα νέα και στη ροή της δράσης', async () => {
    const { service, broadcasts, activity } = setup();
    const root = await service.create(MARIA, { document: DOC, body: 'Θέλει χάρτη' }, 'tab-1234');
    await service.resolve(SOFIA, root.id, true, null);

    expect(broadcasts).toEqual([
      { name: DOC, topic: 'comments', origin: 'tab-1234' },
      { name: DOC, topic: 'comments', origin: null },
    ]);
    expect(activity).toEqual([{ room: `drasi:${DRASI}:room`, topic: 'comment:item', by: MARIA.id }]);
  });

  it('σβήνεται το έγγραφο (ή όλη η δράση): σβήνουν και τα σχόλιά του', async () => {
    const { service, rows, removed } = setup();
    await service.create(MARIA, { document: DOC, body: 'Α' }, null);
    await removed(DOC, false);
    expect(rows).toHaveLength(0);

    await service.create(MARIA, { document: DOC, body: 'Β' }, null);
    await removed(`drasi:${DRASI}:`, true);
    expect(rows).toHaveLength(0);
  });
});
