import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiStatus, MemberKind } from '@prisma/client';
import { can, drasiAccess, isSuperAdmin, type DrasiAccess, type DrasiRoleKind, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { accessProfileOf, assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';

/**
 * Ο έλεγχος εμβέλειας μιας δράσης, κοινός για όλα τα services της.
 *
 * Εγγραφή: μόνο ο διοργανωτής (ή ο υπερδιαχειριστής για δράσεις Τοπικού), και
 * μόνο αν η δράση δεν έχει κλείσει. Ανάγνωση: και ο κλάδος που απλώς
 * **συμμετέχει** — τα στελέχη του θα είναι εκεί, χρειάζονται πρόγραμμα, ομάδες
 * και αρχηγείο.
 */
@Injectable()
export class DrasiAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Τι μπορεί ο χρήστης σε αυτή τη δράση (βλ. `drasiAccess`):
   *  - πλήρης: υπερδιαχειριστής ή όποιος γράφει στις δράσεις του διοργανωτή·
   *  - στέλεχος: ρόλος στο αρχηγείο της, στέλεχος στους συμμετέχοντες, ή
   *    διαχειριστής/Αρχηγός κλάδου που απλώς συμμετέχει (βλέπει, δεν αλλάζει).
   */
  async accessFor(user: RequestUser, id: string): Promise<DrasiAccess> {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      select: {
        klados: { select: { type: true } },
        kladoi: { select: { klados: { select: { type: true } } } },
        roles: { where: { userId: user.id }, select: { kind: true } },
        participants: { where: { userId: user.id, kind: MemberKind.STELEXOS }, select: { id: true } },
      },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');
    const profile = accessProfileOf(user);
    const organiser = drasi.klados?.type as KladosType | undefined;
    const full = isSuperAdmin(profile) || can(profile, 'drasi:write', organiser);
    const participatingAdmin = drasi.kladoi.some((k) => can(profile, 'drasi:write', k.klados.type as KladosType));
    return drasiAccess({
      full,
      staff: drasi.participants.length > 0 || participatingAdmin,
      roles: drasi.roles.map((r) => r.kind as DrasiRoleKind),
    });
  }

  async load(user: RequestUser, id: string, mode: 'read' | 'write', options: { allowClosed?: boolean } = {}) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } }, kladoi: { select: { klados: { select: { type: true } } } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');

    // Το αίτημα το ενέκρινε ήδη ο `DrasiPermGuard` με τους ρόλους της δράσης·
    // μένει μόνο ο κανόνας «κλειστή δράση δεν αλλάζει».
    if (user.drasiGrant?.drasiId === id) {
      if (mode === 'write' && drasi.status === DrasiStatus.KLEISTI && !options.allowClosed) {
        throw new ConflictException('Η δράση είναι κλειστή — δεν δέχεται αλλαγές.');
      }
      return drasi;
    }

    const organiser = drasi.klados?.type as KladosType | undefined;
    if (mode === 'write') {
      assertKladosAccess(user, organiser);
      if (drasi.status === DrasiStatus.KLEISTI && !options.allowClosed) {
        throw new ConflictException('Η δράση είναι κλειστή — δεν δέχεται αλλαγές.');
      }
    } else {
      const scope = scopedKladoi(user);
      const participating = drasi.kladoi.map((k) => k.klados.type as KladosType);
      if (scope && organiser && !scope.includes(organiser) && !participating.some((k) => scope.includes(k))) {
        throw new ForbiddenException(`Δεν έχετε πρόσβαση στα δεδομένα του κλάδου ${organiser}.`);
      }
    }
    return drasi;
  }
}
