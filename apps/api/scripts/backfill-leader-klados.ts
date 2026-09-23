import { MemberKind, PrismaClient } from '@prisma/client';
import { deriveLeaderProfile } from '@trifylli/shared';

const prisma = new PrismaClient();

async function main() {
  const kladoi = await prisma.klados.findMany({ select: { id: true, type: true, topikoId: true } });
  const kladosId = new Map(kladoi.map((k) => [`${k.topikoId}:${k.type}`, k.id]));

  const leaders = await prisma.user.findMany({
    where: { archivedAt: null, licenses: { some: { status: 'ACTIVE' } } },
    select: {
      id: true,
      topikoId: true,
      licenses: { where: { status: 'ACTIVE' }, select: { title: true, status: true } },
    },
  });

  let upserts = 0;
  let leadersPlaced = 0;
  for (const leader of leaders) {
    const profile = deriveLeaderProfile(leader.licenses);
    let any = false;
    for (const role of profile.kladosRoles) {
      const kid = kladosId.get(`${leader.topikoId}:${role.kladosType}`);
      if (!kid) continue;
      await prisma.membership.upsert({
        where: { userId_kladosId: { userId: leader.id, kladosId: kid } },
        create: { userId: leader.id, kladosId: kid, kind: MemberKind.STELEXOS },
        update: {},
      });
      upserts++;
      any = true;
    }
    if (any) leadersPlaced++;
  }
  console.log(`leaders(active licenses)=${leaders.length} membershipUpserts=${upserts} leadersPlaced=${leadersPlaced}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
