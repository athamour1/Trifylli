import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckoutStatus, Prisma, SymvoulioType, YlikoCategory } from '@prisma/client';
import {
  DRASI_EXPENSE_CATEGORIES,
  type DrasiDayView,
  type DrasiExternalYlikoView,
  type DrasiLoadingList,
  type DrasiShoppingItemView,
  type DrasiSymvoulioView,
  type KladosType,
  type TreasuryCategory,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import type { CreateDrasiSymvoulioDto, ExternalYlikoDto, PurchaseShoppingItemDto, ShoppingItemDto } from './dto/drasi-plan.dto';

/**
 * Πρόγραμμα (F7), συμβούλια (F8) και υλικό (F9) μιας δράσης.
 *
 * Το πρόγραμμα ΔΕΝ είναι νέο μοντέλο: κάθε ημέρα δράσης είναι μία `Syggentrwsh`
 * με `drasiId` — αυτό που το schema είχε ήδη σχεδιάσει. Τα κομμάτια, οι
 * υπεύθυνοι και το απαιτούμενο υλικό δουλεύουν όπως σε κάθε συγκέντρωση.
 */
@Injectable()
export class DraseisPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
  ) {}

  // ───────────────────────── Πρόγραμμα ─────────────────────────

  async days(user: RequestUser, id: string): Promise<DrasiDayView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.syggentrwsh.findMany({
      where: { drasiId: id, archivedAt: null },
      orderBy: { date: 'asc' },
      include: {
        klados: { select: { type: true } },
        timeline: {
          select: {
            durationMin: true,
            responsible: { select: { firstName: true, lastName: true } },
            executor: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date.toISOString(),
      startTime: s.startTime?.toISOString() ?? null,
      endTime: s.endTime?.toISOString() ?? null,
      location: s.location,
      kladosType: (s.klados?.type as KladosType | undefined) ?? null,
      blocks: s.timeline.length,
      responsibles: [
        ...new Set(
          s.timeline.flatMap((b) => [b.responsible, b.executor]).filter((u): u is NonNullable<typeof u> => !!u).map((u) => `${u.lastName} ${u.firstName}`),
        ),
      ],
      totalDurationMin: s.timeline.reduce((sum, b) => sum + b.durationMin, 0),
    }));
  }

  /**
   * Μία ημέρα για κάθε ημερομηνία της δράσης που δεν έχει ακόμη. Η μονοήμερη
   * παίρνει μία — ο χρήστης δεν βλέπει ποτέ τη λέξη «συγκέντρωση».
   */
  async createDays(user: RequestUser, id: string): Promise<{ created: number }> {
    const drasi = await this.access.load(user, id, 'write');
    const existing = await this.prisma.syggentrwsh.findMany({ where: { drasiId: id, archivedAt: null }, select: { date: true } });
    const taken = new Set(existing.map((s) => dayKey(s.date)));

    const dates: Date[] = [];
    for (let d = startOfDay(drasi.dateStart); d <= drasi.dateEnd; d = new Date(d.getTime() + 86_400_000)) {
      if (!taken.has(dayKey(d))) dates.push(new Date(d.getTime() + 12 * 3_600_000));
    }
    if (dates.length === 0) return { created: 0 };

    const multi = dates.length + existing.length > 1;
    await this.prisma.syggentrwsh.createMany({
      data: dates.map((date, i) => ({
        kladosId: drasi.kladosId,
        drasiId: id,
        date,
        title: multi ? `Ημέρα ${existing.length + i + 1}` : drasi.title,
        location: drasi.location,
      })),
    });
    return { created: dates.length };
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
