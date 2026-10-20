import { describe, expect, it } from 'vitest';
import { collabDocument, drasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DraseisDiatrofologioService } from './draseis-diatrofologio.service';

const DRASI = '00000000-0000-4000-8000-000000000001';
const ITEM = '00000000-0000-4000-8000-000000000002';
const VID = '00000000-0000-4000-8000-000000000003';

function staff(roles: DrasiRoleKind[] = []): RequestUser {
  return {
    id: 'u-1',
    topikoId: 't-1',
    drasiGrant: { drasiId: DRASI, access: drasiAccess({ full: false, staff: true, roles }) },
  } as unknown as RequestUser;
}

/** Ένα γεύμα με ένα παράλληλο «Χωρίς γλουτένη» για δύο από τους τρεις συμμετέχοντες. */
function setup() {
  const state = {
    participants: ['p-1', 'p-2', 'p-3'],
    variants: [
      { id: VID, itemId: ITEM, order: 0, label: 'Χωρίς γλουτένη', participantIds: ['p-1', 'p-2'], menu: 'Ρύζι', recipe: null, ingredients: [] as unknown[] },
    ],
  };
  const removed: string[] = [];
  const prisma = {
    drasiMeal: { findUnique: async () => null },
    drasiMealVariant: {
      findMany: async () => state.variants,
      deleteMany: async ({ where }: { where: { id: string; itemId: string } }) => {
        const before = state.variants.length;
        state.variants = state.variants.filter((v) => !(v.id === where.id && v.itemId === where.itemId));
        return { count: before - state.variants.length };
      },
    },
    drasiParticipant: { findMany: async () => state.participants.map((id) => ({ id })) },
  };
  const item = { id: ITEM, date: '2026-07-01', title: 'Μεσημεριανό', kind: 'GEVMA', snack: null, startsAt: '', endsAt: '' };
  const plan = { schedule: async () => [item] };
  const access = { load: async () => ({}), accessFor: async () => null };
  const collab = { remove: async (name: string) => void removed.push(name) };
  const service = new DraseisDiatrofologioService(prisma as never, access as never, plan as never, {} as never, collab as never);
  return { service, state, removed };
}

describe('παράλληλα γεύματα', () => {
  it('όποιος δεν βλέπει αλλεργίες βλέπει μόνο πόσοι — όχι ποιοι', async () => {
    const { service } = setup();
    const meal = await service.meal(staff(), DRASI, ITEM);
    expect(meal.variants[0]!.participantIds).toBeNull();
    expect(meal.variants[0]!.count).toBe(2);
    expect(meal.portions).toEqual({ main: 1, total: 3 });
  });

  it('η μαγείρισσα βλέπει για ποιους', async () => {
    const { service } = setup();
    const meal = await service.meal(staff(['MAGEIRISSA']), DRASI, ITEM);
    expect(meal.variants[0]!.participantIds).toEqual(['p-1', 'p-2']);
  });

  it('σβήσιμο παράλληλου: φεύγει η γραμμή και το κοινό του έγγραφο', async () => {
    const { service, state, removed } = setup();
    await service.removeVariant(staff(['MAGEIRISSA']), DRASI, ITEM, VID);
    expect(state.variants).toHaveLength(0);
    expect(removed).toEqual([collabDocument.drasiMealVariant(DRASI, VID)]);
  });
});
