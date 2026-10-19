import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind, MemberStatus, Prisma } from '@prisma/client';
import {
  TIMELINE_SECTION_LABEL,
  TIMELINE_SECTION_ORDER,
  collabDocument,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, hasCapabilityFor, scopedKladoi } from '../../common/util/klados-scope';
import { addDays, birthdaysIn } from '../calendar/birthdays';
import { CollabService } from '../collab/collab.service';
import { FilesService } from '../files/files.service';
import type { CreateSyggentrwshDto, UpdateSyggentrwshDto } from './dto/syggentrwsh.dto';

/** Πόσες μέρες πριν και μετά τη συγκέντρωση κοιτάμε για γενέθλια. */
const BIRTHDAY_WINDOW_DAYS = 3;

@Injectable()
export class SyggentrwseisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly collab: CollabService,
  ) {}

  async list(user: RequestUser, klados: KladosType | undefined, from?: Date, to?: Date) {
    if (klados) assertKladosAccess(user, klados);

    const where: Prisma.SyggentrwshWhereInput = {
      archivedAt: null,
      klados: {
        topikoId: user.topikoId,
        ...(klados ? { type: klados } : (scopedKladoi(user) ? { type: { in: scopedKladoi(user)! } } : {})),
      },
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    return this.prisma.syggentrwsh.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        klados: { select: { type: true } },
        drasi: { select: { id: true, title: true, type: true } },
        _count: { select: { parousies: true, timeline: true } },
      },
    });
  }

  /**
   * Πλήρης προβολή σχεδιασμού: timeline ανά μέρος, διαθεσιμότητα στελεχών,
   * απαιτούμενο υλικό και οι ενεργές δεσμεύσεις. Ένα request — η οθόνη
   * σχεδιασμού τα θέλει όλα μαζί και πρέπει να δουλεύει offline.
   */
  async findOne(user: RequestUser, id: string) {
    // Το πρόγραμμα που γράφεται αυτή τη στιγμή: πρώτα στη βάση.
    await this.collab.flushPending(collabDocument.syggentrwsh(id));
    const syggentrwsh = await this.prisma.syggentrwsh.findFirst({
      where: { id, klados: { topikoId: user.topikoId } },
      include: {
        klados: { select: { id: true, type: true, name: true } },
        drasi: { select: { id: true, title: true, type: true, dateStart: true, dateEnd: true } },
        timeline: {
          orderBy: [{ section: 'asc' }, { order: 'asc' }],
          include: {
            responsible: { select: { id: true, firstName: true, lastName: true } },
            yliko: { include: { yliko: { select: { id: true, name: true, category: true, unit: true } } } },
          },
        },
        parts: { select: { section: true, notes: true, durationMin: true } },
        ylikoItems: { orderBy: { order: 'asc' } },
        stelexi: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { user: { lastName: 'asc' } },
        },
        checkouts: {
          where: { status: { in: ['DESMEFSI', 'PARALAVI'] } },
          include: { yliko: { select: { id: true, name: true, unit: true } } },
        },
      },
    });
    if (!syggentrwsh) throw new NotFoundException('Η συγκέντρωση δεν βρέθηκε.');
    assertKladosAccess(user, syggentrwsh.klados.type as KladosType);

    const parts = new Map(syggentrwsh.parts.map((p) => [p.section, p]));

    const sections = TIMELINE_SECTION_ORDER.map((section) => {
      const blocks = syggentrwsh.timeline.filter((b) => b.section === section);
      const part = parts.get(section);
      return {
        section,
        label: TIMELINE_SECTION_LABEL[section],
        // Τα κομμάτια υπερισχύουν: όταν υπάρχουν, η διάρκεια του μέρους είναι
        // το άθροισμά τους και η αποθηκευμένη τιμή δεν σημαίνει τίποτα.
        durationMin: blocks.length
          ? blocks.reduce((sum, b) => sum + b.durationMin, 0)
          : (part?.durationMin ?? 0),
        ownDurationMin: part?.durationMin ?? 0,
        notes: part?.notes ?? '',
        blocks,
      };
    });

    return {
      ...syggentrwsh,
      sections,
      totalDurationMin: sections.reduce((sum, s) => sum + s.durationMin, 0),
      /** Συγκεντρωτικό απαιτούμενο υλικό — τι να πάρεις μαζί. */
      requiredYliko: aggregateRequiredYliko(syggentrwsh.timeline),
      birthdays: await this.birthdays(user, syggentrwsh.klados.id, syggentrwsh.klados.type as KladosType, syggentrwsh.date),
    };
  }

  /**
   * Γενέθλια των ενεργών μελών του κλάδου (παιδιά και στελέχη) από 3 μέρες πριν
   * έως 3 μέρες μετά τη συγκέντρωση — για να τα γιορτάσει η ομάδα. Μόνο σε όποιον
   * βλέπει τα μέλη του κλάδου.
   */
  private async birthdays(user: RequestUser, kladosId: string, klados: KladosType, date: Date) {
    if (!hasCapabilityFor(user, 'meloi:read', klados)) return [];
    const from = addDays(date, -BIRTHDAY_WINDOW_DAYS);
    const to = addDays(date, BIRTHDAY_WINDOW_DAYS);
    const members = await this.prisma.user.findMany({
      where: {
        archivedAt: null,
        guestTopikoCode: null,
        status: MemberStatus.ENERGO,
        birthDate: { not: null },
        memberships: { some: { kladosId, leftAt: null } },
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    return birthdaysIn(members, from, to);
  }

  async create(user: RequestUser, dto: CreateSyggentrwshDto) {
    assertKladosAccess(user, dto.kladosType);
    const klados = await this.kladosId(user, dto.kladosType);

    if (dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
      throw new BadRequestException('Η ώρα έναρξης πρέπει να προηγείται της λήξης.');
    }

    return this.prisma.syggentrwsh.create({
      data: {
        kladosId: klados,
        drasiId: dto.drasiId,
        title: dto.title,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        location: dto.location,
        goal: dto.goal,
      },
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateSyggentrwshDto) {
    await this.assertAccess(user, id);
    return this.prisma.syggentrwsh.update({ where: { id }, data: { ...dto } });
  }

  async archive(user: RequestUser, id: string) {
    await this.assertAccess(user, id);
    // Ό,τι γράφεται τώρα σώζεται, οι συνδέσεις κλείνουν και το κοινό έγγραφο σβήνει.
    await this.collab.remove(collabDocument.syggentrwsh(id));
    const updated = await this.prisma.syggentrwsh.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    // Οι εικόνες Markdown του σχεδιασμού φεύγουν από το S3 (όσες δεν χρησιμοποιούνται αλλού).
    const [sections, blocks] = await Promise.all([
      this.prisma.syggentrwshSection.findMany({ where: { syggentrwshId: id }, select: { notes: true } }),
      this.prisma.timelineBlock.findMany({ where: { syggentrwshId: id }, select: { description: true } }),
    ]);
    await this.files.cleanupMarkdownRefs(
      user.topikoId,
      [...sections.map((s) => s.notes), ...blocks.map((b) => b.description)],
      { syggentrwshId: id },
    );

    return updated;
  }

  /**
   * Ο σχεδιασμός γράφεται πια μαζί, ως κοινό έγγραφο (`syggentrwsh:<id>`, βλ.
   * `SyggentrwshCollab`). Ένα tab από πριν την αλλαγή θα έστελνε όλο το πρόγραμμα
   * και θα έσβηνε ό,τι γράφουν οι άλλοι — του λέμε να ανανεώσει.
   */
  replacePlan(): never {
    throw new ConflictException('Η εφαρμογή ενημερώθηκε — ανανέωσε τη σελίδα για να συνεχίσεις.');
  }

  /**
   * Τα ενεργά στελέχη του κλάδου, μαζί με όσα έχουν ήδη επιλεγεί.
   *
   * Ο κατάλογος έρχεται ολόκληρος και όχι μόνο οι επιλεγμένοι: η οθόνη
   * σχεδιασμού χρειάζεται και τα δύο — τις επιλογές του dropdown και τα
   * τσεκαρισμένα — και πρέπει να δουλεύει με ένα request.
   */
  async stelexi(user: RequestUser, id: string) {
    const syggentrwsh = await this.assertAccess(user, id);

    const [candidates, selected] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          status: MemberStatus.ENERGO,
          kind: MemberKind.STELEXOS,
          memberships: { some: { kladosId: syggentrwsh.kladosId, leftAt: null } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.syggentrwshStelexos.findMany({
        where: { syggentrwshId: id },
        select: { userId: true },
      }),
    ]);

    return { candidates, selectedIds: selected.map((s) => s.userId) };
  }

  private async assertAccess(user: RequestUser, id: string) {
    const syggentrwsh = await this.prisma.syggentrwsh.findFirst({
      where: { id, klados: { topikoId: user.topikoId } },
      include: { klados: { select: { type: true } } },
    });
    if (!syggentrwsh) throw new NotFoundException('Η συγκέντρωση δεν βρέθηκε.');
    assertKladosAccess(user, syggentrwsh.klados.type as KladosType);
    return syggentrwsh;
  }

  private async kladosId(user: RequestUser, type: KladosType): Promise<string> {
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${type} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}

type TimelineWithYliko = {
  yliko: { qty: number; yliko: { id: string; name: string; unit: string | null } }[];
};

/** Αθροίζει το απαιτούμενο υλικό όλων των κομματιών σε μία λίστα. */
function aggregateRequiredYliko(blocks: readonly TimelineWithYliko[]) {
  const totals = new Map<string, { id: string; name: string; unit: string | null; qty: number }>();

  for (const block of blocks) {
    for (const use of block.yliko) {
      const current = totals.get(use.yliko.id);
      totals.set(use.yliko.id, {
        id: use.yliko.id,
        name: use.yliko.name,
        unit: use.yliko.unit,
        qty: (current?.qty ?? 0) + use.qty,
      });
    }
  }

  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'el'));
}
