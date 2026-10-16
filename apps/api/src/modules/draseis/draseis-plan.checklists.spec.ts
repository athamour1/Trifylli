import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisPlanService } from './draseis-plan.service';

const DRASI = 'd-1';
const user = (id: string) => ({ id, topikoId: 't-1' }) as RequestUser;

/** Μια λίστα αγορών και φόρτωσης στη μνήμη, με τους κανόνες του `updateMany`. */
function setup() {
  const shopping = [
    { id: 's-1', drasiId: DRASI, assigneeId: null as string | null, purchasedAt: null as Date | null },
    { id: 's-2', drasiId: DRASI, assigneeId: 'u-sofia' as string | null, purchasedAt: null as Date | null },
    { id: 's-3', drasiId: DRASI, assigneeId: null as string | null, purchasedAt: new Date() as Date | null },
  ];
  const external = [{ id: 'x-1', drasiId: DRASI, loadedAt: null as Date | null, loadedById: null as string | null }];
  type Row = (typeof shopping)[number];
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) =>
      key === 'OR' ? (value as Record<string, unknown>[]).some((part) => matches(row, part)) : row[key as keyof Row] === value,
    );
  const prisma = {
    drasiShoppingItem: {
      findFirst: async ({ where }: { where: { id: string; drasiId: string } }) => shopping.find((s) => s.id === where.id && s.drasiId === where.drasiId) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = shopping.filter((s) => matches(s, where));
        for (const s of hit) Object.assign(s, data);
        return { count: hit.length };
      },
    },
    drasiExternalYliko: {
      updateMany: async ({ where, data }: { where: { id: string; drasiId: string }; data: Partial<(typeof external)[number]> }) => {
        const hit = external.filter((x) => x.id === where.id && x.drasiId === where.drasiId);
        for (const x of hit) Object.assign(x, data);
        return { count: hit.length };
      },
    },
  };
  const access = { load: async () => ({ id: DRASI }) };
  const service = new DraseisPlanService(prisma as never, access as never, {} as never, {} as never);
  return { service, shopping, external };
}

describe('ζωντανές λίστες της δράσης', () => {
  it('«Το παίρνω εγώ»: το κλείνει για τους άλλους — και το αφήνει μόνο όποιος το πήρε', async () => {
    const { service, shopping } = setup();
    await service.claimShopping(user('u-maria'), DRASI, 's-1', true);
    expect(shopping[0]!.assigneeId).toBe('u-maria');

    await expect(service.claimShopping(user('u-maria'), DRASI, 's-2', true)).rejects.toThrow(/κάποιος άλλος/);
    await service.claimShopping(user('u-maria'), DRASI, 's-2', false);
    expect(shopping[1]!.assigneeId).toBe('u-sofia');

    await service.claimShopping(user('u-maria'), DRASI, 's-1', false);
    expect(shopping[0]!.assigneeId).toBeNull();
  });

  it('ό,τι αγοράστηκε δεν «παίρνεται» πια', async () => {
    const { service } = setup();
    await expect(service.claimShopping(user('u-maria'), DRASI, 's-3', true)).rejects.toThrow(/αγοραστεί/);
  });

  it('«Μπήκε» στη φόρτωση: ποιος και πότε — και αναίρεση', async () => {
    const { service, external } = setup();
    await service.setLoaded(user('u-maria'), DRASI, 'external', 'x-1', true);
    expect(external[0]).toMatchObject({ loadedById: 'u-maria' });
    expect(external[0]!.loadedAt).toBeInstanceOf(Date);
    await service.setLoaded(user('u-maria'), DRASI, 'external', 'x-1', false);
    expect(external[0]).toMatchObject({ loadedById: null, loadedAt: null });
    await expect(service.setLoaded(user('u-maria'), DRASI, 'external', 'x-άλλο', true)).rejects.toThrow(/δεν βρέθηκε/);
  });
});
