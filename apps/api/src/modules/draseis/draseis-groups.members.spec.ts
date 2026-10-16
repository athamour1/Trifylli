import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisGroupsService } from './draseis-groups.service';

const DRASI = 'd-1';
const ME = { id: 'u-me' } as RequestUser;

/**
 * Μια βάση που κρατά μόνο ό,τι αγγίζει η προσθήκη/αφαίρεση μέλους: ομάδες με
 * ομαδάρχη και μέλη ανά είδος (ένα μέλος σε μία ομάδα κάθε είδους).
 */
function setup() {
  const groups = [
    { id: 'g-a', drasiId: DRASI, kind: 'ENOMOTIA', leaderParticipantId: 'p-1' as string | null },
    { id: 'g-b', drasiId: DRASI, kind: 'ENOMOTIA', leaderParticipantId: null as string | null },
    { id: 'g-oe', drasiId: DRASI, kind: 'OE', leaderParticipantId: 'p-stelexos' as string | null },
  ];
  const members = [
    { groupId: 'g-a', participantId: 'p-1', kind: 'ENOMOTIA' },
    { groupId: 'g-a', participantId: 'p-2', kind: 'ENOMOTIA' },
  ];
  const participants = [
    { id: 'p-1', drasiId: DRASI, kind: 'MELOS' },
    { id: 'p-2', drasiId: DRASI, kind: 'MELOS' },
    { id: 'p-3', drasiId: DRASI, kind: 'MELOS' },
    { id: 'p-stelexos', drasiId: DRASI, kind: 'STELEXOS' },
  ];
  const prisma = {
    drasiGroup: {
      findFirst: async ({ where }: { where: { id: string; drasiId: string } }) => groups.find((g) => g.id === where.id && g.drasiId === where.drasiId) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { drasiId: string; kind: string; id: string | { not: string }; leaderParticipantId: string };
        data: { leaderParticipantId: null };
      }) => {
        const idMatches = (id: string) => (typeof where.id === 'string' ? id === where.id : id !== where.id.not);
        for (const g of groups) {
          if (g.drasiId === where.drasiId && g.kind === where.kind && idMatches(g.id) && g.leaderParticipantId === where.leaderParticipantId) Object.assign(g, data);
        }
      },
    },
    drasiParticipant: {
      findFirst: async ({ where }: { where: { id: string; drasiId: string } }) => participants.find((p) => p.id === where.id && p.drasiId === where.drasiId) ?? null,
    },
    drasiGroupMember: {
      deleteMany: async ({ where }: { where: { kind: string; participantId: string; groupId?: string } }) => {
        for (let i = members.length - 1; i >= 0; i -= 1) {
          const m = members[i]!;
          if (m.kind === where.kind && m.participantId === where.participantId && (!where.groupId || m.groupId === where.groupId)) members.splice(i, 1);
        }
      },
      create: async ({ data }: { data: { groupId: string; participantId: string; kind: string } }) => members.push(data),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  const access = { load: async () => ({ id: DRASI }) };
  const service = new DraseisGroupsService(prisma as never, access as never);
  const membersOf = (groupId: string) => members.filter((m) => m.groupId === groupId).map((m) => m.participantId).sort();
  return { service, groups, membersOf };
}

describe('μέλη ομάδας ένα-ένα', () => {
  it('δύο που προσθέτουν μαζί διαφορετικά παιδιά στην ίδια ενωμοτία: μπαίνουν και τα δύο', async () => {
    const { service, membersOf } = setup();
    await service.addMember(ME, DRASI, 'g-b', 'p-3');
    await service.addMember(ME, DRASI, 'g-b', 'p-2');
    expect(membersOf('g-b')).toEqual(['p-2', 'p-3']);
    // Το p-2 μεταφέρθηκε: μία ενωμοτία ανά παιδί.
    expect(membersOf('g-a')).toEqual(['p-1']);
  });

  it('ο ομαδάρχης που μεταφέρεται σε άλλη ομάδα παύει να είναι ομαδάρχης της παλιάς', async () => {
    const { service, groups } = setup();
    await service.addMember(ME, DRASI, 'g-b', 'p-1');
    expect(groups.find((g) => g.id === 'g-a')?.leaderParticipantId).toBeNull();
  });

  it('αφαίρεση: βγαίνει μόνο αυτός· αν ήταν ομαδάρχης, η ομάδα μένει χωρίς', async () => {
    const { service, groups, membersOf } = setup();
    await service.removeMember(ME, DRASI, 'g-a', 'p-1');
    expect(membersOf('g-a')).toEqual(['p-2']);
    expect(groups.find((g) => g.id === 'g-a')?.leaderParticipantId).toBeNull();
  });

  it('στις ΟΕ μέλη είναι μόνο παιδιά', async () => {
    const { service } = setup();
    await expect(service.addMember(ME, DRASI, 'g-oe', 'p-stelexos')).rejects.toThrow(/μόνο παιδιά/);
  });

  it('συμμετέχων άλλης δράσης: όχι', async () => {
    const { service } = setup();
    await expect(service.addMember(ME, DRASI, 'g-a', 'p-ξένος')).rejects.toThrow(/δεν ανήκει/);
  });
});
