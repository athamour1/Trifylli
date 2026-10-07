import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrasiFeeKind, DrasiStatus, MemberKind, PaymentHandlingStatus, Prisma } from '@prisma/client';
import {
  DRASI_EXPENSE_CATEGORIES,
  DRASI_INCOME_CATEGORIES,
  PAYMENT_HANDLING_FLOW,
  type DrasiBudgetView,
  type DrasiCollectorView,
  type DrasiLedgerAccount,
  type DrasiLedgerView,
  type DrasiParticipantView,
  type DrasiPaymentView,
  type DrasiTreasurySummary,
  type KladosType,
  type TreasuryCategory,
  type TreasuryEntryView,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import { FilesService } from '../files/files.service';
import { toTreasuryView } from '../treasury/treasury.service';
import type {
  CreateDrasiPaymentDto,
  CreateDrasiTreasuryEntryDto,
  CreateLedgerEntryDto,
  SetBudgetDto,
  UpdateParticipantFeesDto,
} from './dto/drasi-finance.dto';

/**
 * Τα οικονομικά μιας δράσης: το ταμείο της (F1), οι λογαριασμοί των στελεχών
 * (F2) και τα κόστη/εισπράξεις ανά συμμετέχοντα (F4).
 *
 * Μία αρχή σε όλα: **τα έσοδα από συμμετοχές μετριούνται από τις πληρωμές**, όχι
 * από κινήσεις ταμείου. Αλλιώς κάθε ποσό υπάρχει δύο φορές και κάποια στιγμή
 * διαφωνούν. Η κλειστή δράση (`KLEISTI`) δεν δέχεται καμία αλλαγή.
 */
@Injectable()
export class DraseisFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  // ───────────────────────── Ταμείο ─────────────────────────

  async entries(user: RequestUser, id: string): Promise<TreasuryEntryView[]> {
    await this.load(user, id, 'read');
    const rows = await this.prisma.treasuryEntry.findMany({
      where: { drasiId: id },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        klados: { select: { type: true } },
        receiptFile: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.map(toTreasuryView);
  }

  async createEntry(user: RequestUser, id: string, dto: CreateDrasiTreasuryEntryDto): Promise<TreasuryEntryView> {
    const drasi = await this.load(user, id, 'write');
    const allowed = dto.kind === 'INCOME' ? DRASI_INCOME_CATEGORIES : DRASI_EXPENSE_CATEGORIES;
    if (!allowed.includes(dto.category as TreasuryCategory)) {
      throw new BadRequestException('Μη έγκυρη κατηγορία για το ταμείο δράσης.');
    }
    if (dto.receiptFileId) await this.assertReceipt(user, drasi.kladosId, dto.receiptFileId);

    const entry = await this.prisma.treasuryEntry.create({
      data: {
        topikoId: user.topikoId,
        kladosId: drasi.kladosId,
        drasiId: id,
        kind: dto.kind,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        occurredAt: dto.occurredAt ?? new Date(),
        description: dto.description,
        receiptFileId: dto.receiptFileId,
        createdById: user.id,
      },
      include: {
        klados: { select: { type: true } },
        receiptFile: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    return toTreasuryView(entry);
  }

  async removeEntry(user: RequestUser, id: string, entryId: string) {
    await this.load(user, id, 'write');
    const entry = await this.prisma.treasuryEntry.findFirst({
      where: { id: entryId, drasiId: id },
      include: { receiptFile: true },
    });
    if (!entry) throw new NotFoundException('Η κίνηση δεν βρέθηκε.');
    if (entry.receiptFile) await this.files.deleteById(entry.receiptFile.id, entry.receiptFile.objectKey);
    await this.prisma.treasuryEntry.delete({ where: { id: entryId } });
    return { deleted: true };
  }

  async budget(user: RequestUser, id: string): Promise<DrasiBudgetView[]> {
    await this.load(user, id, 'read');
    const rows = await this.prisma.drasiBudget.findMany({ where: { drasiId: id } });
    return rows.map((r) => ({
      category: r.category,
      planned: num(r.planned),
      targetPct: r.targetPct === null ? null : num(r.targetPct),
    }));
  }

  async setBudget(user: RequestUser, id: string, dto: SetBudgetDto): Promise<DrasiBudgetView[]> {
    await this.load(user, id, 'write');
    const byCategory = new Map(dto.items.map((i) => [i.category, i]));
    await this.prisma.$transaction([
      this.prisma.drasiBudget.deleteMany({ where: { drasiId: id } }),
      this.prisma.drasiBudget.createMany({
        data: [...byCategory.values()].map((i) => ({
          drasiId: id,
          category: i.category,
          planned: new Prisma.Decimal(i.planned),
          targetPct: i.targetPct === undefined ? null : new Prisma.Decimal(i.targetPct),
        })),
      }),
    ]);
    return this.budget(user, id);
  }

  /** Η σύνοψη: έσοδα (κινήσεις + εισπράξεις), έξοδα ανά κατηγορία vs προϋπολογισμός, εισπράξεις, λογαριασμοί. */
  async summary(user: RequestUser, id: string): Promise<DrasiTreasurySummary> {
    const drasi = await this.load(user, id, 'read');

    const [grouped, budget, participants, ledger] = await Promise.all([
      this.prisma.treasuryEntry.groupBy({
        by: ['kind', 'category'],
        where: { drasiId: id },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.drasiBudget.findMany({ where: { drasiId: id } }),
      this.prisma.drasiParticipant.findMany({
        where: { drasiId: id },
        include: { payments: true },
      }),
      this.prisma.drasiLedgerEntry.findMany({ where: { drasiId: id } }),
    ]);

    let incomeFromEntries = 0;
    let expense = 0;
    const incomes: DrasiTreasurySummary['incomes'] = [];
    const actualByCategory = new Map<string, { amount: number; count: number }>();
    for (const g of grouped) {
      const amount = num(g._sum.amount);
      if (g.kind === 'INCOME') {
        incomeFromEntries += amount;
        incomes.push({ category: g.category, amount: round2(amount), count: g._count._all });
      } else {
        expense += amount;
        actualByCategory.set(g.category, { amount, count: g._count._all });
      }
    }

    const plannedByCategory = new Map(budget.map((b) => [b.category, b]));
    const categories = new Set<string>([...DRASI_EXPENSE_CATEGORIES, ...actualByCategory.keys(), ...plannedByCategory.keys()]);
    const expenses = [...categories].map((category) => {
      const actual = actualByCategory.get(category);
      const planned = plannedByCategory.get(category);
      return {
        category,
        planned: planned ? num(planned.planned) : 0,
        targetPct: planned?.targetPct != null ? num(planned.targetPct) : null,
        actual: round2(actual?.amount ?? 0),
        actualPct: expense > 0 ? round4((actual?.amount ?? 0) / expense) : 0,
        count: actual?.count ?? 0,
      };
    });

    // Εισπράξεις συμμετοχών
    let expected = 0;
    let collected = 0;
    const byKind = new Map<DrasiFeeKind, { count: number; amount: number }>();
    const byStage = new Map<PaymentHandlingStatus, { amount: number; count: number }>();
    for (const p of participants) {
      const due = dueOf(p);
      expected += due;
      const kind = byKind.get(p.feeKind) ?? { count: 0, amount: 0 };
      kind.count += 1;
      kind.amount += due;
      byKind.set(p.feeKind, kind);
      for (const pay of p.payments) {
        collected += num(pay.amount);
        if (pay.handlingStatus) {
          const stage = byStage.get(pay.handlingStatus) ?? { amount: 0, count: 0 };
          stage.amount += num(pay.amount);
          stage.count += 1;
          byStage.set(pay.handlingStatus, stage);
        }
      }
    }

    // Λογαριασμοί στελεχών
    let given = 0;
    let returned = 0;
    let reimbursed = 0;
    let open = 0;
    for (const e of ledger) {
      const amount = num(e.amount);
      if (e.kind === 'PROKATAVOLI') given += amount;
      else if (e.kind === 'EPISTROFI') returned += amount;
      else reimbursed += amount;
      if (!e.settledAt) open += e.kind === 'PROKATAVOLI' ? amount : e.kind === 'EPISTROFI' ? -amount : 0;
    }

    const income = incomeFromEntries + collected;
    return {
      income: round2(income),
      incomeFromEntries: round2(incomeFromEntries),
      incomeFromPayments: round2(collected),
      expense: round2(expense),
      balance: round2(income - expense),
      locked: drasi.status === DrasiStatus.KLEISTI,
      expenses,
      incomes,
      fees: {
        expected: round2(expected),
        collected: round2(collected),
        outstanding: round2(expected - collected),
        byKind: [...byKind.entries()].map(([kind, v]) => ({ kind, count: v.count, amount: round2(v.amount) })),
        byStage: PAYMENT_HANDLING_FLOW.filter((s) => byStage.has(s)).map((stage) => ({
          stage,
          amount: round2(byStage.get(stage)!.amount),
          count: byStage.get(stage)!.count,
        })),
      },
      ledger: { given: round2(given), returned: round2(returned), reimbursed: round2(reimbursed), open: round2(open) },
    };
  }

  // ───────────────────────── Συμμετέχοντες: κόστη & πληρωμές ─────────────────────────

  async participants(user: RequestUser, id: string): Promise<DrasiParticipantView[]> {
    await this.load(user, id, 'read');
    const rows = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            kind: true,
            birthDate: true,
            phone: true,
            guestTopikoName: true,
            memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } },
          },
        },
        collector: { select: { id: true, firstName: true, lastName: true } },
        payments: {
          include: {
            collectedBy: { select: { id: true, firstName: true, lastName: true } },
            receiptFile: true,
          },
          orderBy: { paidAt: 'asc' },
        },
      },
      orderBy: [{ kind: 'desc' }, { user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
    return rows.map(toParticipantView);
  }

  async updateFees(user: RequestUser, id: string, memberId: string, dto: UpdateParticipantFeesDto) {
    const drasi = await this.load(user, id, 'write');
    const participant = await this.participant(id, memberId);

    if (dto.collectorId) {
      const collector = await this.prisma.user.findFirst({
        where: { id: dto.collectorId, topikoId: user.topikoId, archivedAt: null },
        select: { id: true },
      });
      if (!collector) throw new BadRequestException('Άγνωστο στέλεχος είσπραξης.');
    }

    const feeKind = dto.feeKind ?? participant.feeKind;
    // Αλλαγή είδους χωρίς ρητό ποσό: το ποσό ξαναβγαίνει από τις προεπιλογές της δράσης.
    const feeAmount =
      dto.feeAmount !== undefined
        ? dto.feeAmount
        : dto.feeKind && dto.feeKind !== participant.feeKind
          ? defaultFee(drasi, feeKind)
          : num(participant.feeAmount, null);

    return this.prisma.drasiParticipant.update({
      where: { id: participant.id },
      data: {
        feeKind,
        feeAmount: feeAmount === null ? null : new Prisma.Decimal(feeAmount),
        ...(dto.transportAmount !== undefined
          ? { transportAmount: dto.transportAmount === null ? null : new Prisma.Decimal(dto.transportAmount) }
          : {}),
        ...(dto.feeNote !== undefined ? { feeNote: dto.feeNote?.trim() || null } : {}),
        ...(dto.collectorId !== undefined ? { collectorId: dto.collectorId } : {}),
      },
    });
  }

  async addPayment(user: RequestUser, id: string, memberId: string, dto: CreateDrasiPaymentDto): Promise<DrasiPaymentView> {
    const drasi = await this.load(user, id, 'write');
    const participant = await this.participant(id, memberId);
    if (dto.receiptFileId) await this.assertReceipt(user, drasi.kladosId, dto.receiptFileId);

    const method = dto.method ?? 'CASH';
    const isCash = method === 'CASH';
    const payment = await this.prisma.drasiPayment.create({
      data: {
        participantId: participant.id,
        amount: new Prisma.Decimal(dto.amount),
        paidAt: dto.paidAt ?? new Date(),
        method,
        // Τα μετρητά ξεκινούν την πορεία τους· η κατάθεση είναι ήδη στην τράπεζα.
        handlingStatus: isCash ? PaymentHandlingStatus.EISPRAXTHIKE : PaymentHandlingStatus.KATATETHIKE,
        collectedById: dto.collectedById ?? participant.collectorId ?? user.id,
        receiptFileId: dto.receiptFileId,
        note: dto.note?.trim() || null,
      },
      include: { collectedBy: { select: { id: true, firstName: true, lastName: true } }, receiptFile: true },
    });
    return toPaymentView(payment);
  }

  async deletePayment(user: RequestUser, id: string, paymentId: string) {
    await this.load(user, id, 'write');
    const payment = await this.prisma.drasiPayment.findFirst({
      where: { id: paymentId, participant: { drasiId: id } },
      include: { receiptFile: true },
    });
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε.');
    if (payment.receiptFile) await this.files.deleteById(payment.receiptFile.id, payment.receiptFile.objectKey);
    await this.prisma.drasiPayment.delete({ where: { id: paymentId } });
    return { deleted: true };
  }

  async updateHandling(user: RequestUser, id: string, paymentId: string, status: PaymentHandlingStatus) {
    await this.load(user, id, 'write');
    const payment = await this.prisma.drasiPayment.findFirst({ where: { id: paymentId, participant: { drasiId: id } } });
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε.');
    return this.prisma.drasiPayment.update({ where: { id: paymentId }, data: { handlingStatus: status } });
  }

  /** «Παραδόθηκαν στον Έφορο»: όλα τα μετρητά που κρατά το στέλεχος, με ένα κλικ. */
  async handover(user: RequestUser, id: string, collectorId: string) {
    await this.load(user, id, 'write');
    const result = await this.prisma.drasiPayment.updateMany({
      where: {
        participant: { drasiId: id },
        collectedById: collectorId,
        handlingStatus: PaymentHandlingStatus.EISPRAXTHIKE,
      },
      data: { handlingStatus: PaymentHandlingStatus.PARADOTHIKE },
    });
    return { updated: result.count };
  }

  /** Η όψη ανά υπεύθυνο στέλεχος — αυτή που λύνει το «ποιος κρατά τι». */
  async collectors(user: RequestUser, id: string): Promise<DrasiCollectorView[]> {
    await this.load(user, id, 'read');
    const rows = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id },
      include: {
        collector: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { amount: true, handlingStatus: true, collectedById: true } },
      },
    });

    const buckets = new Map<string, DrasiCollectorView>();
    const bucket = (collector: DrasiCollectorView['collector']) => {
      const key = collector?.id ?? '-';
      const existing = buckets.get(key);
      if (existing) return existing;
      const created: DrasiCollectorView = { collector, participants: 0, expected: 0, collected: 0, holding: 0, outstanding: 0 };
      buckets.set(key, created);
      return created;
    };

    for (const p of rows) {
      const b = bucket(p.collector);
      const due = dueOf(p);
      b.participants += 1;
      b.expected += due;
      for (const pay of p.payments) {
        b.collected += num(pay.amount);
        // Τα μετρητά που εισέπραξε ΟΠΟΙΟΣΔΗΠΟΤΕ και δεν παρέδωσε, πιστώνονται σε
        // όποιον τα εισέπραξε — όχι στον υπεύθυνο του παιδιού.
        if (pay.handlingStatus === PaymentHandlingStatus.EISPRAXTHIKE) {
          const holder = pay.collectedById === p.collector?.id ? b : bucket(pay.collectedById ? { id: pay.collectedById, firstName: '', lastName: '' } : null);
          holder.holding += num(pay.amount);
        }
      }
    }

    // Ονόματα για τους «κατόχους» που δεν είναι υπεύθυνοι κανενός.
    const nameless = [...buckets.values()].filter((b) => b.collector && !b.collector.lastName && !b.collector.firstName);
    if (nameless.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: nameless.map((b) => b.collector!.id) } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const b of nameless) {
        const u = users.find((x) => x.id === b.collector!.id);
        if (u) b.collector = u;
      }
    }

    return [...buckets.values()]
      .map((b) => ({
        ...b,
        expected: round2(b.expected),
        collected: round2(b.collected),
        holding: round2(b.holding),
        outstanding: round2(b.expected - b.collected),
      }))
      .sort((a, b) => (a.collector?.lastName ?? 'Ω').localeCompare(b.collector?.lastName ?? 'Ω', 'el'));
  }

  // ───────────────────────── Λογαριασμοί στελεχών ─────────────────────────

  async ledger(user: RequestUser, id: string): Promise<DrasiLedgerAccount[]> {
    await this.load(user, id, 'read');
    const rows = await this.prisma.drasiLedgerEntry.findMany({
      where: { drasiId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });

    const accounts = new Map<string, DrasiLedgerAccount>();
    for (const r of rows) {
      const acc = accounts.get(r.userId) ?? {
        user: r.user,
        given: 0,
        returned: 0,
        reimbursed: 0,
        balance: 0,
        entries: [],
      };
      const amount = num(r.amount);
      if (r.kind === 'PROKATAVOLI') acc.given += amount;
      else if (r.kind === 'EPISTROFI') acc.returned += amount;
      else acc.reimbursed += amount;
      acc.entries.push(toLedgerView(r));
      accounts.set(r.userId, acc);
    }
    return [...accounts.values()].map((a) => ({
      ...a,
      given: round2(a.given),
      returned: round2(a.returned),
      reimbursed: round2(a.reimbursed),
      // Τι κρατά ακόμη το στέλεχος από τα μετρητά του ταμείου. Κλείνει με
      // επιστροφή ρέστων ή με «τακτοποιήθηκε» (όταν καλύφθηκε από αποδείξεις).
      balance: round2(
        a.entries.filter((e) => !e.settledAt).reduce((s, e) => s + (e.kind === 'PROKATAVOLI' ? e.amount : e.kind === 'EPISTROFI' ? -e.amount : 0), 0),
      ),
    }));
  }

  async addLedger(user: RequestUser, id: string, dto: CreateLedgerEntryDto): Promise<DrasiLedgerView> {
    await this.load(user, id, 'write');
    const stelexos = await this.prisma.user.findFirst({
      where: { id: dto.userId, topikoId: user.topikoId, archivedAt: null },
      select: { id: true },
    });
    if (!stelexos) throw new BadRequestException('Άγνωστο στέλεχος.');

    const entry = await this.prisma.drasiLedgerEntry.create({
      data: {
        drasiId: id,
        userId: dto.userId,
        kind: dto.kind,
        amount: new Prisma.Decimal(dto.amount),
        occurredAt: dto.occurredAt ?? new Date(),
        note: dto.note?.trim() || null,
        createdById: user.id,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return toLedgerView(entry);
  }

  async removeLedger(user: RequestUser, id: string, entryId: string) {
    await this.load(user, id, 'write');
    const entry = await this.prisma.drasiLedgerEntry.findFirst({ where: { id: entryId, drasiId: id } });
    if (!entry) throw new NotFoundException('Η κίνηση δεν βρέθηκε.');
    await this.prisma.drasiLedgerEntry.delete({ where: { id: entryId } });
    return { deleted: true };
  }

  /** Κλείνει τον λογαριασμό ενός στελέχους: ό,τι μένει καλύφθηκε από αποδείξεις. */
  async settleLedger(user: RequestUser, id: string, userId: string) {
    await this.load(user, id, 'write');
    const result = await this.prisma.drasiLedgerEntry.updateMany({
      where: { drasiId: id, userId, settledAt: null },
      data: { settledAt: new Date() },
    });
    return { settled: result.count };
  }

  // ───────────────────────── Εσωτερικά ─────────────────────────

  /**
   * Φορτώνει τη δράση και ελέγχει εμβέλεια. Εγγραφή: ο διοργανωτής, και μόνο αν
   * η δράση είναι ανοιχτή. Ανάγνωση: και κλάδος που απλώς συμμετέχει.
   */
  async load(user: RequestUser, id: string, mode: 'read' | 'write') {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } }, kladoi: { select: { klados: { select: { type: true } } } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');

    const organiser = drasi.klados?.type as KladosType | undefined;
    if (mode === 'write') {
      assertKladosAccess(user, organiser);
      if (drasi.status === DrasiStatus.KLEISTI) {
        throw new ConflictException('Η δράση είναι κλειστή — τα οικονομικά της δεν αλλάζουν πια.');
      }
    } else {
      const scope = scopedKladoi(user);
      const participating = drasi.kladoi.map((k) => k.klados.type as KladosType);
      if (scope && organiser && !scope.includes(organiser) && !participating.some((k) => scope.includes(k))) {
        throw new ForbiddenException(`Δεν έχετε πρόσβαση στα δεδομένα του κλάδου ${organiser}.`);
      }
    }
    return drasi;
  }

  private async participant(drasiId: string, memberId: string) {
    const participant = await this.prisma.drasiParticipant.findUnique({
      where: { drasiId_userId: { drasiId, userId: memberId } },
    });
    if (!participant) throw new NotFoundException('Ο συμμετέχων δεν βρέθηκε στη δράση.');
    return participant;
  }

  /** Η απόδειξη πρέπει να ανήκει στην εμβέλεια του διοργανωτή (κλάδος ή Τοπικό). */
  private async assertReceipt(user: RequestUser, kladosId: string | null, fileId: string): Promise<void> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, topikoId: user.topikoId, kladosId },
      select: { id: true },
    });
    if (!file) throw new BadRequestException('Η απόδειξη δεν βρέθηκε σε αυτήν την εμβέλεια.');
  }
}

// ───────────────────────── Βοηθοί ─────────────────────────

type ParticipantWithFees = {
  feeKind: DrasiFeeKind;
  feeAmount: Prisma.Decimal | null;
  transportAmount: Prisma.Decimal | null;
};

/** Τι οφείλει ένας συμμετέχων: συμμετοχή (0 αν δωρεάν) + μεταφορικά. */
export function dueOf(p: ParticipantWithFees): number {
  const fee = p.feeKind === DrasiFeeKind.DOREAN ? 0 : num(p.feeAmount);
  return fee + num(p.transportAmount);
}

/** Η προεπιλογή ποσού ανά είδος συμμετοχής, από τα πεδία κόστους της δράσης. */
export function defaultFee(
  drasi: { costPerPerson: Prisma.Decimal | null; costReduced: Prisma.Decimal | null; costStelexos: Prisma.Decimal | null },
  kind: DrasiFeeKind,
): number | null {
  switch (kind) {
    case DrasiFeeKind.PLIRIS:
      return num(drasi.costPerPerson, null);
    case DrasiFeeKind.MEIOMENI:
      return num(drasi.costReduced, null) ?? num(drasi.costPerPerson, null);
    case DrasiFeeKind.STELEXOS:
      return num(drasi.costStelexos, null);
    default:
      return 0;
  }
}

/** Το είδος συμμετοχής που ταιριάζει σε ένα νέο μέλος της δράσης. */
export function defaultFeeKind(kind: MemberKind): DrasiFeeKind {
  return kind === MemberKind.STELEXOS ? DrasiFeeKind.STELEXOS : DrasiFeeKind.PLIRIS;
}

function toParticipantView(p: {
  id: string;
  kind: MemberKind;
  confirmed: boolean;
  attended: boolean | null;
  note: string | null;
  feeKind: DrasiFeeKind;
  feeAmount: Prisma.Decimal | null;
  transportAmount: Prisma.Decimal | null;
  feeNote: string | null;
  collector: { id: string; firstName: string; lastName: string } | null;
  payments: Parameters<typeof toPaymentView>[0][];
  user: {
    id: string;
    firstName: string;
    lastName: string;
    kind: MemberKind;
    birthDate: Date | null;
    phone: string | null;
    guestTopikoName: string | null;
    memberships: { klados: { type: string } }[];
  };
}): DrasiParticipantView {
  const due = dueOf(p);
  const paid = p.payments.reduce((s, x) => s + num(x.amount), 0);
  return {
    id: p.id,
    kind: p.kind,
    confirmed: p.confirmed,
    attended: p.attended,
    note: p.note,
    feeKind: p.feeKind,
    feeAmount: num(p.feeAmount, null),
    transportAmount: num(p.transportAmount, null),
    feeNote: p.feeNote,
    due: round2(due),
    paid: round2(paid),
    balance: round2(due - paid),
    collector: p.collector,
    payments: p.payments.map(toPaymentView),
    user: {
      id: p.user.id,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      kind: p.user.kind,
      birthDate: p.user.birthDate?.toISOString() ?? null,
      phone: p.user.phone,
      kladosType: (p.user.memberships[0]?.klados.type as KladosType | undefined) ?? null,
      guestTopikoName: p.user.guestTopikoName,
    },
  };
}

function toPaymentView(p: {
  id: string;
  amount: Prisma.Decimal;
  paidAt: Date;
  method: string | null;
  handlingStatus: PaymentHandlingStatus | null;
  collectedBy: { id: string; firstName: string; lastName: string } | null;
  receiptFile: { id: string; filename: string; contentType: string; size: number; createdAt: Date } | null;
  note: string | null;
}): DrasiPaymentView {
  return {
    id: p.id,
    amount: num(p.amount),
    paidAt: p.paidAt.toISOString(),
    method: p.method,
    handlingStatus: p.handlingStatus,
    collectedBy: p.collectedBy,
    receipt: p.receiptFile
      ? {
          id: p.receiptFile.id,
          filename: p.receiptFile.filename,
          contentType: p.receiptFile.contentType,
          size: p.receiptFile.size,
          createdAt: p.receiptFile.createdAt.toISOString(),
        }
      : null,
    note: p.note,
  };
}

function toLedgerView(r: {
  id: string;
  kind: string;
  amount: Prisma.Decimal;
  occurredAt: Date;
  note: string | null;
  settledAt: Date | null;
  user: { id: string; firstName: string; lastName: string };
}): DrasiLedgerView {
  return {
    id: r.id,
    kind: r.kind as DrasiLedgerView['kind'],
    amount: num(r.amount),
    occurredAt: r.occurredAt.toISOString(),
    note: r.note,
    settledAt: r.settledAt?.toISOString() ?? null,
    user: r.user,
  };
}

function num(value: Prisma.Decimal | number | null | undefined): number;
function num(value: Prisma.Decimal | number | null | undefined, fallback: null): number | null;
function num(value: Prisma.Decimal | number | null | undefined, fallback: number | null = 0): number | null {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
