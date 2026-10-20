import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { RequestUser } from '../../common/auth/types';
import { DraseisTrofodosiaService } from './draseis-trofodosia.service';

const DRASI = '00000000-0000-4000-8000-000000000001';
const ITEM = '00000000-0000-4000-8000-000000000002';
const VID = '00000000-0000-4000-8000-000000000003';
const VID2 = '00000000-0000-4000-8000-000000000004';

const ing = (id: string, label: string, qty = '') => ({ id, order: 0, label, qty, bought: false, boughtById: null, boughtAt: null });

function setup() {
  const prisma = {
    drasiMeal: { findMany: async () => [{ itemId: ITEM, ingredients: [ing('i-1', 'ρύζι', '1 kg')] }] },
    drasiMealVariant: {
      findMany: async () => [
        { id: VID, itemId: ITEM, order: 0, label: 'Χωρίς γλουτένη', ingredients: [ing('v-1', 'ζυμαρικά χ.γ.', '500 g'), ing('v-2', '  ')] },
        { id: VID2, itemId: ITEM, order: 1, label: 'Χορτοφαγικό', ingredients: [] },
      ],
      count: async ({ where }: { where: { id: string } }) => (where.id === VID ? 1 : 0),
    },
    drasiScheduleItem: { findFirst: async () => ({ kind: 'GEVMA', snack: null }) },
    drasiFoodPurchase: { findMany: async () => [] },
    user: { findMany: async () => [] },
  };
  const item = { id: ITEM, date: '2026-07-01', title: 'Μεσημεριανό', kind: 'GEVMA', snack: null, startsAt: '' };
  const plan = { scheduleView: async () => ({ days: [{ date: '2026-07-01', items: [item] }] }) };
  const access = { load: async () => ({}) };
  const service = new DraseisTrofodosiaService(prisma as never, access as never, plan as never, {} as never);
  return service;
}

describe('τροφοδοσία — παράλληλα γεύματα', () => {
  it('το παράλληλο με υλικά είναι δεύτερη γραμμή του γεύματος· χωρίς υλικά δεν φαίνεται', async () => {
    const view = await setup().view({ id: 'u-1' } as RequestUser, DRASI);
    const meals = view.days[0]!.meals;
    expect(meals).toHaveLength(2);
    expect(meals[0]).toMatchObject({ itemId: ITEM, variantId: null, variantLabel: null });
    expect(meals[1]).toMatchObject({ itemId: ITEM, title: 'Μεσημεριανό', variantId: VID, variantLabel: 'Χωρίς γλουτένη' });
    expect(meals[1]!.ingredients.map((y) => y.label)).toEqual(['ζυμαρικά χ.γ.']);
  });

  it('το τικ ενός παράλληλου που δεν ανήκει στο γεύμα δίνει 404', async () => {
    await expect(setup().setVariantIngredientBought({ id: 'u-1' } as RequestUser, DRASI, ITEM, VID2, 'x', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});
