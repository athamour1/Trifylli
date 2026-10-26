import { describe, expect, it } from 'vitest';
import { DataSource, MemberKind } from '@prisma/client';
import { planChildPlacement, planLeaderPlacement, type MembershipLite } from './membership-plan';

const LEFT = new Date('2025-09-01T00:00:00Z');

function m(id: string, kladosId: string, extra: Partial<MembershipLite> = {}): MembershipLite {
  return { id, kladosId, kind: MemberKind.MELOS, source: DataSource.ESEO, leftAt: null, ...extra };
}

describe('planChildPlacement', () => {
  it('μένει ίδιος κλάδος ⇒ τίποτα δεν κλείνει (η υποομάδα μένει)', () => {
    const plan = planChildPlacement([m('a', 'poulia')], { known: true, kind: MemberKind.MELOS, kladosId: 'poulia' });
    expect(plan).toEqual({ close: [], ensure: 'poulia' });
  });

  it('αλλαγή κλάδου ⇒ κλείνει ο παλιός, ανοίγει ο νέος', () => {
    const plan = planChildPlacement([m('a', 'poulia')], { known: true, kind: MemberKind.MELOS, kladosId: 'odigoi' });
    expect(plan).toEqual({ close: ['a'], ensure: 'odigoi' });
  });

  it('δεν αγγίζει τοποθετήσεις ως στέλεχος σε άλλο κλάδο', () => {
    const plan = planChildPlacement(
      [m('a', 'megaloi'), m('b', 'poulia', { kind: MemberKind.STELEXOS, source: DataSource.LOCAL })],
      { known: true, kind: MemberKind.MELOS, kladosId: 'megaloi' },
    );
    expect(plan).toEqual({ close: [], ensure: 'megaloi' });
  });

  it('έγινε ενήλικας ⇒ κλείνει η τοποθέτηση ως μέλος, δεν ανοίγει νέα', () => {
    const plan = planChildPlacement([m('a', 'megaloi')], { known: true, kind: MemberKind.STELEXOS, kladosId: null });
    expect(plan).toEqual({ close: ['a'], ensure: null });
  });

  it('αγνοεί ήδη κλειστές τοποθετήσεις', () => {
    const plan = planChildPlacement([m('a', 'asteria', { leftAt: LEFT }), m('b', 'poulia')], {
      known: true,
      kind: MemberKind.MELOS,
      kladosId: 'poulia',
    });
    expect(plan).toEqual({ close: [], ensure: 'poulia' });
  });

  it('άγνωστος τύπος e-SEO ⇒ δεν πειράζει τίποτα', () => {
    const plan = planChildPlacement([m('a', 'poulia')], { known: false, kind: MemberKind.STELEXOS, kladosId: null });
    expect(plan).toEqual({ close: [], ensure: null });
  });

  it('ο κλάδος δεν υπάρχει στο Τοπικό ⇒ δεν κλείνει την τωρινή τοποθέτηση', () => {
    const plan = planChildPlacement([m('a', 'poulia')], { known: true, kind: MemberKind.MELOS, kladosId: null });
    expect(plan).toEqual({ close: [], ensure: null });
  });
});

describe('planLeaderPlacement', () => {
  const leader = (id: string, kladosId: string, extra: Partial<MembershipLite> = {}) =>
    m(id, kladosId, { kind: MemberKind.STELEXOS, ...extra });

  it('νέος ρόλος από πτυχίο ⇒ ανοίγει ο κλάδος', () => {
    expect(planLeaderPlacement([], new Set(['odigoi']))).toEqual({ close: [], ensure: ['odigoi'] });
  });

  it('έληξε το πτυχίο ⇒ κλείνει ο κλάδος που ήρθε από το e-SEO', () => {
    const plan = planLeaderPlacement([leader('a', 'poulia'), leader('b', 'odigoi')], new Set(['odigoi']));
    expect(plan).toEqual({ close: ['a'], ensure: ['odigoi'] });
  });

  it('δεν κλείνει τοποθετήσεις που έβαλε κάποιος με το χέρι', () => {
    const plan = planLeaderPlacement([leader('a', 'poulia', { source: DataSource.LOCAL })], new Set());
    expect(plan).toEqual({ close: [], ensure: [] });
  });

  it('δεν κλείνει την τοποθέτηση ως μέλος (π.χ. Μεγάλη Οδηγός και Βοηθός)', () => {
    const plan = planLeaderPlacement([m('a', 'megaloi'), leader('b', 'poulia')], new Set(['poulia']));
    expect(plan).toEqual({ close: [], ensure: ['poulia'] });
  });
});
