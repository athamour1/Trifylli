import { describe, expect, it } from 'vitest';
import { drasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import type { CollabDocumentType } from '../collab/collab-documents';
import { Doc } from 'yjs';
import { DrasiCollab } from './drasi-collab';
import { seedItem, seedMeal } from './drasi-docs';

const DRASI = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';
const ITEM = '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
const ME = { id: 'u-me' } as RequestUser;

/** Ο χρήστης στη δράση: πλήρης, στέλεχος με ρόλους, ή κανείς. */
type Who = { full?: boolean; staff?: boolean; roles?: DrasiRoleKind[] } | null;

function setup(options: {
  who: Who;
  status?: 'ENERGI' | 'KLEISTI';
  archived?: boolean;
  item?: { kind: string; snack: string | null; assignees: string[] } | null;
  character?: { player: string | null } | null;
}) {
  const types = new Map<string, CollabDocumentType>();
  const prisma = {
    drasi: { findUnique: async () => ({ status: options.status ?? 'ENERGI', archivedAt: options.archived ? new Date() : null }) },
    drasiScheduleItem: {
      findFirst: async () =>
        options.item === null || options.item === undefined
          ? null
          : { ...options.item, assignees: options.item.assignees.map((userId) => ({ userId })) },
    },
    drasiCharacter: {
      findFirst: async () =>
        options.character ? { participant: options.character.player ? { userId: options.character.player } : null } : null,
    },
  };
  const access = {
    accessFor: async () => {
      if (!options.who) throw new Error('Η δράση δεν βρέθηκε.');
      return drasiAccess({ full: options.who.full ?? false, staff: options.who.staff ?? false, roles: options.who.roles ?? [] });
    },
  };
  const collab = { registry: { register: (type: CollabDocumentType) => types.set(type.kind, type) } };
  new DrasiCollab(prisma as never, access as never, collab as never).onModuleInit();
  return (kind: string, ids: string[]) => types.get(kind)!.access(ME, ids);
}

describe('κοινά κείμενα της δράσης — ποιος γράφει', () => {
  it('περιγραφή: τη γράφει όποιος έχει τις Ρυθμίσεις, τη βλέπει κάθε στέλεχος', async () => {
    expect(await setup({ who: { staff: true, roles: ['ARXIGOS'] } })('drasi:settings', [DRASI])).toBe('write');
    expect(await setup({ who: { staff: true } })('drasi:settings', [DRASI])).toBe('read');
    expect(await setup({ who: null })('drasi:settings', [DRASI])).toBeNull();
  });

  it('κλειστή ή αρχειοθετημένη δράση: μόνο ανάγνωση, ακόμη και για τον διαχειριστή', async () => {
    expect(await setup({ who: { full: true }, status: 'KLEISTI' })('drasi:mythos', [DRASI])).toBe('read');
    expect(await setup({ who: { full: true }, archived: true })('drasi:mythos', [DRASI])).toBe('read');
  });

  it('μύθος: τον γράφει το Πρόγραμμα', async () => {
    expect(await setup({ who: { staff: true, roles: ['PROGRAMMA'] } })('drasi:mythos', [DRASI])).toBe('write');
    expect(await setup({ who: { staff: true, roles: ['TAMIAS'] } })('drasi:mythos', [DRASI])).toBe('read');
  });

  it('προγραμματικό: το Πρόγραμμα, και ο υπεύθυνος του στοιχείου για το δικό του', async () => {
    const item = { kind: 'DRASTIRIOTITA', snack: null, assignees: ['u-me'] };
    expect(await setup({ who: { staff: true }, item })('drasi:item', [DRASI, ITEM])).toBe('write');
    expect(await setup({ who: { staff: true }, item: { ...item, assignees: ['u-other'] } })('drasi:item', [DRASI, ITEM])).toBe('read');
    expect(await setup({ who: { staff: true, roles: ['PROGRAMMA'] }, item: { ...item, assignees: [] } })('drasi:item', [DRASI, ITEM])).toBe(
      'write',
    );
    expect(await setup({ who: { full: true }, item: null })('drasi:item', [DRASI, ITEM])).toBeNull();
  });

  it('lore: το στέλεχος που παίζει τον ρόλο γράφει το δικό του', async () => {
    expect(await setup({ who: { staff: true }, character: { player: 'u-me' } })('drasi:character', [DRASI, ITEM])).toBe('write');
    expect(await setup({ who: { staff: true }, character: { player: 'u-other' } })('drasi:character', [DRASI, ITEM])).toBe('read');
    expect(await setup({ who: { full: true }, character: null })('drasi:character', [DRASI, ITEM])).toBeNull();
  });

  it('συνταγή: μόνο για γεύματα, τη γράφουν μαγείρισσα και τροφοδοσία', async () => {
    const meal = { kind: 'GEVMA', snack: null, assignees: [] };
    expect(await setup({ who: { staff: true, roles: ['MAGEIRISSA'] }, item: meal })('drasi:meal', [DRASI, ITEM])).toBe('write');
    expect(await setup({ who: { staff: true, roles: ['ARXIGOS'] }, item: meal })('drasi:meal', [DRASI, ITEM])).toBe('read');
    expect(await setup({ who: { staff: true }, item: { kind: 'DRASTIRIOTITA', snack: 'DEKATIANO', assignees: [] } })('drasi:meal', [DRASI, ITEM])).toBe(
      'read',
    );
    expect(await setup({ who: { full: true }, item: { kind: 'DRASTIRIOTITA', snack: null, assignees: [] } })('drasi:meal', [DRASI, ITEM])).toBeNull();
  });
});

describe('στοιχείο και γεύμα — τι γράφεται στη βάση', () => {
  /** Μια βάση που κρατά ό,τι της γράφουν — μόνο όσα αγγίζει η προβολή. */
  function recorder() {
    const calls: [string, unknown][] = [];
    const table = (name: string) => ({
      updateMany: async (args: unknown) => (calls.push([`${name}.updateMany`, args]), { count: 1 }),
      deleteMany: async (args: unknown) => (calls.push([`${name}.deleteMany`, args]), { count: 0 }),
      createMany: async (args: unknown) => (calls.push([`${name}.createMany`, args]), { count: 0 }),
      upsert: async (args: unknown) => (calls.push([`${name}.upsert`, args]), {}),
      count: async () => 1,
    });
    const tx = {
      drasiScheduleItem: table('item'),
      drasiScheduleYlikoItem: table('yliko'),
      drasiMeal: table('meal'),
      drasiMealIngredient: table('ingredient'),
    };
    const types = new Map<string, CollabDocumentType>();
    const prisma = { $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) };
    const collab = { registry: { register: (type: CollabDocumentType) => types.set(type.kind, type) } };
    new DrasiCollab(prisma as never, {} as never, collab as never).onModuleInit();
    return { calls, type: (kind: string) => types.get(kind)! };
  }

  const Y1 = '00000000-0000-4000-8000-000000000001';

  it('στοιχείο: προγραμματικό και χώρος στη γραμμή του, το υλικό με τα id του εγγράφου', async () => {
    const { calls, type } = recorder();
    const doc = new Doc();
    seedItem(doc, { description: ' Πορεία ', location: ' Ξέφωτο ', yliko: [{ id: Y1, order: 0, label: ' Σχοινί ', qty: 2, packed: false }] });

    await type('drasi:item').project(doc, [DRASI, ITEM]);

    expect(calls).toEqual([
      ['item.updateMany', { where: { id: ITEM, drasiId: DRASI }, data: { description: 'Πορεία', location: 'Ξέφωτο' } }],
      ['yliko.deleteMany', { where: { itemId: ITEM } }],
      ['yliko.createMany', { data: [{ id: Y1, order: 0, label: 'Σχοινί', qty: 2, packed: false, itemId: ITEM }] }],
    ]);
  });

  it('γεύμα: συνταγή και μενού στο γεύμα, το ποσολόγιο με τα id του εγγράφου', async () => {
    const { calls, type } = recorder();
    const doc = new Doc();
    seedMeal(doc, { recipe: 'Βράζουμε', menu: 'Μακαρόνια', ingredients: [{ id: Y1, order: 0, label: 'Μακαρόνια', qty: '4 kg', bought: true }] });

    await type('drasi:meal').project(doc, [DRASI, ITEM]);

    expect(calls).toEqual([
      ['meal.upsert', { where: { itemId: ITEM }, create: { itemId: ITEM, recipe: 'Βράζουμε', menu: 'Μακαρόνια' }, update: { recipe: 'Βράζουμε', menu: 'Μακαρόνια' } }],
      ['ingredient.deleteMany', { where: { itemId: ITEM } }],
      ['ingredient.createMany', { data: [{ id: Y1, order: 0, label: 'Μακαρόνια', qty: '4 kg', bought: true, itemId: ITEM }] }],
    ]);
  });
});
