import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckoutStatus, Prisma, SymvoulioType, YlikoCategory } from '@prisma/client';
import {
  DRASI_EXPENSE_CATEGORIES,
  type DrasiExternalYlikoView,
  type DrasiLoadingList,
  type DrasiScheduleItemView,
  type DrasiShoppingItemView,
  type DrasiSymvoulioView,
  type KladosType,
  type TreasuryCategory,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import type {
  CopyDayDto,
  CreateDrasiSymvoulioDto,
  CreateScheduleItemDto,
  ExternalYlikoDto,
  PurchaseShoppingItemDto,
  ShoppingItemDto,
  UpdateScheduleItemDto,
} from './dto/drasi-plan.dto';

const scheduleInclude = {
  responsible: { select: { id: true, firstName: true, lastName: true } },
  executor: { select: { id: true, firstName: true, lastName: true } },
  yliko: { include: { yliko: { select: { id: true, name: true, unit: true } } } },
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
  ) {}

  // ───────────────────────── Ωρολόγιο & προγραμματικό ─────────────────────────

  async schedule(user: RequestUser, id: string): Promise<DrasiScheduleItemView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.drasiScheduleItem.findMany({
      where: { drasiId: id },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      include: scheduleInclude,
    });
    return rows.map(toScheduleView);
  }

  async addScheduleItem(user: RequestUser, id: string, dto: CreateScheduleItemDto): Promise<DrasiScheduleItemView> {
    await this.access.load(user, id, 'write');
    await this.assertScheduleRefs(user, dto);
    const row = await this.prisma.drasiScheduleItem.create({
      data: {
        drasiId: id,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt ?? null,
        title: dto.title.trim(),
        kind: dto.kind ?? 'DRASTIRIOTITA',
        location: dto.location?.trim() || null,
        description: dto.description?.trim() || null,
        responsibleId: dto.responsibleId ?? null,
        executorId: dto.executorId ?? null,
        ylikoNotes: dto.ylikoNotes?.trim() || null,
        ...(dto.yliko?.length ? { yliko: { create: dto.yliko.map((y) => ({ ylikoId: y.ylikoId, qty: y.qty ?? 1 })) } } : {}),
      },
      include: scheduleInclude,
    });
    return toScheduleView(row);
  }

  async updateScheduleItem(user: RequestUser, id: string, itemId: string, dto: UpdateScheduleItemDto): Promise<DrasiScheduleItemView> {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId: id } });
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    await this.assertScheduleRefs(user, dto);
    const startsAt = dto.startsAt ?? item.startsAt;
    const endsAt = dto.endsAt === undefined ? item.endsAt : dto.endsAt;
    if (endsAt && endsAt < startsAt) throw new BadRequestException('Η λήξη είναι πριν την έναρξη.');

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.yliko) {
        await tx.drasiScheduleYliko.deleteMany({ where: { itemId } });
        if (dto.yliko.length) {
          await tx.drasiScheduleYliko.createMany({ data: dto.yliko.map((y) => ({ itemId, ylikoId: y.ylikoId, qty: y.qty ?? 1 })), skipDuplicates: true });
        }
      }
      return tx.drasiScheduleItem.update({
        where: { id: itemId },
        data: {
          startsAt,
          endsAt,
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.responsibleId !== undefined ? { responsibleId: dto.responsibleId } : {}),
          ...(dto.executorId !== undefined ? { executorId: dto.executorId } : {}),
          ...(dto.ylikoNotes !== undefined ? { ylikoNotes: dto.ylikoNotes?.trim() || null } : {}),
        },
        include: scheduleInclude,
      });
    });
    return toScheduleView(row);
  }

  async removeScheduleItem(user: RequestUser, id: string, itemId: string) {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId: id } });
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    await this.prisma.drasiScheduleItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  /**
   * Αντιγράφει το ωρολόγιο μιας ημέρας σε άλλη (ίδιες ώρες, άλλη ημερομηνία).
   * Μαζί και τα προγραμματικά — εγερτήριο, γεύματα και υπηρεσίες επαναλαμβάνονται.
   */
  async copyDay(user: RequestUser, id: string, dto: CopyDayDto): Promise<{ copied: number }> {
    await this.access.load(user, id, 'write');
    const tz = await this.timezone(user);
    const items = await this.prisma.drasiScheduleItem.findMany({ where: { drasiId: id }, include: { yliko: true } });
    const source = items.filter((i) => localDate(i.startsAt, tz) === dto.from);
    if (source.length === 0) throw new BadRequestException('Η ημέρα προέλευσης δεν έχει στοιχεία.');
    const shiftMs = (Date.parse(`${dto.to}T12:00:00Z`) - Date.parse(`${dto.from}T12:00:00Z`));
    for (const i of source) {
      await this.prisma.drasiScheduleItem.create({
        data: {
          drasiId: id,
          startsAt: new Date(i.startsAt.getTime() + shiftMs),
          endsAt: i.endsAt ? new Date(i.endsAt.getTime() + shiftMs) : null,
          title: i.title,
          kind: i.kind,
          location: i.location,
          description: i.description,
          responsibleId: i.responsibleId,
          executorId: i.executorId,
          ylikoNotes: i.ylikoNotes,
          ...(i.yliko.length ? { yliko: { create: i.yliko.map((y) => ({ ylikoId: y.ylikoId, qty: y.qty })) } } : {}),
        },
      });
    }
    return { copied: source.length };
  }

  /** Η ζώνη ώρας του Τοπικού — οι «ημέρες» του ωρολογίου κόβονται εκεί, όχι στο UTC του server. */
  async timezone(user: RequestUser): Promise<string> {
    const topiko = await this.prisma.topiko.findUnique({ where: { id: user.topikoId }, select: { timezone: true } });
    return topiko?.timezone ?? 'Europe/Athens';
  }

  private async assertScheduleRefs(user: RequestUser, dto: CreateScheduleItemDto): Promise<void> {
    for (const uid of [dto.responsibleId, dto.executorId]) if (uid) await this.assertStelexos(user, uid);
    if (dto.yliko?.length) {
      const ids = [...new Set(dto.yliko.map((y) => y.ylikoId))];
      const found = await this.prisma.yliko.count({ where: { id: { in: ids }, topikoId: user.topikoId, archivedAt: null } });
      if (found !== ids.length) throw new BadRequestException('Κάποιο είδος υλικού δεν βρέθηκε.');
    }
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
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        treasuryEntry: { select: { id: true, amount: true, category: true } },
        yliko: { select: { id: true, name: true } },
      },
    });
    return rows.map(toShoppingView);
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
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        treasuryEntry: { select: { id: true, amount: true, category: true } },
        yliko: { select: { id: true, name: true } },
      },
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
        data: { purchasedAt: new Date(), treasuryEntryId: entry.id, ylikoId },
      });
    });
  }

  // ───────────────────────── Υλικό: φέρνουν άλλοι ─────────────────────────

  async external(user: RequestUser, id: string): Promise<DrasiExternalYlikoView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.drasiExternalYliko.findMany({
      where: { drasiId: id },
      orderBy: [{ returnedAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        klados: { select: { type: true } },
        guestTopiko: { select: { id: true, topikoName: true } },
        responsible: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return rows.map(toExternalView);
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
      include: {
        klados: { select: { type: true } },
        guestTopiko: { select: { id: true, topikoName: true } },
        responsible: { select: { id: true, firstName: true, lastName: true } },
      },
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
        include: { yliko: { select: { name: true, unit: true } } },
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

function toShoppingView(r: {
  id: string;
  name: string;
  qty: number;
  estimatedCost: Prisma.Decimal | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  purchasedAt: Date | null;
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
  };
}

export function toScheduleView(r: {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  title: string;
  kind: DrasiScheduleItemView['kind'];
  location: string | null;
  description: string | null;
  responsible: { id: string; firstName: string; lastName: string } | null;
  executor: { id: string; firstName: string; lastName: string } | null;
  ylikoNotes: string | null;
  yliko: { ylikoId: string; qty: number; yliko: { name: string; unit: string | null } }[];
}): DrasiScheduleItemView {
  return {
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    title: r.title,
    kind: r.kind,
    location: r.location,
    description: r.description,
    responsible: r.responsible,
    executor: r.executor,
    ylikoNotes: r.ylikoNotes,
    yliko: r.yliko.map((y) => ({ ylikoId: y.ylikoId, name: y.yliko.name, unit: y.yliko.unit, qty: y.qty })),
    hasProgramma: Boolean(r.description || r.responsible || r.executor || r.ylikoNotes || r.yliko.length),
  };
}

/** «YYYY-MM-DD» στη ζώνη ώρας του Τοπικού. */
export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
