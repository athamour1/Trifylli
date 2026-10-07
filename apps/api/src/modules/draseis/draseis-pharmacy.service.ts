import { BadRequestException, Injectable } from '@nestjs/common';
import type { DrasiPharmacyView, KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';

/**
 * Το φαρμακείο της δράσης (F6): ποια kits πάνε μαζί της.
 *
 * Υποψήφια είναι όσα είναι **στην εμβέλεια του διοργανωτή** — δικά του, ή
 * δανεισμένα σε αυτόν. Ο δανεισμός από άλλον κλάδο γίνεται από τον κάτοχο,
 * στη σελίδα Φαρμακεία (φυσική ανάθεση στο OuchTracker)· εδώ μόνο δηλώνουμε
 * ποιο kit ακολουθεί τη δράση, ώστε ο κάτοχός του να δει τη σύνοψη υγείας.
 */
@Injectable()
export class DraseisPharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
  ) {}

  async view(user: RequestUser, id: string): Promise<DrasiPharmacyView> {
    const drasi = await this.access.load(user, id, 'read');
    const [assigned, own, borrowed] = await Promise.all([
      this.prisma.drasiPharmacyKit.findMany({
        where: { drasiId: id },
        include: { kit: { include: { klados: { select: { type: true } } } } },
      }),
      this.prisma.pharmacyKit.findMany({
        where: { topikoId: user.topikoId, archivedAt: null, kladosId: drasi.kladosId },
        include: { klados: { select: { type: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.pharmacyKit.findMany({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          kladosId: { not: drasi.kladosId },
          loans: { some: { returnedAt: null, toKladosId: drasi.kladosId } },
        },
        include: { klados: { select: { type: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      assigned: assigned.map((a) => ({
        id: a.kit.id,
        name: a.kit.name,
        kladosType: (a.kit.klados?.type as KladosType | undefined) ?? null,
        ouchtrackerKitId: a.kit.ouchtrackerKitId,
      })),
      candidates: [
        ...own.map((k) => ({ id: k.id, name: k.name, kladosType: (k.klados?.type as KladosType | undefined) ?? null, borrowed: false })),
        ...borrowed.map((k) => ({ id: k.id, name: k.name, kladosType: (k.klados?.type as KladosType | undefined) ?? null, borrowed: true })),
      ],
    };
  }

  async setKits(user: RequestUser, id: string, kitIds: string[]) {
    await this.access.load(user, id, 'write');
    const { candidates } = await this.view(user, id);
    const allowed = new Set(candidates.map((c) => c.id));
    const unknown = kitIds.filter((k) => !allowed.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException('Κάποιο φαρμακείο δεν είναι στην εμβέλεια της δράσης — ζήτησε δανεισμό από τον κάτοχό του.');
    }
    await this.prisma.$transaction([
      this.prisma.drasiPharmacyKit.deleteMany({ where: { drasiId: id } }),
      this.prisma.drasiPharmacyKit.createMany({ data: [...new Set(kitIds)].map((pharmacyKitId) => ({ drasiId: id, pharmacyKitId })) }),
    ]);
    return this.view(user, id);
  }
}
