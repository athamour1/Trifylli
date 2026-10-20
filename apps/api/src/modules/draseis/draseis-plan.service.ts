import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckoutStatus, MemberKind, Prisma, SymvoulioType, YlikoCategory } from '@prisma/client';
import {
  COLLAB_FIELDS,
  DRASI_EXPENSE_CATEGORIES,
  SCHEDULE_ITEM_OWN_FIELDS,
  collabDocument,
  drasiEditScope,
  fieldsOutside,
  type DrasiExternalYlikoView,
  type DrasiLoadingList,
  type DrasiScheduleItemView,
  type DrasiScheduleStelexos,
  type DrasiScheduleView,
  type DrasiShoppingItemView,
  type DrasiSymvoulioView,
  type KladosType,
  type TreasuryCategory,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { refuseCollabFields } from '../collab/collab-fields';
import { CollabService } from '../collab/collab.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DrasiAccessService } from './drasi-access.service';
import { planResponsibles } from './schedule-assignees';
import { moveAfter } from './schedule-order';
import { delaysOf } from './schedule-delays';
import { ylikoRows } from './schedule-yliko';
import type {
  CopyDayDto,
  CreateDrasiSymvoulioDto,
  CreateScheduleItemDto,
  DayStartDto,
  ExternalYlikoDto,
  ReorderScheduleDto,
  PurchaseShoppingItemDto,
  ShoppingItemDto,
  UpdateScheduleItemDto,
} from './dto/drasi-plan.dto';

const scheduleInclude = {
  assignees: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
  yliko: { select: { id: true, label: true, qty: true, packed: true }, orderBy: { order: 'asc' } },
} as const;

/**
 * Πρόγραμμα (F7), συμβούλια (F8) και υλικό (F9) μιας δράσης.
 *
 * Το πρόγραμμα είναι ΔΙΚΟ του μοντέλο, ανεξάρτητο από τις συγκεντρώσεις: πρώτα
 * το ωρολόγιο (ημέρα, από–έως, τίτλος) και μετά, πάνω σε κάθε στοιχείο, το
 * προγραμματικό (markdown, υπεύθυνοι διεξαγωγής/υλοποίησης, υλικό).
 */
@Injectable()
export class DraseisPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly collab: CollabService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Ειδοποίηση σε όσους έγιναν υπεύθυνοι ενός στοιχείου — τι και πού (όχι ο ίδιος που το όρισε). */
  private responsiblesAdded(user: RequestUser, drasi: { id: string; title: string }, item: { id: string; title: string }, userIds: string[]): void {
    const others = userIds.filter((userId) => userId !== user.id);
    if (!others.length) return;
    void this.notifications.notify(others, {
      kind: 'responsible',
      title: `Υπεύθυνος στο «${item.title}» — δράση «${drasi.title}»`,
      link: `/draseis/${drasi.id}/programma/${item.id}`,
    });
  }

  // ───────────────────────── Ωρολόγιο & προγραμματικό ─────────────────────────

  /**
   * Το ωρολόγιο ανά ημέρα. Οι ώρες ΔΕΝ είναι αποθηκευμένες: η πρώτη ημέρα
   * ξεκινά από την ώρα του `dateStart` (όπως ορίστηκε στο wizard), κάθε άλλη
   * ημέρα από την ίδια ώρα εκτός αν έχει δική της (`dayStartTimes`), και κάθε
   * στοιχείο ξεκινά εκεί που τελείωσε το προηγούμενο.
   */
  async scheduleView(user: RequestUser, id: string): Promise<DrasiScheduleView> {
    const drasi = await this.access.load(user, id, 'read');
    // Προγραμματικά και συνταγές που γράφονται αυτή τη στιγμή: πρώτα στη βάση.
    await this.collab.flushPending(collabDocument.drasiPrefix(id));
    return { days: await this.days(drasi, await this.timezone(user)), stelexi: await this.stelexi(id) };
  }

  /**
   * Οι ημέρες του ωρολογίου με τις ώρες τους (και τις καθυστερήσεις) — χωρίς
   * έλεγχο πρόσβασης: για το `scheduleView` και για τις υπενθυμίσεις.
   */
  async days(
    drasi: { id: string; dateStart: Date; dateEnd: Date; dayStartTimes: Prisma.JsonValue | null },
    tz: string,
  ): Promise<DrasiScheduleView['days']> {
    const id = drasi.id;
    const [rows, delayRows] = await Promise.all([
      this.prisma.drasiScheduleItem.findMany({
        where: { drasiId: id },
        orderBy: [{ date: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
        include: scheduleInclude,
      }),
      this.prisma.drasiDelay.findMany({
        where: { drasiId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, itemId: true, minutes: true, createdAt: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    const baseTime = timeOfDay(drasi.dateStart, tz);
    const overrides = (drasi.dayStartTimes as Record<string, string> | null) ?? {};
    const firstDay = localDate(drasi.dateStart, tz);

    const dates = new Set<string>();
    for (let d = new Date(`${firstDay}T12:00:00Z`); localDate(d, tz) <= localDate(drasi.dateEnd, tz); d = new Date(d.getTime() + 86_400_000)) {
      dates.add(d.toISOString().slice(0, 10));
    }
    for (const r of rows) dates.add(dayKey(r.date));

    return [...dates].sort().map((date) => {
      const overridden = date !== firstDay && typeof overrides[date] === 'string';
      const startTime = date === firstDay ? baseTime : (overrides[date] ?? baseTime);
      let cursor = atZone(date, startTime, tz);
      const dayRows = rows.filter((r) => dayKey(r.date) === date);
      const dayIds = new Set(dayRows.map((r) => r.id));
      const dayDelays = delayRows.filter((delay) => dayIds.has(delay.itemId));
      const delayMin = delaysOf(dayRows.map((r) => r.id), dayDelays);
      const items = dayRows.map((r) => {
        const startsAt = cursor;
        const endsAt = new Date(cursor.getTime() + r.durationMin * 60_000);
        cursor = endsAt;
        return toScheduleView(r, startsAt, endsAt, delayMin.get(r.id) ?? 0);
      });
      const delays = dayDelays.map((delay) => ({ id: delay.id, itemId: delay.itemId, minutes: delay.minutes, by: delay.createdBy, at: delay.createdAt.toISOString() }));
      return { date, startTime, overridden, items, delays };
    });
  }

  /** «Καθυστερούμε N΄ από εδώ και πέρα» — από αυτό το στοιχείο, για όλους (αρνητικά = κερδίσαμε). */
  async addDelay(user: RequestUser, id: string, itemId: string, minutes: number): Promise<{ id: string }> {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId: id }, select: { id: true } });
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    if (!Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > 240) {
      throw new BadRequestException('Η καθυστέρηση είναι λεπτά, ως 4 ώρες.');
    }
    return this.prisma.drasiDelay.create({ data: { drasiId: id, itemId, minutes, createdById: user.id }, select: { id: true } });
  }

  /** Η καθυστέρηση αναιρείται (λάθος, ή ξαναμπήκαμε στην ώρα μας). */
  async removeDelay(user: RequestUser, id: string, delayId: string): Promise<void> {
    await this.access.load(user, id, 'write');
    await this.prisma.drasiDelay.deleteMany({ where: { id: delayId, drasiId: id } });
  }

  /** Τα στελέχη της δράσης — δικά μας, φιλοξενούμενα και εξωτερικά. Μόνο αυτά γίνονται υπεύθυνοι. */
  private async stelexi(drasiId: string): Promise<DrasiScheduleStelexos[]> {
    const rows = await this.prisma.drasiParticipant.findMany({
      where: { drasiId, kind: MemberKind.STELEXOS },
      select: { user: { select: { id: true, firstName: true, lastName: true, guestTopikoName: true } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
    return rows.map((r) => r.user);
  }

  /** Όλα τα στοιχεία, με υπολογισμένες ώρες — για το ντοσιέ. */
  async schedule(user: RequestUser, id: string): Promise<DrasiScheduleItemView[]> {
    return (await this.scheduleView(user, id)).days.flatMap((d) => d.items);
  }

  async addScheduleItem(user: RequestUser, id: string, dto: CreateScheduleItemDto): Promise<DrasiScheduleItemView> {
    const drasi = await this.access.load(user, id, 'write');
    const { create: responsibles } = planResponsibles([], dto.responsibleIds);
    const yliko = ylikoRows(dto.yliko ?? []);
    await this.assertDrasiStelexi(id, responsibles);
    const date = dateColumn(dto.date);
    const last = await this.prisma.drasiScheduleItem.findFirst({ where: { drasiId: id, date }, orderBy: { order: 'desc' }, select: { order: true } });
    const row = await this.prisma.drasiScheduleItem.create({
      data: {
        drasiId: id,
        date,
        order: (last?.order ?? -1) + 1,
        durationMin: dto.durationMin ?? 30,
        title: dto.title.trim(),
        kind: dto.kind ?? 'DRASTIRIOTITA',
        snack: dto.snack ?? null,
        location: dto.location?.trim() || null,
        description: dto.description?.trim() || null,
        ...(responsibles.length ? { assignees: { create: responsibles.map((userId) => ({ userId })) } } : {}),
        ...(yliko.length ? { yliko: { create: yliko } } : {}),
      },
      include: scheduleInclude,
    });
    this.responsiblesAdded(user, drasi, row, responsibles);
    return this.itemWithTimes(user, id, row.id);
  }

  /**
   * Ο guard ζητά μόνο να βλέπει το πρόγραμμα: εδώ κρίνεται πόσο αλλάζει. Με
   * ρόλο Προγράμματος (ή Αρχηγό) τα πάντα· ως υπεύθυνος του στοιχείου μόνο το
   * προγραμματικό του (`SCHEDULE_ITEM_OWN_FIELDS`).
   */
  async updateScheduleItem(user: RequestUser, id: string, itemId: string, dto: UpdateScheduleItemDto): Promise<DrasiScheduleItemView> {
    // Προγραμματικό, χώρος και υλικό γράφονται πια μαζί (`drasi:<id>:item:<id>`).
    refuseCollabFields(dto, COLLAB_FIELDS.drasiItem);
    const drasi = await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({
      where: { id: itemId, drasiId: id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    const grant = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : null;
    const scope = drasiEditScope(grant, 'programma', item.assignees.some((a) => a.userId === user.id));
    if (scope === 'none') throw new ForbiddenException('Ο ρόλος σας στη δράση δεν επιτρέπει αυτή την αλλαγή.');
    if (scope === 'own' && fieldsOutside(dto, SCHEDULE_ITEM_OWN_FIELDS).length) {
      throw new ForbiddenException('Ως υπεύθυνος αλλάζεις το προγραμματικό, τον χώρο και το υλικό — τα υπόλοιπα τα ορίζει το Πρόγραμμα.');
    }
    const responsibles = planResponsibles(item.assignees.map((a) => a.userId), dto.responsibleIds, {
      add: dto.addResponsibleIds,
      remove: dto.removeResponsibleIds,
    });
    await this.assertDrasiStelexi(id, responsibles.create);

    // Μεταφορά σε άλλη ημέρα: πάει στο τέλος της.
    let move: { date: Date; order: number } | null = null;
    if (dto.date && dayKey(item.date) !== dto.date) {
      const date = dateColumn(dto.date);
      const last = await this.prisma.drasiScheduleItem.findFirst({ where: { drasiId: id, date }, orderBy: { order: 'desc' }, select: { order: true } });
      move = { date, order: (last?.order ?? -1) + 1 };
    }

    await this.prisma.$transaction(async (tx) => {
      if (responsibles.remove.length) {
        await tx.drasiScheduleAssignee.deleteMany({ where: { itemId, userId: { in: responsibles.remove } } });
      }
      if (responsibles.create.length) {
        await tx.drasiScheduleAssignee.createMany({ data: responsibles.create.map((userId) => ({ itemId, userId })) });
      }
      await tx.drasiScheduleItem.update({
        where: { id: itemId },
        data: {
          ...(move ?? {}),
          ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.snack !== undefined ? { snack: dto.snack } : {}),
        },
      });
    });
    // Άλλοι υπεύθυνοι: άλλοι γράφουν «το δικό τους» προγραμματικό.
    if (responsibles.create.length || responsibles.remove.length) this.collab.revoke(collabDocument.drasiItem(id, itemId));
    this.responsiblesAdded(user, drasi, { id: itemId, title: dto.title?.trim() || item.title }, responsibles.create);
    // Ένα στοιχείο που έπαψε να είναι γεύμα δεν έχει πια συνταγή να γράφεται.
    if (dto.kind !== undefined || dto.snack !== undefined) this.collab.revoke(collabDocument.drasiMeal(id, itemId));
    return this.itemWithTimes(user, id, itemId);
  }

  async removeScheduleItem(user: RequestUser, id: string, itemId: string) {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId: id } });
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    // Μαζί του και τα έγγραφα των παράλληλων γευμάτων του (οι γραμμές σβήνονται με cascade).
    const variants = await this.prisma.drasiMealVariant.findMany({ where: { itemId }, select: { id: true } });
    await Promise.all([
      this.collab.remove(collabDocument.drasiItem(id, itemId)),
      this.collab.remove(collabDocument.drasiMeal(id, itemId)),
      ...variants.map((v) => this.collab.remove(collabDocument.drasiMealVariant(id, v.id))),
    ]);
    await this.prisma.drasiScheduleItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  /**
   * Ένα στοιχείο μετά από άλλο (ή πρώτο) μέσα στην ημέρα του. Η νέα σειρά
   * βγαίνει από τη σειρά του server τώρα — όχι από τη λίστα της σελίδας — ώστε ό,τι
   * πρόσθεσε ή μετακίνησε κάποιος άλλος στο μεταξύ να μένει.
   */
  async moveScheduleItem(user: RequestUser, id: string, itemId: string, afterId: string | null) {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId: id }, select: { date: true } });
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    const day = await this.prisma.drasiScheduleItem.findMany({
      where: { drasiId: id, date: item.date },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const ids = moveAfter(
      day.map((d) => d.id),
      itemId,
      afterId,
    );
    if (!ids) throw new BadRequestException('Το «μετά από» δεν είναι στην ίδια ημέρα.');
    await this.prisma.$transaction(ids.map((rowId, order) => this.prisma.drasiScheduleItem.update({ where: { id: rowId }, data: { order } })));
    return { moved: true };
  }

  /** Νέα σειρά για τα στοιχεία μιας ημέρας — από αυτήν ξαναβγαίνουν οι ώρες. */
  async reorder(user: RequestUser, id: string, dto: ReorderScheduleDto) {
    await this.access.load(user, id, 'write');
    const date = dateColumn(dto.date);
    const existing = await this.prisma.drasiScheduleItem.findMany({ where: { drasiId: id, date }, select: { id: true } });
    const known = new Set(existing.map((e) => e.id));
    const ids = dto.ids.filter((x) => known.has(x));
    await this.prisma.$transaction(ids.map((itemId, order) => this.prisma.drasiScheduleItem.update({ where: { id: itemId }, data: { order } })));
    return { reordered: ids.length };
  }

  /** Ώρα έναρξης μιας ημέρας. Η πρώτη ημέρα αλλάζει μόνο από το `dateStart` (Στήσιμο). */
  async setDayStart(user: RequestUser, id: string, dto: DayStartDto) {
    const drasi = await this.access.load(user, id, 'write');
    const tz = await this.timezone(user);
    if (dto.date === localDate(drasi.dateStart, tz)) {
      throw new BadRequestException('Η πρώτη ημέρα ξεκινά από την ώρα έναρξης της δράσης — άλλαξέ την από το Στήσιμο.');
    }
    const overrides = { ...((drasi.dayStartTimes as Record<string, string> | null) ?? {}) };
    if (dto.time) overrides[dto.date] = dto.time;
    else delete overrides[dto.date];
    await this.prisma.drasi.update({ where: { id }, data: { dayStartTimes: overrides } });
    return { date: dto.date, time: overrides[dto.date] ?? null };
  }

  /** Αντιγραφή του ωρολογίου μιας ημέρας σε άλλη — μαζί με τα προγραμματικά και την ώρα έναρξης. */
  async copyDay(user: RequestUser, id: string, dto: CopyDayDto): Promise<{ copied: number }> {
    const drasi = await this.access.load(user, id, 'write');
    // Ό,τι γράφεται αυτή τη στιγμή στα προγραμματικά της ημέρας αντιγράφεται κι αυτό.
    await this.collab.flushPending(collabDocument.drasiPrefix(id));
    const source = await this.prisma.drasiScheduleItem.findMany({
      where: { drasiId: id, date: dateColumn(dto.from) },
      orderBy: { order: 'asc' },
      include: { yliko: { orderBy: { order: 'asc' } }, assignees: { select: { userId: true } } },
    });
    if (source.length === 0) throw new BadRequestException('Η ημέρα προέλευσης δεν έχει στοιχεία.');
    const last = await this.prisma.drasiScheduleItem.findFirst({ where: { drasiId: id, date: dateColumn(dto.to) }, orderBy: { order: 'desc' }, select: { order: true } });
    let order = (last?.order ?? -1) + 1;
    for (const i of source) {
      await this.prisma.drasiScheduleItem.create({
        data: {
          drasiId: id,
          date: dateColumn(dto.to),
          order: order++,
          durationMin: i.durationMin,
          title: i.title,
          kind: i.kind,
          snack: i.snack,
          location: i.location,
          description: i.description,
          ...(i.assignees.length ? { assignees: { create: i.assignees } } : {}),
          // Η νέα ημέρα ξεκινά με άδειο σακίδιο.
          ...(i.yliko.length ? { yliko: { create: i.yliko.map((y) => ({ order: y.order, label: y.label, qty: y.qty })) } } : {}),
        },
      });
    }
    const overrides = (drasi.dayStartTimes as Record<string, string> | null) ?? {};
    const tz = await this.timezone(user);
    if (overrides[dto.from] && dto.to !== localDate(drasi.dateStart, tz)) {
      await this.prisma.drasi.update({ where: { id }, data: { dayStartTimes: { ...overrides, [dto.to]: overrides[dto.from]! } } });
    }
    return { copied: source.length };
  }

  /** Η ζώνη ώρας του Τοπικού — οι «ημέρες» του ωρολογίου κόβονται εκεί, όχι στο UTC του server. */
  async timezone(user: RequestUser): Promise<string> {
    const topiko = await this.prisma.topiko.findUnique({ where: { id: user.topikoId }, select: { timezone: true } });
    return topiko?.timezone ?? 'Europe/Athens';
  }

  private async itemWithTimes(user: RequestUser, id: string, itemId: string): Promise<DrasiScheduleItemView> {
    const item = (await this.schedule(user, id)).find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    return item;
  }

  /**
   * Οι νέοι υπεύθυνοι πρέπει να είναι στελέχη στους συμμετέχοντες της δράσης.
   * Όσοι ήταν ήδη (από πριν ισχύσει ο κανόνας) μένουν μέχρι να βγουν.
   */
  private async assertDrasiStelexi(drasiId: string, added: readonly string[]): Promise<void> {
    const ids = [...new Set(added)];
    if (!ids.length) return;
    const found = await this.prisma.drasiParticipant.count({ where: { drasiId, kind: MemberKind.STELEXOS, userId: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('Υπεύθυνοι γίνονται μόνο στελέχη που συμμετέχουν στη δράση.');
  }

  // ───────────────────────── Συμβούλια ─────────────────────────

  async symvoulia(user: RequestUser, id: string): Promise<DrasiSymvoulioView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.symvoulio.findMany({
      where: { drasiId: id, archivedAt: null },
      orderBy: { date: 'desc' },
      include: { _count: { select: { participants: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      date: s.date.toISOString(),
      finalized: s.finalizedAt !== null,
      participants: s._count.participants,
    }));
  }

  /** Συμβούλιο προετοιμασίας: κλάδου αν διοργανώνει κλάδος, αλλιώς Τοπικού. */
  async createSymvoulio(user: RequestUser, id: string, dto: CreateDrasiSymvoulioDto) {
    const drasi = await this.access.load(user, id, 'write');
    return this.prisma.symvoulio.create({
      data: {
        topikoId: user.topikoId,
        kladosId: drasi.kladosId,
        drasiId: id,
        type: drasi.kladosId ? SymvoulioType.KLADOU : SymvoulioType.TOPIKOU,
        title: dto.title?.trim() || `Προετοιμασία: ${drasi.title}`,
        date: dto.date ?? new Date(),
        chairId: user.id,
      },
      select: { id: true },
    });
  }

  // ───────────────────────── Υλικό: λίστα αγορών ─────────────────────────

  async shopping(user: RequestUser, id: string): Promise<DrasiShoppingItemView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.drasiShoppingItem.findMany({
      where: { drasiId: id },
      orderBy: [{ purchasedAt: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      include: SHOPPING_INCLUDE,
    });
    return rows.map(toShoppingView);
  }

  /**
   * «Το παίρνω εγώ» (ή «δεν το παίρνω»): όποιος το πήρε το κλείνει για τους
   * άλλους. Το κάνει κάθε στέλεχος που βλέπει τη λίστα — εθελοντικά, όχι ανάθεση.
   */
  async claimShopping(user: RequestUser, id: string, itemId: string, claim: boolean): Promise<void> {
    await this.access.load(user, id, 'read');
    const item = await this.shoppingItem(id, itemId);
    if (item.purchasedAt) throw new BadRequestException('Έχει ήδη αγοραστεί.');
    if (!claim) {
      await this.prisma.drasiShoppingItem.updateMany({ where: { id: itemId, drasiId: id, assigneeId: user.id, purchasedAt: null }, data: { assigneeId: null } });
      return;
    }
    // Μία κίνηση: αν δύο πατήσουν μαζί, το παίρνει ένας.
    const { count } = await this.prisma.drasiShoppingItem.updateMany({
      where: { id: itemId, drasiId: id, purchasedAt: null, OR: [{ assigneeId: null }, { assigneeId: user.id }] },
      data: { assigneeId: user.id },
    });
    if (!count) throw new ConflictException('Το παίρνει ήδη κάποιος άλλος.');
  }

  async addShopping(user: RequestUser, id: string, dto: ShoppingItemDto): Promise<DrasiShoppingItemView> {
    await this.access.load(user, id, 'write');
    if (dto.assigneeId) await this.assertStelexos(user, dto.assigneeId);
    const last = await this.prisma.drasiShoppingItem.findFirst({ where: { drasiId: id }, orderBy: { order: 'desc' }, select: { order: true } });
    const row = await this.prisma.drasiShoppingItem.create({
      data: {
        drasiId: id,
        name: dto.name.trim(),
        qty: dto.qty ?? 1,
        estimatedCost: dto.estimatedCost == null ? null : new Prisma.Decimal(dto.estimatedCost),
        assigneeId: dto.assigneeId ?? null,
        note: dto.note?.trim() || null,
        order: (last?.order ?? -1) + 1,
      },
      include: SHOPPING_INCLUDE,
    });
    return toShoppingView(row);
  }

  async updateShopping(user: RequestUser, id: string, itemId: string, dto: Partial<ShoppingItemDto>) {
    await this.access.load(user, id, 'write');
    const item = await this.shoppingItem(id, itemId);
    if (dto.assigneeId) await this.assertStelexos(user, dto.assigneeId);
    return this.prisma.drasiShoppingItem.update({
      where: { id: item.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
        ...(dto.estimatedCost !== undefined ? { estimatedCost: dto.estimatedCost === null ? null : new Prisma.Decimal(dto.estimatedCost) } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
    });
  }

  async removeShopping(user: RequestUser, id: string, itemId: string) {
    await this.access.load(user, id, 'write');
    const item = await this.shoppingItem(id, itemId);
    if (item.treasuryEntryId) throw new BadRequestException('Έχει καταχωριστεί έξοδο — σβήσε πρώτα την κίνηση από το ταμείο.');
    await this.prisma.drasiShoppingItem.delete({ where: { id: item.id } });
    return { deleted: true };
  }

  /**
   * «Αγοράστηκε»: έξοδο στο ταμείο της δράσης (δεμένο με το είδος) και,
   * προαιρετικά, το είδος μπαίνει στην αποθήκη του διοργανωτή. Έτσι η
   * πληροφορία «αγοράστηκε → μένει ή καταναλώθηκε» δεν χάνεται.
   */
  async purchase(user: RequestUser, id: string, itemId: string, dto: PurchaseShoppingItemDto) {
    const drasi = await this.access.load(user, id, 'write');
    const item = await this.shoppingItem(id, itemId);
    if (item.treasuryEntryId) throw new BadRequestException('Έχει ήδη καταχωριστεί έξοδο για αυτό το είδος.');
    const category = dto.category ?? 'PROGRAMMA';
    if (!DRASI_EXPENSE_CATEGORIES.includes(category as TreasuryCategory)) throw new BadRequestException('Μη έγκυρη κατηγορία εξόδου.');

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.treasuryEntry.create({
        data: {
          topikoId: user.topikoId,
          kladosId: drasi.kladosId,
          drasiId: id,
          kind: 'EXPENSE',
          category,
          amount: new Prisma.Decimal(dto.amount),
          occurredAt: new Date(),
          description: `${item.name}${item.qty > 1 ? ` ×${item.qty}` : ''}`,
          receiptFileId: dto.receiptFileId,
          createdById: user.id,
        },
      });
      let ylikoId: string | null = null;
      if (dto.keepAsYliko) {
        const yliko = await tx.yliko.create({
          data: {
            topikoId: user.topikoId,
            kladosId: drasi.kladosId,
            name: item.name,
            category: YlikoCategory.PROGRAMMATIKO,
            totalQty: item.qty,
            notes: `Αγοράστηκε για τη δράση «${drasi.title}».`,
          },
        });
        ylikoId = yliko.id;
      }
      return tx.drasiShoppingItem.update({
        where: { id: item.id },
        data: { purchasedAt: new Date(), purchasedById: user.id, treasuryEntryId: entry.id, ylikoId },
      });
    });
  }

  // ───────────────────────── Υλικό: φέρνουν άλλοι ─────────────────────────

  async external(user: RequestUser, id: string): Promise<DrasiExternalYlikoView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.drasiExternalYliko.findMany({
      where: { drasiId: id },
      orderBy: [{ returnedAt: 'asc' }, { createdAt: 'asc' }],
      include: EXTERNAL_INCLUDE,
    });
    return rows.map(toExternalView);
  }

  /** «Μπήκε» στη φόρτωση (ή όχι ακόμα) — ποιος και πότε. Το κάνει όποιος φορτώνει. */
  async setLoaded(user: RequestUser, id: string, what: 'checkout' | 'external', rowId: string, loaded: boolean): Promise<void> {
    await this.access.load(user, id, 'read');
    const data = loaded ? { loadedAt: new Date(), loadedById: user.id } : { loadedAt: null, loadedById: null };
    const { count } =
      what === 'checkout'
        ? await this.prisma.ylikoCheckout.updateMany({ where: { id: rowId, drasiId: id }, data })
        : await this.prisma.drasiExternalYliko.updateMany({ where: { id: rowId, drasiId: id }, data });
    if (!count) throw new NotFoundException('Το είδος δεν βρέθηκε.');
  }

  async addExternal(user: RequestUser, id: string, dto: ExternalYlikoDto): Promise<DrasiExternalYlikoView> {
    await this.access.load(user, id, 'write');
    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;
    if (dto.guestTopikoId) {
      const guest = await this.prisma.drasiGuestTopiko.findFirst({ where: { id: dto.guestTopikoId, drasiId: id }, select: { id: true } });
      if (!guest) throw new BadRequestException('Άγνωστο φιλοξενούμενο Τοπικό για αυτή τη δράση.');
    }
    if (dto.responsibleId) await this.assertStelexos(user, dto.responsibleId);
    const row = await this.prisma.drasiExternalYliko.create({
      data: {
        drasiId: id,
        name: dto.name.trim(),
        qty: dto.qty ?? 1,
        kladosId,
        guestTopikoId: dto.guestTopikoId ?? null,
        responsibleId: dto.responsibleId ?? null,
        note: dto.note?.trim() || null,
      },
      include: EXTERNAL_INCLUDE,
    });
    return toExternalView(row);
  }

  async toggleReturned(user: RequestUser, id: string, itemId: string, returned: boolean) {
    await this.access.load(user, id, 'write', { allowClosed: true });
    const item = await this.prisma.drasiExternalYliko.findFirst({ where: { id: itemId, drasiId: id } });
    if (!item) throw new NotFoundException('Το είδος δεν βρέθηκε.');
    return this.prisma.drasiExternalYliko.update({ where: { id: item.id }, data: { returnedAt: returned ? new Date() : null } });
  }

  async removeExternal(user: RequestUser, id: string, itemId: string) {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiExternalYliko.findFirst({ where: { id: itemId, drasiId: id } });
    if (!item) throw new NotFoundException('Το είδος δεν βρέθηκε.');
    await this.prisma.drasiExternalYliko.delete({ where: { id: item.id } });
    return { deleted: true };
  }

  /** Η λίστα φόρτωσης: αγορές + αποθήκες + ξένο, σε ένα χαρτί. */
  async loadingList(user: RequestUser, id: string): Promise<DrasiLoadingList> {
    const [shopping, external, checkouts, kladoi] = await Promise.all([
      this.shopping(user, id),
      this.external(user, id),
      this.prisma.ylikoCheckout.findMany({
        where: { drasiId: id, status: { not: CheckoutStatus.AKYROSI } },
        include: { yliko: { select: { name: true, unit: true } }, loadedBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.klados.findMany({ where: { topikoId: user.topikoId }, select: { id: true, type: true } }),
    ]);
    const typeById = new Map(kladoi.map((k) => [k.id, k.type as KladosType]));
    return {
      shopping,
      external,
      checkouts: checkouts.map((c) => ({
        id: c.id,
        name: c.yliko.name,
        qty: c.qty,
        unit: c.yliko.unit,
        status: c.status,
        kladosType: c.kladosId ? (typeById.get(c.kladosId) ?? null) : null,
        loaded: c.loadedAt ? { at: c.loadedAt.toISOString(), by: c.loadedBy } : null,
      })),
    };
  }

  // ───────────────────────── Εσωτερικά ─────────────────────────

  private async shoppingItem(drasiId: string, itemId: string) {
    const item = await this.prisma.drasiShoppingItem.findFirst({ where: { id: itemId, drasiId } });
    if (!item) throw new NotFoundException('Το είδος δεν βρέθηκε.');
    return item;
  }

  private async assertStelexos(user: RequestUser, userId: string): Promise<void> {
    const found = await this.prisma.user.findFirst({ where: { id: userId, topikoId: user.topikoId, archivedAt: null }, select: { id: true } });
    if (!found) throw new BadRequestException('Άγνωστο στέλεχος.');
  }

  private async kladosId(user: RequestUser, type: KladosType): Promise<string> {
    const klados = await this.prisma.klados.findUnique({ where: { topikoId_type: { topikoId: user.topikoId, type } }, select: { id: true } });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${type} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;
const SHOPPING_INCLUDE = {
  assignee: PERSON,
  purchasedBy: PERSON,
  treasuryEntry: { select: { id: true, amount: true, category: true } },
  yliko: { select: { id: true, name: true } },
} as const;
const EXTERNAL_INCLUDE = {
  klados: { select: { type: true } },
  guestTopiko: { select: { id: true, topikoName: true } },
  responsible: PERSON,
  loadedBy: PERSON,
} as const;

function toShoppingView(r: {
  id: string;
  name: string;
  qty: number;
  estimatedCost: Prisma.Decimal | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  purchasedAt: Date | null;
  purchasedBy: { id: string; firstName: string; lastName: string } | null;
  treasuryEntry: { id: string; amount: Prisma.Decimal; category: string } | null;
  yliko: { id: string; name: string } | null;
  note: string | null;
  order: number;
}): DrasiShoppingItemView {
  return {
    id: r.id,
    name: r.name,
    qty: r.qty,
    estimatedCost: r.estimatedCost === null ? null : Number(r.estimatedCost),
    assignee: r.assignee,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    purchasedBy: r.purchasedBy,
    treasuryEntry: r.treasuryEntry ? { id: r.treasuryEntry.id, amount: Number(r.treasuryEntry.amount), category: r.treasuryEntry.category } : null,
    yliko: r.yliko,
    note: r.note,
    order: r.order,
  };
}

function toExternalView(r: {
  id: string;
  name: string;
  qty: number;
  klados: { type: string } | null;
  guestTopiko: { id: string; topikoName: string } | null;
  responsible: { id: string; firstName: string; lastName: string } | null;
  loadedAt: Date | null;
  loadedBy: { id: string; firstName: string; lastName: string } | null;
  returnedAt: Date | null;
  note: string | null;
}): DrasiExternalYlikoView {
  return {
    id: r.id,
    name: r.name,
    qty: r.qty,
    owner: {
      kladosType: (r.klados?.type as KladosType | undefined) ?? null,
      guestTopiko: r.guestTopiko ? { id: r.guestTopiko.id, name: r.guestTopiko.topikoName } : null,
    },
    responsible: r.responsible,
    returnedAt: r.returnedAt?.toISOString() ?? null,
    note: r.note,
    loaded: r.loadedAt ? { at: r.loadedAt.toISOString(), by: r.loadedBy } : null,
  };
}

export function toScheduleView(
  r: {
    id: string;
    date: Date;
    order: number;
    durationMin: number;
    title: string;
    kind: DrasiScheduleItemView['kind'];
    status: DrasiScheduleItemView['status'];
    snack: DrasiScheduleItemView['snack'];
    location: string | null;
    description: string | null;
    assignees: { user: { id: string; firstName: string; lastName: string } }[];
    yliko: { id: string; label: string; qty: number; packed: boolean }[];
  },
  startsAt: Date,
  endsAt: Date,
  delayMin = 0,
): DrasiScheduleItemView {
  const responsibles = r.assignees
    .map((a) => a.user)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'el') || a.firstName.localeCompare(b.firstName, 'el'));
  return {
    id: r.id,
    date: dayKey(r.date),
    order: r.order,
    durationMin: r.durationMin,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    title: r.title,
    kind: r.kind,
    status: r.status,
    snack: r.snack,
    location: r.location,
    description: r.description,
    responsibles,
    yliko: r.yliko.map((y) => ({ id: y.id, label: y.label, qty: y.qty, packed: y.packed })),
    hasProgramma: Boolean(r.description || responsibles.length || r.yliko.length),
    delayMin,
  };
}

/** Η στήλη `@db.Date`: μεσάνυχτα UTC της ημέρας. */
function dateColumn(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00Z`);
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** «HH:mm» ενός instant στη ζώνη ώρας. */
export function timeOfDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** Πόσα λεπτά μπροστά από το UTC είναι η ζώνη τη δεδομένη στιγμή. */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((wall - at.getTime()) / 60_000);
}

/** Το instant που αντιστοιχεί σε «YYYY-MM-DD HH:mm» στη ζώνη ώρας (σωστό και γύρω από αλλαγή ώρας). */
export function atZone(yyyyMmDd: string, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.UTC(Number(yyyyMmDd.slice(0, 4)), Number(yyyyMmDd.slice(5, 7)) - 1, Number(yyyyMmDd.slice(8, 10)), h, m);
  let result = new Date(guess - tzOffsetMinutes(new Date(guess), timeZone) * 60_000);
  result = new Date(guess - tzOffsetMinutes(result, timeZone) * 60_000);
  return result;
}

/** «YYYY-MM-DD» στη ζώνη ώρας του Τοπικού. */
export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
