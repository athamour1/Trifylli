import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BLOCKING_CHECKOUT_STATUSES,
  KLADOS_LABEL,
  type KladosType,
  type Paginated,
  type YlikoAvailability,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, assertScopeAccess, scopedKladoi } from '../../common/util/klados-scope';
import { availableQty, peakReserved, type Interval } from './availability';
import type {
  CreateMaintenanceDto,
  CreateStoragePointDto,
  CreateYlikoDto,
  QueryYlikoDto,
  UpdateStoragePointDto,
  UpdateYlikoDto,
} from './dto/yliko.dto';

@Injectable()
export class YlikoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Λίστα υλικού. Όταν δοθεί διάστημα (`from`/`to`), κάθε είδος συνοδεύεται από
   * την πραγματική διαθεσιμότητά του σε εκείνο το διάστημα — αυτό βλέπει το
   * στέλεχος πριν δεσμεύσει.
   */
  async list(user: RequestUser, query: QueryYlikoDto): Promise<Paginated<YlikoAvailability>> {
    const window = readWindow(query);
    if (query.klados) assertKladosAccess(user, query.klados);
    const scopeKladosId = query.klados ? await this.resolveKladosId(user, query.klados) : null;

    const where: Prisma.YlikoWhereInput = {
      topikoId: user.topikoId,
      archivedAt: null,
      ...(query.category?.length ? { category: { in: query.category } } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.centralOnly ? { kladosId: null } : {}),
      // Σε εμβέλεια κλάδου: τα δικά του είδη **και** όσα του έχουν δανειστεί τώρα
      // (ενεργή δέσμευση προς αυτόν) — όπως τα φαρμακεία δείχνουν «Δανεισμένο από».
      ...(query.klados && !query.centralOnly
        ? {
            OR: [
              { klados: { type: query.klados } },
              {
                checkouts: {
                  some: { kladosId: scopeKladosId, status: { in: [...BLOCKING_CHECKOUT_STATUSES] } },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.yliko.count({ where }),
      this.prisma.yliko.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
        include: {
          klados: { select: { type: true } },
          storagePoint: { select: { id: true, name: true } },
          // Όλες οι ενεργές δεσμεύσεις: για τη διαθεσιμότητα (peak στο παράθυρο)
          // και για να ξεχωρίσουμε τι είναι δανεισμένο σε ποιον.
          checkouts: {
            where: { status: { in: [...BLOCKING_CHECKOUT_STATUSES] } },
            select: { kladosId: true, qty: true, from: true, to: true },
          },
        },
      }),
    ]);

    const items: YlikoAvailability[] = rows.map((row) => {
      const reservations = row.checkouts;
      const reserved = window ? peakReserved(reservations, window) : 0;
      // Σε εμβέλεια κλάδου, ό,τι δεν ανήκει στον κλάδο επέστρεψε λόγω δανεισμού.
      const borrowed = query.klados != null && row.kladosId !== scopeKladosId;
      const myLoans = borrowed ? reservations.filter((c) => c.kladosId === scopeKladosId) : [];
      const borrowedQty = myLoans.reduce((sum, c) => sum + c.qty, 0);
      const borrowedUntil = myLoans.reduce<Date | null>((max, c) => (!max || c.to > max ? c.to : max), null);
      return {
        ylikoId: row.id,
        name: row.name,
        category: row.category,
        totalQty: row.totalQty,
        reservedQty: reserved,
        availableQty: Math.max(0, row.totalQty - reserved),
        ownerKladosType: (row.klados?.type as KladosType | undefined) ?? null,
        relation: borrowed ? ('BORROWED' as const) : ('OWNED' as const),
        ...(borrowed ? { borrowedQty, borrowedUntil: borrowedUntil?.toISOString() ?? null } : {}),
        storagePointId: row.storagePointId ?? null,
        storagePointName: row.storagePoint?.name ?? null,
      };
    });

    const filtered = query.lowStock
      ? items.filter((item, index) => isLowStock(rows[index].minQty, item.availableQty, rows[index].expiresAt))
      : items;

    return { items: filtered, total, page: query.page, pageSize: query.pageSize };
  }

  /** Ένα είδος με το ιστορικό δεσμεύσεών του — η οθόνη λεπτομερειών. */
  async findOne(user: RequestUser, id: string, range?: Interval) {
    const yliko = await this.prisma.yliko.findFirst({
      where: { id, topikoId: user.topikoId },
      include: {
        klados: { select: { type: true, name: true } },
        storagePoint: { select: { id: true, name: true } },
        maintenance: {
          orderBy: { date: 'desc' },
          include: { createdBy: { select: { firstName: true, lastName: true } } },
        },
        checkouts: {
          orderBy: { from: 'desc' },
          take: 50,
          include: {
            klados: { select: { type: true } },
            drasi: { select: { id: true, title: true, type: true } },
            syggentrwsh: { select: { id: true, date: true, klados: { select: { type: true } } } },
            requestedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!yliko) throw new NotFoundException('Το υλικό δεν βρέθηκε.');

    const blocking = yliko.checkouts.filter((c) =>
      (BLOCKING_CHECKOUT_STATUSES as readonly string[]).includes(c.status),
    );

    return {
      ...yliko,
      availableNow: availableQty(yliko.totalQty, blocking, range ?? nextThirtyDays()),
    };
  }

  async create(user: RequestUser, dto: CreateYlikoDto) {
    this.assertNotCentralForKladosAdmin(user, dto.kladosType);
    const kladosId = await this.resolveKladosId(user, dto.kladosType);
    await this.assertStoragePoint(user, dto.storagePointId, kladosId);
    return this.prisma.yliko.create({
      data: {
        topikoId: user.topikoId,
        kladosId,
        name: dto.name,
        category: dto.category,
        totalQty: dto.totalQty,
        unit: dto.unit,
        storageLocation: dto.storageLocation,
        storagePointId: dto.storagePointId ?? null,
        consumable: dto.consumable ?? false,
        minQty: dto.minQty,
        expiresAt: dto.expiresAt,
        notes: dto.notes,
      },
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateYlikoDto) {
    const existing = await this.prisma.yliko.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!existing) throw new NotFoundException('Το υλικό δεν βρέθηκε.');
    assertKladosAccess(user, existing.klados?.type as KladosType | undefined);

    // Μείωση αποθέματος κάτω από ήδη δεσμευμένη ποσότητα αφήνει το σύστημα
    // ασυνεπές — καλύτερα να αποτύχει με εξηγήσιμο μήνυμα.
    if (dto.totalQty !== undefined && dto.totalQty < existing.totalQty) {
      const peak = await this.peakForYliko(id, nextThirtyDays());
      if (dto.totalQty < peak) {
        throw new BadRequestException(
          `Υπάρχουν δεσμεύσεις για ${peak} τεμάχια· δεν μπορεί να μειωθεί το απόθεμα σε ${dto.totalQty}.`,
        );
      }
    }

    const kladosId =
      dto.kladosType !== undefined ? await this.resolveKladosId(user, dto.kladosType) : undefined;
    // Χωρίς αλλαγή κλάδου στο αίτημα, κρατάμε τον τρέχοντα κλάδο του υλικού.
    await this.assertStoragePoint(user, dto.storagePointId, kladosId ?? existing.kladosId);

    return this.prisma.yliko.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.totalQty !== undefined ? { totalQty: dto.totalQty } : {}),
        ...(kladosId !== undefined ? { kladosId } : {}),
        unit: dto.unit,
        storageLocation: dto.storageLocation,
        ...(dto.storagePointId !== undefined ? { storagePointId: dto.storagePointId } : {}),
        consumable: dto.consumable,
        minQty: dto.minQty,
        expiresAt: dto.expiresAt,
        notes: dto.notes,
      },
    });
  }

  /** Αρχειοθέτηση, όχι διαγραφή: οι παλιές δεσμεύσεις πρέπει να παραμένουν αναγνώσιμες. */
  async archive(user: RequestUser, id: string) {
    const existing = await this.prisma.yliko.findFirst({ where: { id, topikoId: user.topikoId } });
    if (!existing) throw new NotFoundException('Το υλικό δεν βρέθηκε.');
    return this.prisma.yliko.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  /** Συγκεντρωτικά ανά κατηγορία και κλάδο — τροφοδοτεί το dashboard Τοπικού. */
  async summary(user: RequestUser) {
    const rows = await this.prisma.yliko.groupBy({
      by: ['category', 'kladosId'],
      where: { topikoId: user.topikoId, archivedAt: null },
      _sum: { totalQty: true },
      _count: { _all: true },
    });

    const kladoi = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: { id: true, type: true },
    });
    const kladosById = new Map(kladoi.map((k) => [k.id, k.type as KladosType]));

    return rows.map((row) => {
      const kladosType = row.kladosId ? (kladosById.get(row.kladosId) ?? null) : null;
      return {
        category: row.category,
        kladosType,
        label: kladosType ? KLADOS_LABEL[kladosType] : 'Κεντρική αποθήκη',
        items: row._count._all,
        totalQty: row._sum.totalQty ?? 0,
      };
    });
  }

  /** Είδη που χρειάζονται προσοχή: κάτω από κατώφλι ή κοντά στη λήξη. */
  async alerts(user: RequestUser) {
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 2);

    const rows = await this.prisma.yliko.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        OR: [{ minQty: { not: null } }, { expiresAt: { lte: soon } }],
      },
      include: { klados: { select: { type: true } } },
      orderBy: { expiresAt: 'asc' },
    });

    return rows
      .filter((row) => isLowStock(row.minQty, row.totalQty, row.expiresAt))
      .map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        kladosType: (row.klados?.type as KladosType | undefined) ?? null,
        totalQty: row.totalQty,
        minQty: row.minQty,
        expiresAt: row.expiresAt,
        reason: row.expiresAt && row.expiresAt <= soon ? 'ΛΗΞΗ' : 'ΧΑΜΗΛΟ_ΑΠΟΘΕΜΑ',
      }));
  }

  /** Η μέγιστη ταυτόχρονη δέσμευση ενός είδους σε ένα διάστημα. */
  async peakForYliko(ylikoId: string, window: Interval): Promise<number> {
    const checkouts = await this.prisma.ylikoCheckout.findMany({
      where: {
        ylikoId,
        status: { in: [...BLOCKING_CHECKOUT_STATUSES] },
        from: { lt: window.to },
        to: { gt: window.from },
      },
      select: { qty: true, from: true, to: true },
    });
    return peakReserved(checkouts, window);
  }

  // ──────────────────── Βλάβες & επιδιορθώσεις ────────────────────

  /**
   * Σημείωση βλάβης ή επιδιόρθωσης.
   *
   * Το **κόστος** αφορά μόνο τις επιδιορθώσεις (`REPAIR`) — μια βλάβη/φθορά δεν
   * έχει χρέωση. Όταν μια επιδιόρθωση έχει κόστος, δημιουργείται αυτόματα κίνηση
   * ταμείου (έξοδο, κατηγορία «Υλικό») στο ταμείο που την πλήρωσε: τον κλάδο που
   * έκανε την επισκευή (π.χ. πριν επιστρέψει τη δέσμευση) ή το Τοπικό, για υλικό
   * της γενικής αποθήκης. Η σημείωση και η κίνηση ταμείου συνδέονται, ώστε η
   * διαγραφή της μίας να σβήνει και την άλλη.
   */
  async addMaintenance(user: RequestUser, ylikoId: string, dto: CreateMaintenanceDto) {
    const yliko = await this.prisma.yliko.findFirst({
      where: { id: ylikoId, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!yliko) throw new NotFoundException('Το υλικό δεν βρέθηκε.');
    assertKladosAccess(user, yliko.klados?.type as KladosType | undefined);

    // Το κόστος μετράει μόνο στην επιδιόρθωση· σε βλάβη/φθορά το αγνοούμε.
    const cost = dto.kind === 'REPAIR' && dto.cost != null && dto.cost > 0 ? dto.cost : null;
    const date = dto.date ?? new Date();
    const include = { createdBy: { select: { firstName: true, lastName: true } } };

    if (cost == null) {
      return this.prisma.ylikoMaintenance.create({
        data: { ylikoId, kind: dto.kind, note: dto.note, cost: null, date, createdById: user.id },
        include,
      });
    }

    // Χρέωση: στον κλάδο που πλήρωσε την επισκευή ή στο Τοπικό (κενό).
    const chargeKlados = dto.chargeToKladosType;
    assertScopeAccess(user, 'treasury:manage', chargeKlados);
    const chargeKladosId = chargeKlados ? await this.resolveKladosId(user, chargeKlados) : null;

    return this.prisma.$transaction(async (tx) => {
      const treasuryEntry = await tx.treasuryEntry.create({
        data: {
          topikoId: user.topikoId,
          kladosId: chargeKladosId,
          kind: 'EXPENSE',
          category: 'YLIKO',
          amount: new Prisma.Decimal(cost),
          occurredAt: date,
          description: `Επιδιόρθωση «${yliko.name}» — ${dto.note}`,
          createdById: user.id,
        },
      });
      return tx.ylikoMaintenance.create({
        data: {
          ylikoId,
          kind: dto.kind,
          note: dto.note,
          cost: new Prisma.Decimal(cost),
          date,
          createdById: user.id,
          treasuryEntryId: treasuryEntry.id,
        },
        include,
      });
    });
  }

  async deleteMaintenance(user: RequestUser, id: string) {
    const entry = await this.prisma.ylikoMaintenance.findFirst({
      where: { id, yliko: { topikoId: user.topikoId } },
      include: { yliko: { select: { klados: { select: { type: true } } } } },
    });
    if (!entry) throw new NotFoundException('Η σημείωση δεν βρέθηκε.');
    assertKladosAccess(user, entry.yliko.klados?.type as KladosType | undefined);

    // Σβήνοντας μια επιδιόρθωση με κόστος, αντιλογίζουμε και την κίνηση ταμείου.
    await this.prisma.$transaction(async (tx) => {
      await tx.ylikoMaintenance.delete({ where: { id } });
      if (entry.treasuryEntryId) {
        await tx.treasuryEntry.delete({ where: { id: entry.treasuryEntryId } });
      }
    });
    return { deleted: true };
  }

  // ───────────────────────── Σημεία αποθήκευσης ─────────────────────────

  /**
   * Τα σημεία αποθήκευσης της εμβέλειας: ενός κλάδου τα δικά του, του Τοπικού τα
   * κεντρικά. Τα κεντρικά **δεν** εμφανίζονται στους κλάδους — ανήκουν στο
   * Τοπικό και αφορούν μόνο το κεντρικό υλικό.
   */
  async listStoragePoints(user: RequestUser, klados?: KladosType) {
    if (klados) assertKladosAccess(user, klados);
    const kladosId = klados ? await this.resolveKladosId(user, klados) : null;
    const points = await this.prisma.storagePoint.findMany({
      where: { topikoId: user.topikoId, archivedAt: null, kladosId },
      include: { klados: { select: { type: true } } },
      orderBy: { name: 'asc' },
    });
    return points.map(mapStoragePoint);
  }

  async createStoragePoint(user: RequestUser, dto: CreateStoragePointDto) {
    this.assertNotCentralForKladosAdmin(user, dto.kladosType);
    const kladosId = await this.resolveKladosId(user, dto.kladosType);
    const point = await this.prisma.storagePoint.create({
      data: { topikoId: user.topikoId, kladosId, name: dto.name },
      include: { klados: { select: { type: true } } },
    });
    return mapStoragePoint(point);
  }

  async updateStoragePoint(user: RequestUser, id: string, dto: UpdateStoragePointDto) {
    const point = await this.loadStoragePointInScope(user, id);
    const updated = await this.prisma.storagePoint.update({
      where: { id: point.id },
      data: { name: dto.name },
      include: { klados: { select: { type: true } } },
    });
    return mapStoragePoint(updated);
  }

  /** Αρχειοθέτηση — το υλικό που το δείχνει απλώς «χάνει» το σημείο (SetNull). */
  async archiveStoragePoint(user: RequestUser, id: string) {
    const point = await this.loadStoragePointInScope(user, id);
    await this.prisma.storagePoint.update({ where: { id: point.id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }

  private async loadStoragePointInScope(user: RequestUser, id: string) {
    const point = await this.prisma.storagePoint.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!point) throw new NotFoundException('Το σημείο αποθήκευσης δεν βρέθηκε.');
    assertKladosAccess(user, point.klados?.type as KladosType | undefined);
    if (!point.kladosId && scopedKladoi(user)) {
      throw new ForbiddenException('Τα κεντρικά σημεία αποθήκευσης τα διαχειρίζεται ο υπερδιαχειριστής.');
    }
    return point;
  }

  /** Ο διαχειριστής κλάδου δεν διαχειρίζεται την κεντρική αποθήκη (χωρίς κλάδο). */
  private assertNotCentralForKladosAdmin(user: RequestUser, kladosType?: KladosType): void {
    if (!kladosType && scopedKladoi(user)) {
      throw new ForbiddenException('Η κεντρική αποθήκη ανήκει στον υπερδιαχειριστή.');
    }
  }

  /**
   * Το σημείο αποθήκευσης υπάρχει και ανήκει στην ίδια εμβέλεια με το υλικό:
   * υλικό κλάδου → σημείο του ίδιου κλάδου· κεντρικό υλικό → κεντρικό σημείο.
   * Έτσι ένας κλάδος δεν μπορεί να βάλει υλικό σε κεντρικό σημείο (ούτε μέσω API).
   */
  private async assertStoragePoint(
    user: RequestUser,
    id: string | undefined,
    kladosId: string | null,
  ): Promise<void> {
    if (!id) return;
    const point = await this.prisma.storagePoint.findFirst({
      where: { id, topikoId: user.topikoId, archivedAt: null },
      select: { id: true, kladosId: true },
    });
    if (!point) throw new BadRequestException('Άγνωστο σημείο αποθήκευσης.');
    if (point.kladosId !== kladosId) {
      throw new BadRequestException('Το σημείο αποθήκευσης δεν ανήκει σε αυτόν τον κλάδο.');
    }
  }

  /** Μετατρέπει τύπο κλάδου σε id, επιβάλλοντας την εμβέλεια του χρήστη. */
  private async resolveKladosId(user: RequestUser, kladosType?: KladosType): Promise<string | null> {
    if (!kladosType) return null;
    assertKladosAccess(user, kladosType);
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type: kladosType } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${kladosType} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}

function readWindow(query: { from?: Date; to?: Date }): Interval | null {
  if (!query.from || !query.to) return null;
  if (query.from >= query.to) throw new BadRequestException('Το `from` πρέπει να προηγείται του `to`.');
  return { from: query.from, to: query.to };
}

function nextThirtyDays(): Interval {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  return { from, to };
}

function isLowStock(minQty: number | null, qty: number, expiresAt: Date | null): boolean {
  if (expiresAt && expiresAt.getTime() <= Date.now() + 60 * 24 * 3600 * 1000) return true;
  return minQty !== null && qty <= minQty;
}

function mapStoragePoint(point: { id: string; name: string; klados: { type: string } | null }) {
  return {
    id: point.id,
    name: point.name,
    kladosType: (point.klados?.type as KladosType | undefined) ?? null,
  };
}
