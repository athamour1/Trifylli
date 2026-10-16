import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisService } from './draseis.service';

const DRASI = 'd-1';
const ME = { id: 'u-me', topikoId: 't-1', drasiGrant: { drasiId: DRASI } } as unknown as RequestUser;

/** Οι ρόλοι μιας δράσης στη μνήμη — ένα (ευθύνη, άτομο) μία φορά. */
function setup() {
  const roles: { drasiId: string; kind: string; userId: string; note: string | null }[] = [{ drasiId: DRASI, kind: 'ARXIGOS', userId: 'u-1', note: null }];
  const revoked: string[] = [];
  const prisma = {
    drasi: { findFirst: async () => ({ id: DRASI, title: 'Πεζοπορία', klados: { type: 'ODIGOI' } }) },
    user: {
      findFirst: async ({ where }: { where: { id: string; topikoId: string } }) =>
        ['u-1', 'u-2', 'u-3', 'u-me'].includes(where.id) && where.topikoId === 't-1' ? { id: where.id } : null,
    },
    drasiRole: {
      findUnique: async ({ where }: { where: { drasiId_kind_userId: { drasiId: string; kind: string; userId: string } } }) => {
        const key = where.drasiId_kind_userId;
        return roles.find((r) => r.drasiId === key.drasiId && r.kind === key.kind && r.userId === key.userId) ?? null;
      },
      upsert: async ({ where, create, update }: { where: { drasiId_kind_userId: { drasiId: string; kind: string; userId: string } }; create: (typeof roles)[number]; update: Partial<(typeof roles)[number]> }) => {
        const key = where.drasiId_kind_userId;
        const row = roles.find((r) => r.drasiId === key.drasiId && r.kind === key.kind && r.userId === key.userId);
        if (row) Object.assign(row, update);
        else roles.push(create);
      },
      deleteMany: async ({ where }: { where: { drasiId: string; kind: string; userId: string } }) => {
        for (let i = roles.length - 1; i >= 0; i -= 1) {
          const r = roles[i]!;
          if (r.drasiId === where.drasiId && r.kind === where.kind && r.userId === where.userId) roles.splice(i, 1);
        }
      },
    },
  };
  const collab = { revokeAll: (prefix: string) => revoked.push(prefix) };
  const notified: { userIds: string[]; kind: string; title: string; link?: string | null }[] = [];
  const notifications = { notify: async (userIds: string[], input: { kind: string; title: string; link?: string | null }) => void notified.push({ userIds, ...input }) };
  const service = new DraseisService(prisma as never, {} as never, collab as never, notifications as never);
  return { service, roles, revoked, notified };
}

describe('ρόλοι της δράσης ένας-ένας', () => {
  it('δύο που ορίζουν μαζί διαφορετικούς ρόλους: μένουν και οι δύο', async () => {
    const { service, roles } = setup();
    await service.addRole(ME, DRASI, 'PROGRAMMA', 'u-2');
    await service.addRole(ME, DRASI, 'TAMIAS', 'u-3');
    expect(roles.map((r) => `${r.kind}:${r.userId}`).sort()).toEqual(['ARXIGOS:u-1', 'PROGRAMMA:u-2', 'TAMIAS:u-3']);
  });

  it('ίδιος ρόλος στο ίδιο άτομο δεύτερη φορά: μία γραμμή', async () => {
    const { service, roles } = setup();
    await service.addRole(ME, DRASI, 'ARXIGOS', 'u-1');
    expect(roles).toHaveLength(1);
  });

  it('αφαίρεση: φεύγει μόνο αυτός ο ρόλος', async () => {
    const { service, roles } = setup();
    await service.addRole(ME, DRASI, 'PROGRAMMA', 'u-1');
    await service.removeRole(ME, DRASI, 'ARXIGOS', 'u-1');
    expect(roles.map((r) => `${r.kind}:${r.userId}`)).toEqual(['PROGRAMMA:u-1']);
  });

  it('άγνωστο στέλεχος: όχι', async () => {
    const { service } = setup();
    await expect(service.addRole(ME, DRASI, 'PROGRAMMA', 'u-ξένος')).rejects.toThrow(/Άγνωστο στέλεχος/);
  });

  it('κάθε αλλαγή ρόλου κλείνει τις συνδέσεις της δράσης (νέα δικαιώματα)', async () => {
    const { service, revoked } = setup();
    await service.addRole(ME, DRASI, 'PROGRAMMA', 'u-2');
    await service.removeRole(ME, DRASI, 'PROGRAMMA', 'u-2');
    expect(revoked).toEqual([`drasi:${DRASI}:`, `drasi:${DRASI}:`]);
  });

  it('όποιος παίρνει ρόλο ειδοποιείται — με τι και πού, όχι ποιος άλλος', async () => {
    const { service, notified } = setup();
    await service.addRole(ME, DRASI, 'PROGRAMMA', 'u-2');
    await service.addRole(ME, DRASI, 'PROGRAMMA', 'u-me');

    expect(notified).toEqual([
      { userIds: ['u-2'], kind: 'role', title: 'Νέος ρόλος στη δράση «Πεζοπορία»: Πρόγραμμα', link: `/draseis/${DRASI}` },
    ]);
  });
});
