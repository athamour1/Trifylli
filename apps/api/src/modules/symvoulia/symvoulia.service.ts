import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KLADOS_SYMVOULIA,
  SYMVOULIO_TYPE_LABEL,
  TOPIKO_SYMVOULIA,
  can,
  type KladosType,
  type SymvoulioType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import { MemberKind, MemberStatus } from '@prisma/client';
import { FilesService } from '../files/files.service';
import type { CreateSymvoulioDto, UpdateSymvoulioDto } from './dto/symvoulio.dto';

@Injectable()
export class SymvouliaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async list(user: RequestUser, type?: SymvoulioType, klados?: KladosType, drasiId?: string) {
    if (klados) assertKladosAccess(user, klados);

    const where: Prisma.SymvoulioWhereInput = {
      topikoId: user.topikoId,
      archivedAt: null,
      ...(type ? { type } : {}),
      ...(drasiId ? { drasiId } : {}),
      ...(klados
        ? { klados: { type: klados } }
        : scopedKladoi(user)
          ? { OR: [{ kladosId: null }, { klados: { type: { in: user.kladoi } } }] }
          : {}),
    };

    const rows = await this.prisma.symvoulio.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        klados: { select: { type: true } },
        chair: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { participants: true } },
      },
    });

    return rows.map((row) => ({
      ...row,
      typeLabel: SYMVOULIO_TYPE_LABEL[row.type as SymvoulioType],
      finalized: row.finalizedAt !== null,
    }));
  }

  async findOne(user: RequestUser, id: string) {
    const symvoulio = await this.prisma.symvoulio.findFirst({
      where: { id, topikoId: user.topikoId },
      include: {
        klados: { select: { type: true, name: true } },
        chair: { select: { id: true, firstName: true, lastName: true } },
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { user: { lastName: 'asc' } },
        },
      },
    });
    if (!symvoulio) throw new NotFoundException('Το συμβούλιο δεν βρέθηκε.');
    assertKladosAccess(user, symvoulio.klados?.type as KladosType | undefined);

    return {
      ...symvoulio,
      typeLabel: SYMVOULIO_TYPE_LABEL[symvoulio.type as SymvoulioType],
      finalized: symvoulio.finalizedAt !== null,
    };
  }

  async create(user: RequestUser, dto: CreateSymvoulioDto) {
    const isKladosType = (KLADOS_SYMVOULIA as readonly string[]).includes(dto.type);
    const isTopikoType = (TOPIKO_SYMVOULIA as readonly string[]).includes(dto.type);

    // Ο τύπος καθορίζει το επίπεδο: συμβούλιο κλάδου δεν έχει νόημα χωρίς
    // κλάδο, συμβούλιο Τοπικού δεν έχει νόημα μέσα σε κλάδο.
    if (isKladosType && !dto.kladosType) {
      throw new BadRequestException(
        `Το «${SYMVOULIO_TYPE_LABEL[dto.type]}» απαιτεί κλάδο.`,
      );
    }
    if (isTopikoType && dto.kladosType) {
      throw new BadRequestException(
        `Το «${SYMVOULIO_TYPE_LABEL[dto.type]}» δεν ανήκει σε κλάδο.`,
      );
    }

    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;

    return this.prisma.symvoulio.create({
      data: {
        topikoId: user.topikoId,
        kladosId,
        drasiId: dto.drasiId,
        type: dto.type,
        title: dto.title,
        date: dto.date,
        location: dto.location,
        chairId: dto.chairId,
      },
    });
  }

  /**
   * Ενημέρωση — μαζί με τους συμμετέχοντες, σε μία συναλλαγή.
   *
   * Το `participantIds` αντικαθιστά τη λίστα· η απουσία του σημαίνει «δεν την
   * πειράζω», ώστε μια αποθήκευση που αφορά μόνο το κείμενο να μην τη σβήνει.
   */
  async update(user: RequestUser, id: string, dto: UpdateSymvoulioDto) {
    await this.assertEditable(user, id);
    const { participantIds, ...fields } = dto;

    return this.prisma.$transaction(async (tx) => {
      const symvoulio = await tx.symvoulio.update({ where: { id }, data: { ...fields } });

      if (participantIds) {
        await tx.symvoulioParticipant.deleteMany({ where: { symvoulioId: id } });
        if (participantIds.length) {
          await tx.symvoulioParticipant.createMany({
            data: [...new Set(participantIds)].map((userId) => ({ symvoulioId: id, userId })),
          });
        }
      }

      return symvoulio;
    });
  }

  /**
   * Ποια στελέχη μπορούν να δηλωθούν συμμετέχοντες, και ποια έχουν ήδη δηλωθεί.
   *
   * Η εμβέλεια ακολουθεί το επίπεδο του συμβουλίου: σε συμβούλιο κλάδου μόνο
   * τα στελέχη του κλάδου, σε συμβούλιο Τοπικού όλα τα στελέχη του Τοπικού.
   */
  async stelexi(user: RequestUser, id: string) {
    const symvoulio = await this.prisma.symvoulio.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!symvoulio) throw new NotFoundException('Το συμβούλιο δεν βρέθηκε.');
    assertKladosAccess(user, symvoulio.klados?.type as KladosType | undefined);

    const [candidates, selected] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          status: MemberStatus.ENERGO,
          kind: MemberKind.STELEXOS,
          ...(symvoulio.kladosId
            ? { memberships: { some: { kladosId: symvoulio.kladosId, leftAt: null } } }
            : {}),
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.symvoulioParticipant.findMany({
        where: { symvoulioId: id },
        select: { userId: true },
      }),
    ]);

    return { candidates, selectedIds: selected.map((row) => row.userId) };
  }

  /** Κλείδωμα πρακτικών μετά την έγκριση — από εκεί και πέρα μόνο ανάγνωση. */
  async finalize(user: RequestUser, id: string) {
    const symvoulio = await this.assertEditable(user, id);
    if (!symvoulio.minutes?.trim()) {
      throw new BadRequestException('Δεν μπορεί να οριστικοποιηθεί συμβούλιο χωρίς πρακτικά.');
    }
    return this.prisma.symvoulio.update({ where: { id }, data: { finalizedAt: new Date() } });
  }

  /**
   * Αρχειοθέτηση.
   *
   * Δεν περνά από το `assertEditable`: η διαγραφή ενός συμβουλίου δεν είναι
   * αλλαγή των πρακτικών του, οπότε επιτρέπεται και σε οριστικοποιημένο.
   */
  async archive(user: RequestUser, id: string) {
    await this.assertAccess(user, id);
    const symvoulio = await this.prisma.symvoulio.findUniqueOrThrow({
      where: { id },
      select: { agenda: true, minutes: true },
    });
    const updated = await this.prisma.symvoulio.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    // Οι εικόνες Markdown από ατζέντα/πρακτικά φεύγουν από το S3 (όσες δεν χρησιμοποιούνται αλλού).
    await this.files.cleanupMarkdownRefs(user.topikoId, [symvoulio.agenda, symvoulio.minutes], {
      symvoulioId: id,
    });

    return updated;
  }

  /**
   * Εμβέλεια και δικαίωμα εγγραφής για ένα υπάρχον συμβούλιο.
   *
   * Ο έλεγχος για τα συμβούλια Τοπικού γίνεται **εδώ** και όχι μόνο στη
   * δημιουργία: το guard του controller ζητά `symvoulio:klados:write`, που την
   * έχει και ο διαχειριστής κλάδου, και το `assertKladosAccess` δεν λέει τίποτα
   * για πόρους χωρίς κλάδο. Χωρίς αυτό, ένας διαχειριστής κλάδου θα μπορούσε να
   * αλλάξει ή να σβήσει πρακτικά Τοπικού.
   */
  private async assertAccess(user: RequestUser, id: string) {
    const symvoulio = await this.prisma.symvoulio.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!symvoulio) throw new NotFoundException('Το συμβούλιο δεν βρέθηκε.');
    assertKladosAccess(user, symvoulio.klados?.type as KladosType | undefined);

    const isTopiko = (TOPIKO_SYMVOULIA as readonly string[]).includes(symvoulio.type);
    if (isTopiko && !can({ role: user.role, adminKlados: user.adminKlados }, 'symvoulio:topiko:write')) {
      throw new ForbiddenException('Τα συμβούλια Τοπικού τα διαχειρίζεται ο υπερδιαχειριστής.');
    }

    return symvoulio;
  }

  private async assertEditable(user: RequestUser, id: string) {
    const symvoulio = await this.assertAccess(user, id);
    if (symvoulio.finalizedAt) {
      throw new ConflictException('Τα πρακτικά έχουν οριστικοποιηθεί και δεν τροποποιούνται.');
    }
    return symvoulio;
  }

  private async kladosId(user: RequestUser, type: KladosType): Promise<string> {
    assertKladosAccess(user, type);
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${type} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}
