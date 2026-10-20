import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisService } from './draseis.service';
import { planGuestCollectors } from './guest-collectors';

describe('υπεύθυνος είσπραξης φιλοξενούμενου Τοπικού', () => {
  const topika = [{ topikoName: 'ΤΤ Ελευσίνας', contactUserId: 'u-penny' }];

  it('όσοι από το Τοπικό δεν έχουν εισπράκτορα παίρνουν τον υπεύθυνο — όχι ο ίδιος, όχι οι χειροκίνητες', () => {
    const plan = planGuestCollectors(topika, [
      { id: 'p-1', userId: 'u-1', collectorId: null, guestTopikoName: 'ΤΤ ΕΛΕΥΣΙΝΑΣ ' },
      { id: 'p-2', userId: 'u-2', collectorId: 'u-other', guestTopikoName: 'ΤΤ Ελευσίνας' },
      { id: 'p-penny', userId: 'u-penny', collectorId: null, guestTopikoName: 'ΤΤ Ελευσίνας' },
      { id: 'p-3', userId: 'u-3', collectorId: null, guestTopikoName: 'Κηφισιά' },
      { id: 'p-4', userId: 'u-4', collectorId: null, guestTopikoName: null },
    ]);
    expect([...plan]).toEqual([['u-penny', ['p-1']]]);
  });
});

/** Μια δράση με ένα φιλοξενούμενο Τοπικό και ό,τι χρειάζεται το `setGuestTopika`. */
function setup(state: {
  users: { id: string; firstName: string; lastName: string; email: string | null; accountRole: string | null; guestTopikoCode: string | null; guestTopikoName: string | null; phone?: string | null }[];
  participants: { id: string; userId: string; kind: string; collectorId: string | null }[];
  topika: { id: string; topikoName: string; kladoi: string[]; contactName: string | null; contactPhone: string | null; contactUserId: string | null }[];
}) {
  const userOf = (id: string) => state.users.find((u) => u.id === id)!;
  const prisma = {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    drasi: { findFirst: async () => ({ id: 'd-1', klados: { type: 'ODIGOI' } }) },
    drasiGuestTopiko: {
      findMany: async (args?: { include?: unknown }) =>
        state.topika.map((t) => ({ ...t, ...(args?.include ? { contactUser: t.contactUserId ? userOf(t.contactUserId) : null } : {}) })),
      deleteMany: async () => ({ count: 0 }),
      updateMany: async ({ where, data }: { where: { id: string }; data: object }) => {
        Object.assign(state.topika.find((t) => t.id === where.id)!, data);
        return { count: 1 };
      },
      createMany: async () => ({ count: 0 }),
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(state.topika.find((t) => t.id === where.id)!, data),
    },
    user: {
      findFirst: async ({ where }: { where: { id?: string; email?: string } }) =>
        state.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(userOf(where.id), data),
      create: async ({ data }: { data: (typeof state.users)[number] }) => {
        const row = { ...data, id: `u-new-${state.users.length}`, accountRole: null };
        state.users.push(row);
        return { id: row.id };
      },
    },
    drasiParticipant: {
      findMany: async ({ where }: { where: { collectorId?: null; kind?: string } }) =>
        state.participants
          .filter((p) => (where.kind ? p.kind === where.kind : true) && (where.collectorId === null ? p.collectorId === null : true))
          .map((p) => ({ ...p, user: userOf(p.userId) })),
      upsert: async ({ create }: { create: { userId: string; kind: string } }) => {
        if (!state.participants.some((p) => p.userId === create.userId)) {
          state.participants.push({ id: `p-${create.userId}`, userId: create.userId, kind: create.kind, collectorId: null });
        }
      },
      updateMany: async ({ where, data }: { where: { id?: { in: string[] }; collectorId?: string | null; userId?: { not: string } }; data: { collectorId: string } }) => {
        for (const p of state.participants) {
          if (where.id && !where.id.in.includes(p.id)) continue;
          if (where.collectorId !== undefined && p.collectorId !== where.collectorId) continue;
          if (where.userId && p.userId === where.userId.not) continue;
          p.collectorId = data.collectorId;
        }
        return { count: 1 };
      },
    },
  };
  const collab = { revokeAll: () => undefined };
  const service = new DraseisService(prisma as never, {} as never, collab as never, {} as never);
  return { service, state };
}

const ARXIGOS = { id: 'u-arxigos', topikoId: 't-1', drasiGrant: { drasiId: 'd-1', access: { full: true, view: [], edit: [] } } } as unknown as RequestUser;
const ELEFSINA = { id: 'g-1', topikoName: 'ΤΤ Ελευσίνας', kladoi: ['ODIGOI'], contactName: 'Πηνελόπη Γιακοβάκη', contactPhone: null, contactUserId: null };
const child = { id: 'u-kid', firstName: 'Ελένη', lastName: 'Φιλοξενούμενη', email: null, accountRole: null, guestTopikoCode: 'GUEST', guestTopikoName: 'ΤΤ Ελευσίνας' };
const item = (contact: { contactFirstName: string; contactLastName: string; contactEmail?: string }) => ({
  items: [{ id: 'g-1', topikoName: 'ΤΤ Ελευσίνας', kladoi: ['ODIGOI' as const], ...contact }],
});

describe('υπεύθυνος φιλοξενούμενου Τοπικού: ένα άτομο', () => {
  it('νέος υπεύθυνος: φιλοξενούμενο στέλεχος στους συμμετέχοντες, εισπράττει από τους δικούς του', async () => {
    const { service, state } = setup({ users: [child], participants: [{ id: 'p-kid', userId: 'u-kid', kind: 'MELOS', collectorId: null }], topika: [{ ...ELEFSINA }] });
    const [view] = await service.setGuestTopika(ARXIGOS, 'd-1', item({ contactFirstName: 'Πηνελόπη', contactLastName: 'Γιακοβάκη', contactEmail: 'Penny@Example.org' }));

    const penny = state.users.find((u) => u.lastName === 'Γιακοβάκη')!;
    expect(penny).toMatchObject({ guestTopikoCode: 'GUEST', guestTopikoName: 'ΤΤ Ελευσίνας', email: 'penny@example.org', kind: 'STELEXOS' });
    expect(state.participants.find((p) => p.userId === penny.id)).toMatchObject({ kind: 'STELEXOS' });
    expect(state.participants.find((p) => p.id === 'p-kid')?.collectorId).toBe(penny.id);
    expect(view?.contact).toMatchObject({ userId: penny.id, firstName: 'Πηνελόπη', hasAccount: false });
  });

  it('ίδιο άτομο, όχι δεύτερο: ήδη στους συμμετέχοντες με το ίδιο όνομα από το ίδιο Τοπικό', async () => {
    const already = { id: 'u-penny', firstName: 'ΠΗΝΕΛΟΠΗ', lastName: 'Γιακοβακη', email: null, accountRole: null, guestTopikoCode: 'GUEST', guestTopikoName: 'ΤΤ ΕΛΕΥΣΙΝΑΣ' };
    const { service, state } = setup({ users: [already], participants: [{ id: 'p-penny', userId: 'u-penny', kind: 'STELEXOS', collectorId: null }], topika: [{ ...ELEFSINA }] });
    await service.setGuestTopika(ARXIGOS, 'd-1', item({ contactFirstName: 'Πηνελόπη', contactLastName: 'Γιακοβάκη' }));
    expect(state.users).toHaveLength(1);
    expect(state.topika[0]?.contactUserId).toBe('u-penny');
  });

  it('με email εξωτερικού που υπάρχει ήδη: εκείνος — και το email του λογαριασμού δεν αλλάζει', async () => {
    const external = { id: 'u-ext', firstName: 'Νταμης', lastName: 'Νταμόπουλος', email: 'dummy@dummy.com', accountRole: 'EXTERNAL', guestTopikoCode: 'EXT', guestTopikoName: 'Ελευσίνα' };
    const { service, state } = setup({ users: [external], participants: [], topika: [{ ...ELEFSINA }] });
    await service.setGuestTopika(ARXIGOS, 'd-1', item({ contactFirstName: 'Νταμης', contactLastName: 'Νταμόπουλος', contactEmail: 'dummy@dummy.com' }));
    expect(state.users).toHaveLength(1);
    expect(state.topika[0]?.contactUserId).toBe('u-ext');
    expect(external).toMatchObject({ email: 'dummy@dummy.com', guestTopikoName: 'Ελευσίνα' });
    expect(state.participants).toEqual([expect.objectContaining({ userId: 'u-ext', kind: 'STELEXOS' })]);
  });

  it('email μέλους του μητρώου μας: όχι', async () => {
    const member = { id: 'u-ours', firstName: 'Μαρία', lastName: 'Δική μας', email: 'maria@example.org', accountRole: 'STELEXOS', guestTopikoCode: null, guestTopikoName: null };
    const { service } = setup({ users: [member], participants: [], topika: [{ ...ELEFSINA }] });
    await expect(
      service.setGuestTopika(ARXIGOS, 'd-1', item({ contactFirstName: 'Μαρία', contactLastName: 'Δική μας', contactEmail: 'maria@example.org' })),
    ).rejects.toThrow(/μητρώου μας/);
  });

  it('αλλαγή υπευθύνου: όσους εισέπραττε ο προηγούμενος τους παίρνει ο νέος', async () => {
    const old = { id: 'u-old', firstName: 'Παλιός', lastName: 'Υπεύθυνος', email: null, accountRole: null, guestTopikoCode: 'GUEST', guestTopikoName: 'ΤΤ Ελευσίνας' };
    const { service, state } = setup({
      users: [old, child],
      participants: [
        { id: 'p-old', userId: 'u-old', kind: 'STELEXOS', collectorId: null },
        { id: 'p-kid', userId: 'u-kid', kind: 'MELOS', collectorId: 'u-old' },
      ],
      topika: [{ ...ELEFSINA, contactUserId: 'u-old' }],
    });
    // Άλλο όνομα = άλλο άτομο: ο προηγούμενος δεν μετονομάζεται.
    await service.setGuestTopika(ARXIGOS, 'd-1', item({ contactFirstName: 'Πηνελόπη', contactLastName: 'Γιακοβάκη' }));
    const penny = state.users.find((u) => u.lastName === 'Γιακοβάκη')!;
    expect(old).toMatchObject({ firstName: 'Παλιός', lastName: 'Υπεύθυνος' });
    expect(state.topika[0]?.contactUserId).toBe(penny.id);
    expect(state.participants.find((p) => p.id === 'p-kid')?.collectorId).toBe(penny.id);
  });
});

describe('υπεύθυνος: ίδιο όνομα, νέα στοιχεία', () => {
  it('ο ίδιος υπεύθυνος με νέο τηλέφωνο μένει το ίδιο άτομο', async () => {
    const penny = { id: 'u-penny', firstName: 'Πηνελόπη', lastName: 'Γιακοβάκη', email: null, accountRole: null, guestTopikoCode: 'GUEST', guestTopikoName: 'ΤΤ Ελευσίνας', phone: null as string | null };
    const { service, state } = setup({ users: [penny], participants: [{ id: 'p-penny', userId: 'u-penny', kind: 'STELEXOS', collectorId: null }], topika: [{ ...ELEFSINA, contactUserId: 'u-penny' }] });
    await service.setGuestTopika(ARXIGOS, 'd-1', { items: [{ id: 'g-1', topikoName: 'ΤΤ Ελευσίνας', kladoi: ['ODIGOI'], contactFirstName: 'Πηνελόπη', contactLastName: 'Γιακοβάκη', contactPhone: '6900000000' }] });
    expect(state.users).toHaveLength(1);
    expect(penny.phone).toBe('6900000000');
  });
});
