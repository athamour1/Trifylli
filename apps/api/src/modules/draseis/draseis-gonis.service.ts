import { Injectable } from '@nestjs/common';
import { DrasiRoleKind } from '@prisma/client';
import { collabDocument, defaultParentLetter, type DrasiExartysiView, type DrasiType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollabService } from '../collab/collab.service';
import { DrasiAccessService } from './drasi-access.service';
import { exartysiOrDefault } from './drasi-exartysi';

/**
 * Τα χαρτιά της δράσης για τους γονείς: το γράμμα (Πρόγραμμα) και η εξάρτυση
 * (Λειτουργία). Τα γράφουν μαζί ως κοινά έγγραφα (`DrasiCollab`)· εδώ η ανάγνωση
 * και τα πρότυπα από τα οποία ξεκινούν.
 */
@Injectable()
export class DraseisGonisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly collab: CollabService,
  ) {}

  async gramma(user: RequestUser, id: string): Promise<{ text: string }> {
    // Ό,τι γράφεται αυτή τη στιγμή: πρώτα στη βάση.
    await this.collab.flushPending(collabDocument.drasiPrefix(id));
    const drasi = await this.access.load(user, id, 'read');
    return { text: drasi.parentLetter ?? (await this.letterTemplate(id)) ?? '' };
  }

  async exartysi(user: RequestUser, id: string): Promise<DrasiExartysiView> {
    await this.collab.flushPending(collabDocument.drasiPrefix(id));
    const drasi = await this.access.load(user, id, 'read');
    return exartysiOrDefault(drasi.exartysi);
  }

  /**
   * Το πρότυπο του γράμματος, γεμάτο με τα στοιχεία της δράσης: ημερομηνίες,
   * τόπος, κόστος, Τοπικά, ο Αρχηγός που υπογράφει. `null` αν η δράση δεν υπάρχει.
   */
  async letterTemplate(drasiId: string): Promise<string | null> {
    const drasi = await this.prisma.drasi.findUnique({
      where: { id: drasiId },
      select: {
        type: true,
        dateStart: true,
        dateEnd: true,
        location: true,
        costPerPerson: true,
        costReduced: true,
        topiko: { select: { name: true, location: true } },
        guestTopika: { orderBy: { topikoName: 'asc' }, select: { topikoName: true } },
        roles: {
          where: { kind: DrasiRoleKind.ARXIGOS },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { user: { select: { firstName: true, lastName: true, phone: true, email: true } } },
        },
      },
    });
    if (!drasi) return null;
    const arxigos = drasi.roles[0]?.user;
    return defaultParentLetter({
      type: drasi.type as DrasiType,
      dateStart: drasi.dateStart,
      dateEnd: drasi.dateEnd,
      location: drasi.location,
      costPerPerson: drasi.costPerPerson === null ? null : Number(drasi.costPerPerson),
      costReduced: drasi.costReduced === null ? null : Number(drasi.costReduced),
      guestTopika: drasi.guestTopika.map((g) => g.topikoName),
      ourTopiko: drasi.topiko.location || drasi.topiko.name,
      arxigos: arxigos ? { name: `${arxigos.firstName} ${arxigos.lastName}`.trim(), phone: arxigos.phone, email: arxigos.email } : null,
    });
  }
}
