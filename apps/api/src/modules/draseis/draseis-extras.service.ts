import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { collabDocument, type DrasiExtraItemView } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollabService } from '../collab/collab.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DrasiAccessService } from './drasi-access.service';
import { assertExtraKind, extraInclude, scheduledFromExtra, toExtraView } from './drasi-extras';
import { DraseisPlanService, dateColumn } from './draseis-plan.service';
import { planResponsibles } from './schedule-assignees';
import type { CreateExtraItemDto, UpdateExtraItemDto } from './dto/drasi-plan.dto';

/**
 * Προγραμματικά εκτός ωρολογίου («έξτρα»): κάρτες του kanban «Προγραμματικά»
 * χωρίς ημέρα και ώρα. Τα φτιάχνουν και τα αλλάζουν ο Αρχηγός και το Πρόγραμμα·
 * το κείμενο, ο χώρος και το υλικό γράφονται στο κοινό έγγραφο
 * `drasi:<id>:item:<id>` (και από τους υπεύθυνους), όπως σε κάθε στοιχείο του
 * ωρολογίου. Όταν μπουν σε μια ημέρα, γίνονται στοιχείο του ωρολογίου με το ίδιο id.
 */
@Injectable()
export class DraseisExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly collab: CollabService,
    private readonly notifications: NotificationsService,
    private readonly plan: DraseisPlanService,
  ) {}

  async add(user: RequestUser, id: string, dto: CreateExtraItemDto): Promise<DrasiExtraItemView> {
    await this.access.load(user, id, 'write');
    assertExtraKind(dto.kind);
    const row = await this.prisma.drasiExtraItem.create({
      data: {
        drasiId: id,
        title: dto.title.trim(),
        kind: dto.kind ?? 'DRASTIRIOTITA',
        status: dto.status ?? 'TODO',
        durationMin: dto.durationMin ?? 30,
      },
      include: extraInclude,
    });
    return toExtraView(row);
  }

  async update(user: RequestUser, id: string, extraId: string, dto: UpdateExtraItemDto): Promise<DrasiExtraItemView> {
    const drasi = await this.access.load(user, id, 'write');
    assertExtraKind(dto.kind);
    const extra = await this.prisma.drasiExtraItem.findFirst({
      where: { id: extraId, drasiId: id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!extra) throw new NotFoundException('Το προγραμματικό δεν βρέθηκε.');
    const responsibles = planResponsibles(
      extra.assignees.map((a) => a.userId),
      undefined,
      { add: dto.addResponsibleIds, remove: dto.removeResponsibleIds },
    );
    await this.plan.assertDrasiStelexi(id, responsibles.create);
    const row = await this.prisma.$transaction(async (tx) => {
      if (responsibles.remove.length) {
        await tx.drasiExtraAssignee.deleteMany({ where: { extraId, userId: { in: responsibles.remove } } });
      }
      if (responsibles.create.length) {
        await tx.drasiExtraAssignee.createMany({ data: responsibles.create.map((userId) => ({ extraId, userId })) });
      }
      return tx.drasiExtraItem.update({
        where: { id: extraId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        },
        include: extraInclude,
      });
    });
    // Άλλοι υπεύθυνοι: άλλοι γράφουν «το δικό τους» προγραμματικό.
    if (responsibles.create.length || responsibles.remove.length) this.collab.revoke(collabDocument.drasiItem(id, extraId));
    const others = responsibles.create.filter((userId) => userId !== user.id);
    if (others.length) {
      void this.notifications.notify(others, {
        kind: 'responsible',
        title: `Υπεύθυνος στο «${row.title}» — δράση «${drasi.title}»`,
        link: `/draseis/${id}/programmatika/${extraId}`,
      });
    }
    return toExtraView(row);
  }

  async remove(user: RequestUser, id: string, extraId: string): Promise<{ deleted: true }> {
    await this.access.load(user, id, 'write');
    const extra = await this.prisma.drasiExtraItem.findFirst({ where: { id: extraId, drasiId: id }, select: { id: true } });
    if (!extra) throw new NotFoundException('Το προγραμματικό δεν βρέθηκε.');
    await this.collab.remove(collabDocument.drasiItem(id, extraId));
    await this.prisma.drasiExtraItem.delete({ where: { id: extraId } });
    return { deleted: true };
  }

  /**
   * Στο ωρολόγιο: στο τέλος της ημέρας, ως στοιχείο με το ίδιο id. Το κοινό
   * έγγραφο δεν αλλάζει όνομα — όσοι γράφουν συνεχίζουν, και από εδώ και πέρα
   * σώζεται στο στοιχείο του ωρολογίου.
   */
  async place(user: RequestUser, id: string, extraId: string, date: string): Promise<{ id: string; date: string }> {
    const drasi = await this.access.load(user, id, 'write');
    const days = await this.plan.days(drasi, await this.plan.timezone(user));
    if (!days.some((day) => day.date === date)) throw new BadRequestException('Η ημέρα δεν είναι μέσα στη δράση.');
    // Ό,τι γράφεται αυτή τη στιγμή πάει πρώτα στη βάση, για να μεταφερθεί κι αυτό.
    await this.collab.flushPending(collabDocument.drasiItem(id, extraId));
    const day = dateColumn(date);
    await this.prisma.$transaction(async (tx) => {
      const extra = await tx.drasiExtraItem.findFirst({
        where: { id: extraId, drasiId: id },
        include: { assignees: { select: { userId: true } }, yliko: { orderBy: { order: 'asc' } } },
      });
      if (!extra) throw new NotFoundException('Το προγραμματικό δεν βρέθηκε.');
      const last = await tx.drasiScheduleItem.findFirst({ where: { drasiId: id, date: day }, orderBy: { order: 'desc' }, select: { order: true } });
      await tx.drasiExtraItem.delete({ where: { id: extraId } });
      await tx.drasiScheduleItem.create({ data: scheduledFromExtra(extra, day, (last?.order ?? -1) + 1) });
    });
    return { id: extraId, date };
  }
}
