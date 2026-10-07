import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind, MemberStatus, Prisma, TimelineSection } from '@prisma/client';
import {
  TIMELINE_SECTION_LABEL,
  TIMELINE_SECTION_ORDER,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import { FilesService } from '../files/files.service';
import type {
  CreateSyggentrwshDto,
  ReplacePlanDto,
  UpdateSyggentrwshDto,
} from './dto/syggentrwsh.dto';

@Injectable()
export class SyggentrwseisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async list(user: RequestUser, klados: KladosType | undefined, from?: Date, to?: Date) {
    if (klados) assertKladosAccess(user, klados);

    const where: Prisma.SyggentrwshWhereInput = {
      archivedAt: null,
      klados: {
        topikoId: user.topikoId,
        ...(klados ? { type: klados } : (scopedKladoi(user) ? { type: { in: user.kladoi } } : {})),
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
    };
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
   * Αντικαθιστά ολόκληρο τον σχεδιασμό — κομμάτια, σημειώσεις ανά μέρος και
   * λίστα υλικού — μέσα σε μία συναλλαγή.
   *
   * Η διαγραφή προηγείται της εισαγωγής: το `@@unique([syggentrwshId, section, order])`
   * θα έσκαγε αν προσπαθούσαμε να αναδιατάξουμε επί τόπου.
   *
   * Τα `sections`, `yliko` και `stelexosIds` είναι προαιρετικά και σημαίνουν
   * «δεν τα πειράζω»: μια αποθήκευση που στέλνει μόνο κομμάτια δεν σβήνει τις
   * σημειώσεις.
   */
  async replacePlan(user: RequestUser, id: string, dto: ReplacePlanDto) {
    await this.assertAccess(user, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.timelineBlock.deleteMany({ where: { syggentrwshId: id } });

      const counters = new Map<TimelineSection, number>();
      for (const block of dto.blocks) {
        const order = counters.get(block.section) ?? 0;
        counters.set(block.section, order + 1);

        await tx.timelineBlock.create({
          data: {
            syggentrwshId: id,
            section: block.section,
            order,
            title: block.title,
            description: block.description,
            durationMin: block.durationMin,
            responsibleId: block.responsibleId,
            ...(block.ylikoIds?.length
              ? { yliko: { create: block.ylikoIds.map((ylikoId) => ({ ylikoId, qty: 1 })) } }
              : {}),
          },
        });
      }

      if (dto.sections) {
        await tx.syggentrwshSection.deleteMany({ where: { syggentrwshId: id } });
        // Τα άδεια μέρη δεν αποθηκεύονται: κενό κείμενο και μηδενική διάρκεια
        // δεν είναι πληροφορία, και η απουσία εγγραφής διαβάζεται ως κενό.
        const filled = dto.sections.filter(
          (part) => part.notes.trim().length > 0 || (part.durationMin ?? 0) > 0,
        );
        if (filled.length) {
          await tx.syggentrwshSection.createMany({
            data: filled.map((part) => ({
              syggentrwshId: id,
              section: part.section,
              notes: part.notes,
              durationMin: part.durationMin ?? 0,
            })),
          });
        }
      }

      if (dto.yliko) {
        await tx.syggentrwshYlikoItem.deleteMany({ where: { syggentrwshId: id } });
        const items = dto.yliko.filter((item) => item.label.trim().length > 0);
        if (items.length) {
          await tx.syggentrwshYlikoItem.createMany({
            data: items.map((item, order) => ({
              syggentrwshId: id,
              order,
              label: item.label.trim(),
              qty: item.qty ?? 1,
              packed: item.packed ?? false,
            })),
          });
        }
      }

      if (dto.stelexosIds) {
        await tx.syggentrwshStelexos.deleteMany({ where: { syggentrwshId: id } });
        if (dto.stelexosIds.length) {
          await tx.syggentrwshStelexos.createMany({
            data: [...new Set(dto.stelexosIds)].map((userId) => ({ syggentrwshId: id, userId })),
          });
        }
      }

      return {
        blocks: await tx.timelineBlock.findMany({
          where: { syggentrwshId: id },
          orderBy: [{ section: 'asc' }, { order: 'asc' }],
          include: { yliko: true },
        }),
        sections: await tx.syggentrwshSection.findMany({
          where: { syggentrwshId: id },
          select: { section: true, notes: true, durationMin: true },
        }),
        yliko: await tx.syggentrwshYlikoItem.findMany({
          where: { syggentrwshId: id },
          orderBy: { order: 'asc' },
        }),
        stelexi: await tx.syggentrwshStelexos.findMany({
          where: { syggentrwshId: id },
          select: { userId: true },
        }),
      };
    });
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
