import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Doc } from 'yjs';
import { drasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { readMeal, seedMeal } from './drasi-docs';
import { DraseisTrofodosiaService } from './draseis-trofodosia.service';

const DRASI = 'd-1';
const MEAL = '00000000-0000-4000-8000-000000000010';
const ROW = '00000000-0000-4000-8000-000000000011';

function as(id: string, roles: DrasiRoleKind[]): RequestUser {
  return {
    id,
    firstName: 'Μαρία',
    lastName: 'Δοκιμή',
    topikoId: 't-1',
    drasiGrant: { drasiId: DRASI, access: drasiAccess({ full: false, staff: true, roles }) },
  } as unknown as RequestUser;
}
const person = (id: string) => ({ id, firstName: id, lastName: 'Χ' });

function item(id: string, kind: string, date: string, startsAt: string) {
  return { id, kind, snack: null, title: id === MEAL ? 'Μεσημεριανό' : 'Πεζοπορία', date, startsAt };
}

function setup() {
  const days = [
    { date: '2026-11-14', items: [item(MEAL, 'GEVMA', '2026-11-14', '2026-11-14T11:00:00.000Z'), item('i-hike', 'DRASTIRIOTITA', '2026-11-14', '2026-11-14T08:00:00.000Z')] },
    { date: '2026-11-15', items: [] },
  ];
  const purchases: Record<string, unknown>[] = [
    { id: 'p-bought', drasiId: DRASI, date: new Date('2026-11-15T00:00:00Z'), label: 'Γάλα', qty: '6 λίτρα', note: null, requestedBy: person('u-leit'), boughtBy: person('u-trof'), boughtAt: new Date('2026-10-18T09:00:00Z'), createdAt: new Date() },
  ];
  const doc = new Doc();
  seedMeal(doc, {
    recipe: '',
    menu: 'Μακαρόνια',
    ingredients: [{ id: ROW, order: 0, label: 'Μακαρόνια', qty: '2 kg', bought: false, boughtBy: null, boughtAt: null }],
  });
  const prisma = {
    drasiMealVariant: { findMany: async () => [] },
    drasiMeal: {
      findMany: async () => [
        {
          itemId: MEAL,
          ingredients: [
            { id: ROW, label: 'Μακαρόνια', qty: '2 kg', bought: true, boughtById: 'u-trof', boughtAt: new Date('2026-10-18T08:00:00Z') },
            { id: 'r-blank', label: '  ', qty: '', bought: false, boughtById: null, boughtAt: null },
          ],
        },
      ],
    },
    drasiFoodPurchase: {
      findMany: async () => purchases,
      findFirst: async ({ where }: { where: { id: string } }) => purchases.find((p) => p.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `p-${purchases.length + 1}`, ...data, requestedBy: person(String(data.requestedById)), boughtBy: null, boughtAt: null, createdAt: new Date() };
        purchases.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(purchases.find((p) => p.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => purchases.splice(purchases.findIndex((p) => p.id === where.id), 1),
    },
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map(person) },
    drasiScheduleItem: {
      findFirst: async ({ where }: { where: { id: string } }) => (where.id === MEAL ? { kind: 'GEVMA', snack: null } : where.id === 'i-hike' ? { kind: 'DRASTIRIOTITA', snack: null } : null),
    },
  };
  const access = { load: async () => ({ id: DRASI }) };
  const plan = { scheduleView: async () => ({ days, stelexi: [] }) };
  const collab = {
    hocuspocus: {
      openDirectConnection: async () => ({ transact: async (fn: (d: Doc) => void) => fn(doc), disconnect: async () => undefined }),
    },
  };
  const service = new DraseisTrofodosiaService(prisma as never, access as never, plan as never, collab as never);
  return { service, purchases, doc };
}

describe('τροφοδοσία: τι αγοράζουμε κάθε ημέρα', () => {
  it('κάθε ημέρα: τα υλικά των γευμάτων της (μόνο γεύματα, όχι κενές γραμμές) και τα επιπλέον', async () => {
    const { service } = setup();
    const view = await service.view(as('u-1', []), DRASI);
    expect(view.days.map((d) => d.date)).toEqual(['2026-11-14', '2026-11-15']);
    expect(view.days[0]!.meals).toEqual([
      expect.objectContaining({
        itemId: MEAL,
        title: 'Μεσημεριανό',
        ingredients: [{ id: ROW, label: 'Μακαρόνια', qty: '2 kg', bought: true, boughtBy: person('u-trof'), boughtAt: '2026-10-18T08:00:00.000Z' }],
      }),
    ]);
    expect(view.days[1]!.extras.map((e) => [e.label, e.bought, e.requestedBy?.id])).toEqual([['Γάλα', true, 'u-leit']]);
  });

  it('προσθήκη: μόνο σε ημέρα της δράσης, και κρατά ποιος το ζήτησε', async () => {
    const { service } = setup();
    await expect(service.add(as('u-mag', ['MAGEIRISSA']), DRASI, { date: '2026-12-01', label: 'Αυγά' })).rejects.toBeInstanceOf(BadRequestException);
    const added = await service.add(as('u-mag', ['MAGEIRISSA']), DRASI, { date: '2026-11-14', label: '  Αυγά ', qty: ' 30 ' });
    expect(added).toMatchObject({ date: '2026-11-14', label: 'Αυγά', qty: '30', bought: false, requestedBy: { id: 'u-mag' } });
  });

  it('ό,τι αγοράστηκε: δεν αλλάζει, και το σβήνει μόνο όποιος αγοράζει', async () => {
    const { service, purchases } = setup();
    await expect(service.update(as('u-leit', ['LEITOURGIA']), DRASI, 'p-bought', { label: 'Γιαούρτι' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(as('u-leit', ['LEITOURGIA']), DRASI, 'p-bought')).rejects.toBeInstanceOf(ForbiddenException);
    await service.remove(as('u-trof', ['TROFODOSIA']), DRASI, 'p-bought');
    expect(purchases).toEqual([]);
  });

  it('«αγοράστηκε» ενός υλικού γεύματος: γράφεται στο κοινό έγγραφο του γεύματος', async () => {
    const { service, doc } = setup();
    await service.setIngredientBought(as('00000000-0000-4000-8000-000000000090', ['TROFODOSIA']), DRASI, MEAL, ROW, true);
    expect(readMeal(doc).ingredients[0]).toMatchObject({ bought: true, boughtBy: '00000000-0000-4000-8000-000000000090' });
    await expect(service.setIngredientBought(as('u-trof', ['TROFODOSIA']), DRASI, MEAL, 'r-gone', true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setIngredientBought(as('u-trof', ['TROFODOSIA']), DRASI, 'i-hike', ROW, true)).rejects.toBeInstanceOf(NotFoundException);
  });
});
