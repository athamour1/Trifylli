import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KLADOS_LABEL,
  TREASURY_EXPENSE_CATEGORIES,
  TREASURY_INCOME_CATEGORIES,
  type KladosType,
  type TreasuryCategory,
  type TreasuryEntryView,
  type TreasurySummary,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertScopeAccess } from '../../common/util/klados-scope';
import { FilesService } from '../files/files.service';
import type { CreateTreasuryEntryDto, QueryTreasuryDto } from './dto/treasury.dto';

/**
 * Ταμείο δύο επιπέδων: κάθε κλάδος κρατά το δικό του, ο υπερδιαχειριστής κρατά
 * και το ταμείο Τοπικού (`kladosId = null`). Το υπόλοιπο προκύπτει πάντα από
 * έσοδα − έξοδα — δεν αποθηκεύεται ξεχωριστά.
 */
@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async list(user: RequestUser, query: QueryTreasuryDto): Promise<TreasuryEntryView[]> {
    assertScopeAccess(user, 'treasury:read', query.klados);
    const kladosId = await this.resolveKladosId(user, query.klados);
    const rows = await this.prisma.treasuryEntry.findMany({
      where: {
        topikoId: user.topikoId,
        kladosId: query.klados ? kladosId : null,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.from || query.to
          ? { occurredAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        klados: { select: { type: true } },
        receiptFile: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
      take: 500,
    });
    return rows.map(toView);
  }

  async summary(user: RequestUser, kladosType?: KladosType): Promise<TreasurySummary> {
    assertScopeAccess(user, 'treasury:read', kladosType);
    const kladosId = await this.resolveKladosId(user, kladosType);
    const grouped = await this.prisma.treasuryEntry.groupBy({
      by: ['kind', 'category'],
      where: { topikoId: user.topikoId, kladosId: kladosType ? kladosId : null },
      _sum: { amount: true },
    });

    let income = 0;
    let expense = 0;
    const byCategory = grouped.map((g) => {
      const amount = Number(g._sum.amount ?? 0);
      if (g.kind === 'INCOME') income += amount;
      else expense += amount;
      return { category: g.category, kind: g.kind as 'INCOME' | 'EXPENSE', amount: round2(amount) };
    });

    return {
      scope: { kladosType: kladosType ?? null, label: kladosType ? KLADOS_LABEL[kladosType] : 'Τοπικό' },
      income: round2(income),
      expense: round2(expense),
      balance: round2(income - expense),
      byCategory,
    };
  }

  /** Σύνοψη όλων των ταμείων (Τοπικό + κλάδοι) — μόνο υπερδιαχειριστής. */
  async overview(user: RequestUser) {
    assertScopeAccess(user, 'treasury:read', null);
    const grouped = await this.prisma.treasuryEntry.groupBy({
      by: ['kladosId', 'kind'],
      where: { topikoId: user.topikoId },
      _sum: { amount: true },
    });
    const kladoi = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: { id: true, type: true },
    });
    const byId = new Map(kladoi.map((k) => [k.id, k.type as KladosType]));

    const scopes = new Map<string, { kladosType: KladosType | null; income: number; expense: number }>();
    // Προ-γέμισμα ώστε να εμφανίζονται και τα ταμεία χωρίς κινήσεις ακόμη.
    scopes.set('TOPIKO', { kladosType: null, income: 0, expense: 0 });
    for (const k of kladoi) scopes.set(k.id, { kladosType: k.type as KladosType, income: 0, expense: 0 });

    for (const g of grouped) {
      const key = g.kladosId ?? 'TOPIKO';
      const entry = scopes.get(key) ?? {
        kladosType: g.kladosId ? (byId.get(g.kladosId) ?? null) : null,
        income: 0,
        expense: 0,
      };
      const amount = Number(g._sum.amount ?? 0);
      if (g.kind === 'INCOME') entry.income += amount;
      else entry.expense += amount;
      scopes.set(key, entry);
    }

    return [...scopes.values()].map((s) => ({
      kladosType: s.kladosType,
      label: s.kladosType ? KLADOS_LABEL[s.kladosType] : 'Τοπικό',
      income: round2(s.income),
      expense: round2(s.expense),
      balance: round2(s.income - s.expense),
    }));
  }

  async create(user: RequestUser, dto: CreateTreasuryEntryDto): Promise<TreasuryEntryView> {
    assertScopeAccess(user, 'treasury:manage', dto.kladosType);
    const allowed = dto.kind === 'INCOME' ? TREASURY_INCOME_CATEGORIES : TREASURY_EXPENSE_CATEGORIES;
    if (!allowed.includes(dto.category as TreasuryCategory)) {
      throw new BadRequestException('Μη έγκυρη κατηγορία για αυτό το είδος κίνησης.');
    }
    const kladosId = await this.resolveKladosId(user, dto.kladosType);

    if (dto.receiptFileId) {
      const file = await this.prisma.storedFile.findFirst({
        where: { id: dto.receiptFileId, topikoId: user.topikoId, kladosId: dto.kladosType ? kladosId : null },
        select: { id: true },
      });
      if (!file) throw new BadRequestException('Η απόδειξη δεν βρέθηκε σε αυτήν την εμβέλεια.');
    }

    const entry = await this.prisma.treasuryEntry.create({
      data: {
        topikoId: user.topikoId,
        kladosId,
        kind: dto.kind,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        occurredAt: dto.occurredAt ?? new Date(),
        description: dto.description,
        donorType: dto.donorType,
        receiptFileId: dto.receiptFileId,
        createdById: user.id,
      },
      include: {
        klados: { select: { type: true } },
        receiptFile: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    return toView(entry);
  }

  async remove(user: RequestUser, id: string) {
    const entry = await this.prisma.treasuryEntry.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } }, receiptFile: true },
    });
    if (!entry) throw new NotFoundException('Η κίνηση δεν βρέθηκε.');
    assertScopeAccess(user, 'treasury:manage', entry.klados?.type as KladosType | undefined);
    if (entry.receiptFile) await this.files.deleteById(entry.receiptFile.id, entry.receiptFile.objectKey);
    await this.prisma.treasuryEntry.delete({ where: { id } });
    return { deleted: true };
  }

  private async resolveKladosId(user: RequestUser, kladosType?: KladosType): Promise<string | null> {
    if (!kladosType) return null;
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type: kladosType } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${kladosType} δεν υπάρχει.`);
    return klados.id;
  }
}

function toView(e: {
  id: string;
  kind: string;
  category: string;
  amount: Prisma.Decimal;
  occurredAt: Date;
  description: string | null;
  donorType: string | null;
  klados: { type: string } | null;
  receiptFile: { id: string; filename: string; contentType: string; size: number; createdAt: Date } | null;
  createdBy: { firstName: string; lastName: string } | null;
  createdAt: Date;
}): TreasuryEntryView {
  return {
    id: e.id,
    kind: e.kind as 'INCOME' | 'EXPENSE',
    category: e.category,
    amount: Number(e.amount),
    occurredAt: e.occurredAt.toISOString(),
    description: e.description,
    kladosType: (e.klados?.type as KladosType | undefined) ?? null,
    donorType: e.donorType,
    receipt: e.receiptFile
      ? {
          id: e.receiptFile.id,
          filename: e.receiptFile.filename,
          contentType: e.receiptFile.contentType,
          size: e.receiptFile.size,
          createdAt: e.receiptFile.createdAt.toISOString(),
        }
      : null,
    createdBy: e.createdBy ? { firstName: e.createdBy.firstName, lastName: e.createdBy.lastName } : null,
    createdAt: e.createdAt.toISOString(),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
