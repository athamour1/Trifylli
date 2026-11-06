import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isProgrammatiko } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DraseisExtrasService } from './draseis-extras.service';
import type { CreateExtraItemDto, UpdateExtraItemDto } from './dto/drasi-plan.dto';

const DRASI = 'd-1';
const EXTRA = 'e-1';
const ME = { id: 'u-arxigos', topikoId: 't-1' } as RequestUser;

type Row = Record<string, unknown>;

function setup() {
  const extras: Row[] = [];
  const scheduled: Row[] = [{ id: 'i-0', drasiId: DRASI, date: new Date('2026-11-14T00:00:00Z'), order: 4 }];
  const assignees: { extraId: string; userId: string }[] = [];
  const notified: { userIds: string[]; link: string }[] = [];
  const removedDocs: string[] = [];
  const flushed: string[] = [];
  const revoked: string[] = [];
  const view = (row: Row) => ({
    ...row,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    assignees: assignees.filter((a) => a.extraId === row.id).map((a) => ({ user: { id: a.userId, firstName: 'Μ', lastName: a.userId } })),
    yliko: [],
  });
  const db = {
    drasiExtraItem: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: EXTRA, location: null, description: null, ...data };
        extras.push(row);
        return view(row);
      },
      findFirst: async ({ where }: { where: { id: string } }) => {
        const row = extras.find((e) => e.id === where.id);
        return row
          ? {
              ...row,
              assignees: assignees.filter((a) => a.extraId === row.id).map((a) => ({ userId: a.userId })),
              yliko: [{ id: 'y-1', order: 0, label: 'Τράπουλα', qty: 2, packed: true, packedById: 'u-maria', packedAt: new Date('2026-11-02T08:00:00Z') }],
            }
          : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => view(Object.assign(extras.find((e) => e.id === where.id)!, data)),
      delete: async ({ where }: { where: { id: string } }) => extras.splice(extras.findIndex((e) => e.id === where.id), 1)[0],
    },
    drasiExtraAssignee: {
      createMany: async ({ data }: { data: { extraId: string; userId: string }[] }) => assignees.push(...data),
      deleteMany: async ({ where }: { where: { userId: { in: string[] } } }) => {
        for (const userId of where.userId.in) assignees.splice(assignees.findIndex((a) => a.userId === userId), 1);
      },
    },
    drasiScheduleItem: {
      findFirst: async ({ where }: { where: { date: Date } }) =>
        scheduled.filter((s) => (s.date as Date).getTime() === where.date.getTime()).sort((a, b) => Number(b.order) - Number(a.order))[0] ?? null,
      create: async ({ data }: { data: Row }) => scheduled.push(data),
    },
  };
  const prisma = { ...db, $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => fn(db) };
  const access = { load: async () => ({ id: DRASI, title: 'Κατασκήνωση' }) };
  const collab = {
    remove: async (name: string) => void removedDocs.push(name),
    flushPending: async (name: string) => void flushed.push(name),
    revoke: (name: string) => void revoked.push(name),
  };
  const notifications = { notify: async (userIds: string[], n: { link: string }) => void notified.push({ userIds, link: n.link }) };
  const plan = {
    timezone: async () => 'Europe/Athens',
    days: async () => [{ date: '2026-11-14' }, { date: '2026-11-15' }],
    assertDrasiStelexi: async (_drasiId: string, ids: readonly string[]) => {
      if (ids.includes('u-paidi')) throw new BadRequestException('Υπεύθυνοι γίνονται μόνο στελέχη που συμμετέχουν στη δράση.');
    },
  };
  const service = new DraseisExtrasService(prisma as never, access as never, collab as never, notifications as never, plan as never);
  return { service, extras, scheduled, assignees, notified, removedDocs, flushed, revoked };
}

describe('προγραμματικά εκτός ωρολογίου («έξτρα»)', () => {
  it('μπαίνει από το kanban: δραστηριότητα στο To Do, χωρίς ημέρα', async () => {
    const { service } = setup();
    const extra = await service.add(ME, DRASI, { title: '  Αν βρέξει ' } as CreateExtraItemDto);
    expect(extra).toMatchObject({ id: EXTRA, title: 'Αν βρέξει', kind: 'DRASTIRIOTITA', status: 'TODO', durationMin: 30, hasProgramma: false });
    expect(extra).not.toHaveProperty('date');
  });

  it('μόνο είδη με προγραμματικό — όχι γεύμα, ξεκούραση, υπηρεσία', async () => {
    const { service } = setup();
    for (const kind of ['GEVMA', 'XEKOURASI', 'YPIRESIA'] as const) {
      await expect(service.add(ME, DRASI, { title: 'Χ', kind } as CreateExtraItemDto)).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const kind of ['DRASTIRIOTITA', 'METAKINISI', 'TELETI', 'ALLO'] as const) {
      await expect(service.add(ME, DRASI, { title: 'Χ', kind } as CreateExtraItemDto)).resolves.toMatchObject({ kind });
    }
  });

  it('αλλάζει στήλη και υπεύθυνους· οι νέοι υπεύθυνοι ειδοποιούνται με σύνδεσμο στα προγραμματικά', async () => {
    const { service, notified, revoked } = setup();
    await service.add(ME, DRASI, { title: 'Αν βρέξει' } as CreateExtraItemDto);
    const extra = await service.update(ME, DRASI, EXTRA, { status: 'IN_PROGRESS', addResponsibleIds: ['u-maria', ME.id] } as UpdateExtraItemDto);
    expect(extra.status).toBe('IN_PROGRESS');
    expect(extra.responsibles.map((r) => r.id).sort()).toEqual(['u-arxigos', 'u-maria']);
    expect(notified).toEqual([{ userIds: ['u-maria'], link: `/draseis/${DRASI}/programmatika/${EXTRA}` }]);
    // Άλλαξαν οι υπεύθυνοι: ξανανοίγει το έγγραφο με τα νέα δικαιώματα.
    expect(revoked).toEqual([`drasi:${DRASI}:item:${EXTRA}`]);

    const after = await service.update(ME, DRASI, EXTRA, { removeResponsibleIds: ['u-maria'] } as UpdateExtraItemDto);
    expect(after.responsibles.map((r) => r.id)).toEqual(['u-arxigos']);
  });

  it('υπεύθυνοι μόνο στελέχη της δράσης', async () => {
    const { service } = setup();
    await service.add(ME, DRASI, { title: 'Αν βρέξει' } as CreateExtraItemDto);
    await expect(service.update(ME, DRASI, EXTRA, { addResponsibleIds: ['u-paidi'] } as UpdateExtraItemDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('στο ωρολόγιο: ίδιο id, στο τέλος της ημέρας, με ό,τι γράφτηκε, τους υπεύθυνους, το υλικό και τη στήλη του', async () => {
    const { service, extras, scheduled, flushed } = setup();
    await service.add(ME, DRASI, { title: 'Αν βρέξει', kind: 'ALLO', durationMin: 45 } as CreateExtraItemDto);
    Object.assign(extras[0]!, { description: 'Παιχνίδια στη σκηνή', location: 'Τραπεζαρία' });
    await service.update(ME, DRASI, EXTRA, { status: 'DONE', addResponsibleIds: ['u-maria'] } as UpdateExtraItemDto);

    expect(await service.place(ME, DRASI, EXTRA, '2026-11-14')).toEqual({ id: EXTRA, date: '2026-11-14' });

    // Ό,τι γραφόταν πήγε πρώτα στη βάση.
    expect(flushed).toEqual([`drasi:${DRASI}:item:${EXTRA}`]);
    expect(extras).toEqual([]);
    expect(scheduled.at(-1)).toEqual({
      id: EXTRA,
      drasiId: DRASI,
      date: new Date('2026-11-14T00:00:00Z'),
      order: 5,
      durationMin: 45,
      title: 'Αν βρέξει',
      kind: 'ALLO',
      status: 'DONE',
      location: 'Τραπεζαρία',
      description: 'Παιχνίδια στη σκηνή',
      assignees: { create: [{ userId: 'u-maria' }] },
      yliko: {
        create: [{ id: 'y-1', order: 0, label: 'Τράπουλα', qty: 2, packed: true, packedById: 'u-maria', packedAt: new Date('2026-11-02T08:00:00Z') }],
      },
    });
  });

  it('σε κενή ημέρα μπαίνει πρώτο', async () => {
    const { service, scheduled } = setup();
    await service.add(ME, DRASI, { title: 'Αν βρέξει' } as CreateExtraItemDto);
    await service.place(ME, DRASI, EXTRA, '2026-11-15');
    expect(scheduled.at(-1)).toMatchObject({ id: EXTRA, order: 0, date: new Date('2026-11-15T00:00:00Z') });
  });

  it('μόνο σε ημέρα της δράσης — και μόνο ό,τι υπάρχει', async () => {
    const { service, extras } = setup();
    await service.add(ME, DRASI, { title: 'Αν βρέξει' } as CreateExtraItemDto);
    await expect(service.place(ME, DRASI, EXTRA, '2026-12-01')).rejects.toBeInstanceOf(BadRequestException);
    expect(extras).toHaveLength(1);
    await expect(service.place(ME, DRASI, 'e-other', '2026-11-14')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('διαγραφή: μαζί του σβήνει και το κοινό έγγραφο', async () => {
    const { service, extras, removedDocs } = setup();
    await service.add(ME, DRASI, { title: 'Αν βρέξει' } as CreateExtraItemDto);
    await service.remove(ME, DRASI, EXTRA);
    expect(extras).toEqual([]);
    expect(removedDocs).toEqual([`drasi:${DRASI}:item:${EXTRA}`]);
  });
});

describe('kanban: ποια στοιχεία του ωρολογίου είναι προγραμματικά', () => {
  it('δραστηριότητα, μετακίνηση, τελετή, «άλλο» — ναι· ξεκούραση και υπηρεσία μόνο αν έχουν ήδη κείμενο· γεύμα ποτέ', () => {
    for (const kind of ['DRASTIRIOTITA', 'METAKINISI', 'TELETI', 'ALLO'] as const) expect(isProgrammatiko({ kind, description: null })).toBe(true);
    for (const kind of ['XEKOURASI', 'YPIRESIA'] as const) {
      expect(isProgrammatiko({ kind, description: null })).toBe(false);
      expect(isProgrammatiko({ kind, description: '  ' })).toBe(false);
      expect(isProgrammatiko({ kind, description: 'Κανόνες βάρδιας' })).toBe(true);
    }
    expect(isProgrammatiko({ kind: 'GEVMA', description: 'Κάτι' })).toBe(false);
  });
});
