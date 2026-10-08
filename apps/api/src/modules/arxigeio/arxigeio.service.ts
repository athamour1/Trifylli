import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind } from '@prisma/client';
import {
  deriveLeaderProfile,
  LeaderRank,
  type ArxigeioMember,
  type ArxigeioView,
  type KladosDuty,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess } from '../../common/util/klados-scope';

const RANK_ORDER: Record<string, number> = { [LeaderRank.ARCHIGOS]: 0, [LeaderRank.YPARCHIGOS]: 1, [LeaderRank.VOITHOS]: 2 };

/**
 * Το αρχηγείο ενός κλάδου: ποιος είναι τι (βαθμός, από τα πτυχία του e-SEO) και
 * ποιος κρατά τι (υπευθυνότητες, δηλωμένες εδώ).
 *
 * Μέλη του αρχηγείου είναι τα ενεργά στελέχη του κλάδου. Όσοι είναι **μόνο**
 * στελέχη SOS μένουν εκτός: δεν έχουν ρόλο στη ζωή του κλάδου στην πλατφόρμα.
 */
@Injectable()
export class ArxigeioService {
  constructor(private readonly prisma: PrismaService) {}

  async view(user: RequestUser, klados: KladosType): Promise<ArxigeioView> {
    assertKladosAccess(user, klados);
    const kladosId = await this.kladosId(user, klados);
    return { klados, members: await this.members(kladosId, klados) };
  }

  async setDuties(user: RequestUser, klados: KladosType, userId: string, duties: KladosDuty[]): Promise<ArxigeioMember> {
    assertKladosAccess(user, klados);
    const kladosId = await this.kladosId(user, klados);
    const member = (await this.members(kladosId, klados)).find((m) => m.userId === userId);
    if (!member) throw new BadRequestException('Το άτομο δεν είναι στέλεχος του αρχηγείου του κλάδου.');

    const wanted = [...new Set(duties)];
    await this.prisma.$transaction([
      this.prisma.kladosResponsibility.deleteMany({ where: { kladosId, userId, duty: { notIn: wanted } } }),
      this.prisma.kladosResponsibility.createMany({
        data: wanted.map((duty) => ({ kladosId, userId, duty })),
        skipDuplicates: true,
      }),
    ]);
    return { ...member, duties: wanted };
  }

  private async members(kladosId: string, klados: KladosType): Promise<ArxigeioMember[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        archivedAt: null,
        memberships: { some: { kladosId, leftAt: null, kind: MemberKind.STELEXOS } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenses: { where: { status: 'ACTIVE' }, select: { title: true, status: true } },
        responsibilities: { where: { kladosId }, select: { duty: true } },
      },
    });

    const members: ArxigeioMember[] = [];
    for (const row of rows) {
      const profile = deriveLeaderProfile(row.licenses);
      const role = profile.kladosRoles.find((r) => r.kladosType === klados) ?? null;
      // Μόνο SOS, χωρίς θέση σε αυτόν τον κλάδο: εκτός αρχηγείου.
      if (profile.isSOS && !role) continue;
      members.push({
        userId: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        rank: role?.rank ?? null,
        rankTitle: role?.title ?? null,
        duties: row.responsibilities.map((r) => r.duty as KladosDuty),
      });
    }
    // Αρχηγός → Υπαρχηγοί → Βοηθοί → χωρίς βαθμό, και αλφαβητικά μέσα σε κάθε ομάδα.
    return members.sort(
      (a, b) =>
        (a.rank ? RANK_ORDER[a.rank]! : 9) - (b.rank ? RANK_ORDER[b.rank]! : 9) ||
        a.lastName.localeCompare(b.lastName, 'el') ||
        a.firstName.localeCompare(b.firstName, 'el'),
    );
  }

  private async kladosId(user: RequestUser, klados: KladosType): Promise<string> {
    const row = await this.prisma.klados.findFirst({ where: { topikoId: user.topikoId, type: klados }, select: { id: true } });
    if (!row) throw new NotFoundException('Ο κλάδος δεν βρέθηκε.');
    return row.id;
  }
}
