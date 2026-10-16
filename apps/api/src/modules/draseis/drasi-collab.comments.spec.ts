import { describe, expect, it } from 'vitest';
import type { CollabDocumentType } from '../collab/collab-documents';
import { DrasiCollab } from './drasi-collab';

const DRASI = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';
const ITEM = '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';

const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'Χ' });

/** Μια δράση με ένα στοιχείο του ωρολογίου, στελέχη, ρόλους — και τα είδη της. */
function setup() {
  const types = new Map<string, CollabDocumentType>();
  const roles = [
    { kind: 'ARXIGOS', user: person('u-arxigos', 'Άννα') },
    { kind: 'MAGEIRISSA', user: person('u-mageirissa', 'Ζωή') },
  ];
  const prisma = {
    drasi: { findUnique: async () => ({ title: 'Κατασκήνωση' }) },
    drasiScheduleItem: { findFirst: async () => ({ title: 'Πεζοπορία' }) },
    drasiScheduleAssignee: { findMany: async () => [{ userId: 'u-maria' }] },
    drasiRole: {
      findMany: async ({ where }: { where: { kind?: { in: string[] } } }) =>
        roles.filter((r) => !where.kind || where.kind.in.includes(r.kind)).map((r) => ({ userId: r.user.id, user: r.user })),
    },
    // Μόνο τα στελέχη ζητιούνται — τα παιδιά δεν φτάνουν ποτέ ως εδώ.
    drasiParticipant: {
      findMany: async ({ where }: { where: { kind: string } }) =>
        where.kind === 'STELEXOS' ? [{ user: person('u-maria', 'Μαρία') }, { user: person('u-arxigos', 'Άννα') }] : [{ user: person('u-paidi', 'Παιδί') }],
    },
  };
  const collab = { registry: { register: (type: CollabDocumentType) => types.set(type.kind, type) } };
  new DrasiCollab(prisma as never, {} as never, collab as never).onModuleInit();
  return (kind: string) => types.get(kind)!;
}

describe('κοινά έγγραφα της δράσης — για τα σχόλια', () => {
  it('προγραμματικό: πού (για την ειδοποίηση), πού ανοίγει, και το μαθαίνουν οι υπεύθυνοι', async () => {
    const about = await setup()('drasi:item').about!([DRASI, ITEM]);
    expect(about).toEqual({
      title: 'στο «Πεζοπορία» — δράση «Κατασκήνωση»',
      link: `/draseis/${DRASI}/programma/${ITEM}`,
      watchers: ['u-maria'],
      activity: { room: `drasi:${DRASI}:room`, topic: 'comment:item' },
    });
  });

  it('γεύμα: οι υπεύθυνοι, η μαγείρισσα και η τροφοδοσία', async () => {
    const about = await setup()('drasi:meal').about!([DRASI, ITEM]);
    expect(about?.link).toBe(`/draseis/${DRASI}/diatrofologio/${ITEM}`);
    expect(about?.watchers.sort()).toEqual(['u-mageirissa', 'u-maria']);
  });

  it('«@»: τα στελέχη της δράσης και όσοι έχουν ευθύνη — μία φορά ο καθένας, ποτέ παιδιά', async () => {
    const people = await setup()('drasi:item').people!([DRASI, ITEM]);
    expect(people.map((p) => p.id)).toEqual(['u-arxigos', 'u-mageirissa', 'u-maria']);
  });
});
