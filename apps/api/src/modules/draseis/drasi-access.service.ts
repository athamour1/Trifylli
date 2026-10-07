import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiStatus } from '@prisma/client';
import type { KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';

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

  async load(user: RequestUser, id: string, mode: 'read' | 'write', options: { allowClosed?: boolean } = {}) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } }, kladoi: { select: { klados: { select: { type: true } } } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');

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
