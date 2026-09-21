import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckoutStatus, DrasiType, MemberKind, Prisma } from '@prisma/client';
import {
  KLADOS_LABEL,
  KLADOS_META,
  type KataskinosiStats,
  type KladosType,
  type Paginated,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import type {
  AddParticipantsDto,
  CreateDrasiDto,
  QueryDraseisDto,
  UpdateDrasiDto,
  UpdateParticipantDto,
} from './dto/drasi.dto';

@Injectable()
export class DraseisService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: RequestUser, query: QueryDraseisDto): Promise<Paginated<unknown>> {
    if (query.klados) assertKladosAccess(user, query.klados);

    const where: Prisma.DrasiWhereInput = {
      topikoId: user.topikoId,
      archivedAt: null,
      ...(query.type?.length ? { type: { in: query.type } } : {}),
      ...(query.klados ? { klados: { type: query.klados } } : {}),
      ...(query.upcoming ? { dateEnd: { gte: new Date() } } : {}),
      ...(query.from ? { dateEnd: { gte: query.from } } : {}),
      ...(query.to ? { dateStart: { lte: query.to } } : {}),
      // Ο διαχειριστής κλάδου βλέπει τις δράσεις του κλάδου του και τις δράσεις
      // Τοπικού (kladosId = null), στις οποίες συμμετέχει το Τμήμα όλο.
      ...(scopedKladoi(user)
        ? { OR: [{ kladosId: null }, { klados: { type: { in: user.kladoi } } }] }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.drasi.count({ where }),
      this.prisma.drasi.findMany({
        where,
        orderBy: { dateStart: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          klados: { select: { type: true } },
          _count: { select: { participants: true, syggentrwseis: true, checkouts: true } },
        },
      }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(user: RequestUser, id: string) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: {
        klados: { select: { type: true, name: true } },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                kind: true,
                memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
              },
            },
          },
          orderBy: [{ kind: 'desc' }, { user: { lastName: 'asc' } }],
        },
        syggentrwseis: {
          orderBy: { date: 'asc' },
          include: { klados: { select: { type: true } }, _count: { select: { timeline: true } } },
        },
        checkouts: {
          where: { status: { not: CheckoutStatus.AKYROSI } },
          include: { yliko: { select: { id: true, name: true, category: true, unit: true } } },
        },
        incidents: { orderBy: { occurredAt: 'desc' } },
      },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');
    assertKladosAccess(user, drasi.klados?.type as KladosType | undefined);
    return drasi;
  }

  async create(user: RequestUser, dto: CreateDrasiDto) {
    if (dto.dateStart > dto.dateEnd) {
      throw new BadRequestException('Η έναρξη της δράσης πρέπει να προηγείται της λήξης.');
    }
    // Μια μονοήμερη που απλώνεται σε δύο μέρες είναι λάθος τύπος, όχι λάθος ημερομηνία.
    if (dto.type === DrasiType.MONOIMERI && !sameDay(dto.dateStart, dto.dateEnd)) {
      throw new BadRequestException('Η μονοήμερη δράση πρέπει να ξεκινά και να τελειώνει την ίδια μέρα.');
    }

    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;

    return this.prisma.drasi.create({
      data: {
        topikoId: user.topikoId,
        kladosId,
        title: dto.title,
        type: dto.type,
        dateStart: dto.dateStart,
        dateEnd: dto.dateEnd,
        location: dto.location,
        description: dto.description,
        costPerPerson: dto.costPerPerson,
      },
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateDrasiDto) {
    const drasi = await this.assertAccess(user, id);
    const dateStart = dto.dateStart ?? drasi.dateStart;
    const dateEnd = dto.dateEnd ?? drasi.dateEnd;
    if (dateStart > dateEnd) {
      throw new BadRequestException('Η έναρξη της δράσης πρέπει να προηγείται της λήξης.');
    }
    return this.prisma.drasi.update({ where: { id }, data: { ...dto } });
  }

  async archive(user: RequestUser, id: string) {
    await this.assertAccess(user, id);
    return this.prisma.drasi.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async addParticipants(user: RequestUser, id: string, dto: AddParticipantsDto) {
    await this.assertAccess(user, id);

    // Τα ids ελέγχονται απέναντι στο Τοπικό: ένα λάθος id δεν πρέπει να
    // δημιουργεί συμμετοχή-φάντασμα.
    const valid = await this.prisma.user.findMany({
      where: { id: { in: dto.memberIds }, topikoId: user.topikoId, archivedAt: null },
      select: { id: true, kind: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const unknown = dto.memberIds.filter((mid) => !validIds.has(mid));
    if (unknown.length > 0) throw new BadRequestException(`Άγνωστα μέλη: ${unknown.join(', ')}`);

    await this.prisma.$transaction(
      valid.map((member) =>
        this.prisma.drasiParticipant.upsert({
          where: { drasiId_userId: { drasiId: id, userId: member.id } },
          create: {
            drasiId: id,
            userId: member.id,
            kind: dto.kind ?? member.kind,
            confirmed: dto.confirmed ?? false,
          },
          update: {
            kind: dto.kind ?? member.kind,
            ...(dto.confirmed !== undefined ? { confirmed: dto.confirmed } : {}),
          },
        }),
      ),
    );

    return { added: valid.length };
  }

  async updateParticipant(user: RequestUser, id: string, memberId: string, dto: UpdateParticipantDto) {
    await this.assertAccess(user, id);
    return this.prisma.drasiParticipant.update({
      where: { drasiId_userId: { drasiId: id, userId: memberId } },
      data: { ...dto },
    });
  }

  async removeParticipant(user: RequestUser, id: string, memberId: string) {
    await this.assertAccess(user, id);
    return this.prisma.drasiParticipant.delete({
      where: { drasiId_userId: { drasiId: id, userId: memberId } },
    });
  }

  /**
   * Στοιχεία κατασκήνωσης ανά κλάδο: στελέχη, κατασκηνωτές και το υλικό που έχει
   * δεσμευτεί. Αυτό είναι το φύλλο που ζητά το Τοπικό πριν φύγει η κατασκήνωση.
   *
   * Ο κλάδος κάθε συμμετέχοντα προκύπτει από τα ενεργά του `Membership` — σε
   * δράση Τοπικού δεν υπάρχει ένας κλάδος για όλη τη δράση.
   */
  async kataskinosiStats(user: RequestUser, id: string): Promise<KataskinosiStats> {
    const drasi = await this.assertAccess(user, id);

    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id },
      include: {
        user: {
          select: {
            id: true,
            memberships: {
              where: { leftAt: null },
              select: { klados: { select: { type: true } } },
            },
          },
        },
      },
    });

    const checkouts = await this.prisma.ylikoCheckout.findMany({
      where: { drasiId: id, status: { not: CheckoutStatus.AKYROSI } },
      include: {
        yliko: { select: { id: true, name: true } },
        // Ο κλάδος της δέσμευσης, όχι του υλικού: μετράει ποιος το πήρε.
      },
    });

    const kladoi = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: { id: true, type: true },
    });
    const typeById = new Map(kladoi.map((k) => [k.id, k.type as KladosType]));

    const buckets = new Map<KladosType, KataskinosiStats['perKlados'][number]>();
    const bucket = (type: KladosType) => {
      const existing = buckets.get(type);
      if (existing) return existing;
      const created = {
        kladosType: type,
        stelexi: 0,
        kataskinotes: 0,
        total: 0,
        ylikoCheckedOut: [] as { ylikoId: string; name: string; qty: number }[],
      };
      buckets.set(type, created);
      return created;
    };

    for (const participant of participants) {
      // Συμμετέχοντας σε δύο κλάδους (στέλεχος που καλύπτει και άλλο κλάδο)
      // μετριέται στον πρώτο κατά σειρά ηλικίας, ώστε τα σύνολα να αθροίζουν.
      const types = participant.user.memberships
        .map((m) => m.klados.type as KladosType)
        .sort((a, b) => KLADOS_META[a].order - KLADOS_META[b].order);
      const type = types[0];
      if (!type) continue;

      const entry = bucket(type);
      if (participant.kind === MemberKind.MELOS) entry.kataskinotes += 1;
      else entry.stelexi += 1;
      entry.total += 1;
    }

    for (const checkout of checkouts) {
      const type = checkout.kladosId ? typeById.get(checkout.kladosId) : undefined;
      if (!type) continue; // Υλικό κεντρικής αποθήκης χωρίς κλάδο: εμφανίζεται στα σύνολα της δράσης.
      const entry = bucket(type);
      const existing = entry.ylikoCheckedOut.find((y) => y.ylikoId === checkout.ylikoId);
      if (existing) existing.qty += checkout.qty;
      else entry.ylikoCheckedOut.push({ ylikoId: checkout.ylikoId, name: checkout.yliko.name, qty: checkout.qty });
    }

    const perKlados = [...buckets.values()].sort(
      (a, b) => KLADOS_META[a.kladosType].order - KLADOS_META[b.kladosType].order,
    );

    return {
      drasiId: drasi.id,
      title: drasi.title,
      perKlados,
      totals: {
        stelexi: perKlados.reduce((sum, k) => sum + k.stelexi, 0),
        kataskinotes: perKlados.reduce((sum, k) => sum + k.kataskinotes, 0),
        total: perKlados.reduce((sum, k) => sum + k.total, 0),
      },
    };
  }

  /** Συγκεντρωτικά όλων των κατασκηνώσεων — η προβολή του Τοπικού. */
  async kataskinoseis(user: RequestUser) {
    const rows = await this.prisma.drasi.findMany({
      where: { topikoId: user.topikoId, type: DrasiType.KATASKINOSI, archivedAt: null },
      orderBy: { dateStart: 'desc' },
      include: {
        klados: { select: { type: true } },
        _count: { select: { participants: true, checkouts: true, incidents: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      dateStart: row.dateStart,
      dateEnd: row.dateEnd,
      location: row.location,
      kladosType: (row.klados?.type as KladosType | undefined) ?? null,
      kladosLabel: row.klados?.type ? KLADOS_LABEL[row.klados.type as KladosType] : 'Τοπικό',
      participants: row._count.participants,
      checkouts: row._count.checkouts,
      incidents: row._count.incidents,
      days: Math.max(1, Math.ceil((row.dateEnd.getTime() - row.dateStart.getTime()) / 86_400_000)),
    }));
  }

  private async assertAccess(user: RequestUser, id: string) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');
    assertKladosAccess(user, drasi.klados?.type as KladosType | undefined);
    return drasi;
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

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
