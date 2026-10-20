import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, DrasiStatus, MemberKind } from '@prisma/client';
import { can, drasiAccess, isSuperAdmin, type AccessProfile, type DrasiAccess, type DrasiRoleKind, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { accessProfileOf, assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';

/**
 * Βλέπει ο χρήστης τη δράση από τον κλάδο του — τον διοργανωτή ή κλάδο που
 * συμμετέχει (δράση Τοπικού χωρίς κλάδους: όποιος βλέπει ημερολόγιο κάπου);
 * Αλλιώς μπαίνει μόνο ως στέλεχος της δράσης: στέλεχος άλλου κλάδου του
 * Τοπικού ή εξωτερικός, και η πρόσβασή του λήγει με το κλείσιμο της δράσης.
 */
export function viaOwnKlados(profile: AccessProfile, kladoi: readonly KladosType[]): boolean {
  return kladoi.length ? kladoi.some((klados) => can(profile, 'calendar:read', klados)) : can(profile, 'calendar:read');
}

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
        status: true,
        archivedAt: true,
        klados: { select: { type: true } },
        kladoi: { select: { klados: { select: { type: true } } } },
        roles: { where: { userId: user.id }, select: { kind: true } },
        participants: { where: { userId: user.id, kind: MemberKind.STELEXOS }, select: { id: true } },
        ypiresies: { where: { responsibles: { some: { userId: user.id } } }, select: { id: true } },
      },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');
    const profile = accessProfileOf(user);
    const organiser = drasi.klados?.type as KladosType | undefined;
    const full = isSuperAdmin(profile) || can(profile, 'drasi:write', organiser);
    // Εξωτερικός ή στέλεχος άλλου κλάδου: μπήκε μόνο μέσω της δράσης, και η
    // πρόσβαση λήγει με το κλείσιμο (ή την αρχειοθέτηση) της.
    const drasiKladoi = [organiser, ...drasi.kladoi.map((k) => k.klados.type as KladosType)].filter((k): k is KladosType => !!k);
    const ended = drasi.status === DrasiStatus.KLEISTI || !!drasi.archivedAt;
    if (ended && !full && (user.role === AccountRole.EXTERNAL || !viaOwnKlados(profile, drasiKladoi))) {
      return drasiAccess({ full: false, staff: false, roles: [] });
    }
    const participatingAdmin = drasi.kladoi.some((k) => can(profile, 'drasi:write', k.klados.type as KladosType));
    return drasiAccess({
      full,
      // Υπεύθυνος υπηρεσίας = στέλεχος της δράσης (όπως όταν οι υπηρεσίες ήταν ρόλοι).
      staff: drasi.participants.length > 0 || drasi.ypiresies.length > 0 || participatingAdmin,
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
