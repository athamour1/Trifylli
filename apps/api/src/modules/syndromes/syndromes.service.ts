import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SyndromiStatus } from '@prisma/client';
import {
  KLADOS_LABEL,
  PAYMENT_HANDLING_FLOW,
  PAYMENT_HANDLING_KLADOS_STAGES,
  type KladosType,
  type PaymentHandlingStatus,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, assertScopeAccess, scopedKladoi } from '../../common/util/klados-scope';
import type { CreatePaymentDto, CreatePeriodDto, SetSyndromiDto } from './dto/syndromes.dto';

/**
 * Συνδρομές και πληρωμές.
 *
 * Η κατάσταση (`SyndromiStatus`) δεν τίθεται ποτέ χειροκίνητα: προκύπτει πάντα
 * από τη σύγκριση οφειλόμενου και καταβεβλημένου, εκτός από την `APALLAGI` που
 * είναι ρητή απόφαση. Έτσι δεν υπάρχει εγγραφή «πληρωμένη» με υπόλοιπο.
 *
 * Εμβέλεια: ο υπερδιαχειριστής βλέπει όλο το Τοπικό· ο διαχειριστής κλάδου μόνο
 * τα μέλη του δικού του κλάδου (επιβάλλεται εδώ, όχι στο guard — ο κλάδος ενός
 * μέλους προκύπτει από την ενεργή του ιδιότητα).
 */
@Injectable()
export class SyndromesService {
  constructor(private readonly prisma: PrismaService) {}

  async periods(user: RequestUser) {
    return this.prisma.period.findMany({
      where: { topikoId: user.topikoId },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { syndromes: true } } },
    });
  }

  /** Δημιουργεί περίοδο και, προαιρετικά, συνδρομές για όλα τα ενεργά μέλη. */
  async createPeriod(user: RequestUser, dto: CreatePeriodDto) {
    // Η περίοδος αφορά όλο το Τοπικό — μόνο ο υπερδιαχειριστής.
    assertScopeAccess(user, 'syndromes:manage', null);
    if (dto.startDate >= dto.endDate) {
      throw new BadRequestException('Η έναρξη της περιόδου πρέπει να προηγείται της λήξης.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent) {
        // Μόνο μία τρέχουσα περίοδος: αλλιώς τα υπόλοιπα υπολογίζονται διπλά.
        await tx.period.updateMany({
          where: { topikoId: user.topikoId, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      const period = await tx.period.create({
        data: {
          topikoId: user.topikoId,
          label: dto.label,
          startDate: dto.startDate,
          endDate: dto.endDate,
          syndromiAmount: dto.syndromiAmount,
          isCurrent: dto.isCurrent ?? false,
        },
      });

      if (dto.generateForAllMembers) {
        const members = await tx.user.findMany({
          where: { topikoId: user.topikoId, archivedAt: null, status: 'ENERGO' },
          select: { id: true },
        });

        await tx.syndromi.createMany({
          data: members.map((member) => ({
            userId: member.id,
            periodId: period.id,
            amountDue: dto.syndromiAmount,
            status: SyndromiStatus.EKKREMI,
          })),
          skipDuplicates: true,
        });
      }

      return period;
    });
  }

  /** Ορισμός οφειλόμενου ποσού ανά μέλος (εκπτώσεις αδελφών, απαλλαγές). */
  async setSyndromi(user: RequestUser, memberId: string, dto: SetSyndromiDto) {
    const period = await this.requirePeriod(user, dto.periodId);
    await this.assertMemberInScope(user, memberId);

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, topikoId: user.topikoId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Το μέλος δεν βρέθηκε.');

    const amountDue = new Prisma.Decimal(dto.amountDue ?? period.syndromiAmount);

    const existing = await this.prisma.syndromi.findUnique({
      where: { userId_periodId: { userId: memberId, periodId: period.id } },
      select: { amountPaid: true },
    });
    const amountPaid = existing?.amountPaid ?? new Prisma.Decimal(0);

    return this.prisma.syndromi.upsert({
      where: { userId_periodId: { userId: memberId, periodId: period.id } },
      create: {
        userId: memberId,
        periodId: period.id,
        amountDue,
        status: dto.exempt ? SyndromiStatus.APALLAGI : deriveStatus(amountDue, amountPaid),
        note: dto.note,
      },
      update: {
        amountDue,
        status: dto.exempt ? SyndromiStatus.APALLAGI : deriveStatus(amountDue, amountPaid),
        note: dto.note,
      },
    });
  }

  /**
   * Καταγραφή πληρωμής. Το άθροισμα των πληρωμών είναι η πηγή αλήθειας — το
   * `amountPaid` ξαναϋπολογίζεται από τις εγγραφές, δεν αυξάνεται σταδιακά.
   *
   * Τα μετρητά ξεκινούν στο στάδιο `EISPRAXTHIKE`. Αν συνοδεύονται από δωρεά,
   * αυτή καταγράφεται ως έσοδο στο ταμείο του κλάδου του μέλους.
   */
  async addPayment(user: RequestUser, syndromiId: string, dto: CreatePaymentDto) {
    const syndromi = await this.prisma.syndromi.findFirst({
      where: { id: syndromiId, period: { topikoId: user.topikoId } },
      select: {
        id: true,
        amountDue: true,
        status: true,
        userId: true,
        user: {
          select: {
            memberships: {
              where: { leftAt: null },
              select: { klados: { select: { id: true, type: true } } },
            },
          },
        },
      },
    });
    if (!syndromi) throw new NotFoundException('Η συνδρομή δεν βρέθηκε.');
    if (dto.amount <= 0) throw new BadRequestException('Το ποσό πληρωμής πρέπει να είναι θετικό.');

    const memberKlados = syndromi.user.memberships[0]?.klados ?? null;
    this.assertKladosInScope(user, memberKlados?.type as KladosType | undefined);

    const isCash = dto.method === 'CASH';
    const handlingStatus: PaymentHandlingStatus | null = isCash
      ? (dto.handlingStatus ?? 'EISPRAXTHIKE')
      : (dto.handlingStatus ?? null);

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          syndromiId,
          amount: dto.amount,
          paidAt: dto.paidAt ?? new Date(),
          method: dto.method,
          receiptNo: dto.receiptNo,
          note: dto.note,
          handlingStatus,
          collectedById: dto.collectedById ?? (isCash ? user.id : undefined),
        },
      });

      // Προαιρετική δωρεά → έσοδο στο ταμείο του κλάδου του μέλους.
      if (dto.donationAmount && dto.donationAmount > 0) {
        if (!memberKlados) {
          throw new BadRequestException('Το μέλος δεν ανήκει σε κλάδο — δεν μπορεί να καταχωρηθεί δωρεά.');
        }
        await tx.treasuryEntry.create({
          data: {
            topikoId: user.topikoId,
            kladosId: memberKlados.id,
            kind: 'INCOME',
            category: 'DOREA',
            amount: new Prisma.Decimal(dto.donationAmount),
            occurredAt: dto.paidAt ?? new Date(),
            description: dto.donationNote,
            donorType: dto.donorType,
            createdById: user.id,
          },
        });
      }

      const sum = await tx.payment.aggregate({ where: { syndromiId }, _sum: { amount: true } });
      const amountPaid = sum._sum.amount ?? new Prisma.Decimal(0);

      return tx.syndromi.update({
        where: { id: syndromiId },
        data: {
          amountPaid,
          status:
            syndromi.status === SyndromiStatus.APALLAGI
              ? SyndromiStatus.APALLAGI
              : deriveStatus(syndromi.amountDue, amountPaid),
        },
        include: { payments: { orderBy: { paidAt: 'desc' } } },
      });
    });
  }

  /** Μετάβαση σταδίου διαχείρισης μετρητών (είσπραξη → … → τακτοποίηση). */
  async updateHandling(user: RequestUser, paymentId: string, status: PaymentHandlingStatus) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, syndromi: { period: { topikoId: user.topikoId } } },
      select: {
        id: true,
        syndromi: {
          select: {
            user: {
              select: { memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } } },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε.');
    const kladosType = payment.syndromi.user.memberships[0]?.klados.type as KladosType | undefined;
    this.assertKladosInScope(user, kladosType);

    // Ο κλάδος προχωρά μόνο μέχρι την παράδοση στον Έφορο· κατάθεση/τακτοποίηση
    // τις κάνει ο Τοπικός Έφορος (υπερδιαχειριστής).
    if (!PAYMENT_HANDLING_KLADOS_STAGES.includes(status)) {
      assertScopeAccess(user, 'syndromes:manage', null);
    }

    return this.prisma.payment.update({ where: { id: paymentId }, data: { handlingStatus: status } });
  }

  async deletePayment(user: RequestUser, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, syndromi: { period: { topikoId: user.topikoId } } },
      include: {
        syndromi: {
          select: {
            id: true,
            amountDue: true,
            status: true,
            user: {
              select: { memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } } },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Η πληρωμή δεν βρέθηκε.');
    this.assertKladosInScope(
      user,
      payment.syndromi.user.memberships[0]?.klados.type as KladosType | undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });

      const sum = await tx.payment.aggregate({
        where: { syndromiId: payment.syndromi.id },
        _sum: { amount: true },
      });
      const amountPaid = sum._sum.amount ?? new Prisma.Decimal(0);

      return tx.syndromi.update({
        where: { id: payment.syndromi.id },
        data: {
          amountPaid,
          status:
            payment.syndromi.status === SyndromiStatus.APALLAGI
              ? SyndromiStatus.APALLAGI
              : deriveStatus(payment.syndromi.amountDue, amountPaid),
        },
      });
    });
  }

  /**
   * Οικονομική εικόνα περιόδου, ανά κλάδο: εισπραχθέντα, εκκρεμή, ποσοστό.
   * Για τον διαχειριστή κλάδου περιορίζεται στον δικό του κλάδο.
   */
  async report(user: RequestUser, periodId?: string, klados?: KladosType) {
    const period = await this.requirePeriod(user, periodId);

    const syndromes = await this.prisma.syndromi.findMany({
      where: { periodId: period.id, user: this.memberScopeFilter(user, klados) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
          },
        },
      },
    });

    const buckets = new Map<
      string,
      { kladosType: KladosType | null; label: string; due: number; paid: number; members: number; debtors: number }
    >();

    for (const syndromi of syndromes) {
      const kladosType = (syndromi.user.memberships[0]?.klados.type as KladosType | undefined) ?? null;
      const key = kladosType ?? 'TOPIKO';
      const entry =
        buckets.get(key) ??
        {
          kladosType,
          label: kladosType ? KLADOS_LABEL[kladosType] : 'Χωρίς κλάδο',
          due: 0,
          paid: 0,
          members: 0,
          debtors: 0,
        };

      const due = Number(syndromi.amountDue);
      const paid = Number(syndromi.amountPaid);
      entry.members += 1;

      // Οι απαλλαγές δεν μετρούν ως οφειλή: αλλιώς η στήλη «εκκρεμή» δεν
      // αντιστοιχεί σε εισπράξιμο ποσό.
      if (syndromi.status !== SyndromiStatus.APALLAGI) {
        entry.due += due;
        entry.paid += paid;
        if (paid < due) entry.debtors += 1;
      }

      buckets.set(key, entry);
    }

    const perKlados = [...buckets.values()].map((entry) => ({
      ...entry,
      due: round2(entry.due),
      paid: round2(entry.paid),
      pending: round2(entry.due - entry.paid),
      collectedPct: entry.due === 0 ? 100 : Math.round((entry.paid / entry.due) * 100),
    }));

    const totals = perKlados.reduce(
      (acc, k) => ({
        due: acc.due + k.due,
        paid: acc.paid + k.paid,
        members: acc.members + k.members,
        debtors: acc.debtors + k.debtors,
      }),
      { due: 0, paid: 0, members: 0, debtors: 0 },
    );

    return {
      period: { id: period.id, label: period.label, amount: Number(period.syndromiAmount) },
      perKlados,
      totals: {
        ...totals,
        due: round2(totals.due),
        paid: round2(totals.paid),
        pending: round2(totals.due - totals.paid),
        collectedPct: totals.due === 0 ? 100 : Math.round((totals.paid / totals.due) * 100),
      },
    };
  }

  /** Όλες οι συνδρομές της περιόδου (για την οθόνη εισπράξεων), με εμβέλεια. */
  async members(user: RequestUser, periodId?: string, klados?: KladosType) {
    const period = await this.requirePeriod(user, periodId);
    const rows = await this.prisma.syndromi.findMany({
      where: { periodId: period.id, user: this.memberScopeFilter(user, klados) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
          },
        },
      },
    });

    const members = rows
      .map((row) => ({
        syndromiId: row.id,
        memberId: row.user.id,
        name: `${row.user.lastName} ${row.user.firstName}`.trim(),
        kladosType: (row.user.memberships[0]?.klados.type as KladosType | undefined) ?? null,
        amountDue: Number(row.amountDue),
        amountPaid: Number(row.amountPaid),
        balance: round2(Number(row.amountDue) - Number(row.amountPaid)),
        status: row.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'el'));

    return {
      period: { id: period.id, label: period.label, amount: Number(period.syndromiAmount) },
      members,
    };
  }

  /** Οι οφειλέτες της περιόδου, με το υπόλοιπο καθενός. */
  async debtors(user: RequestUser, periodId?: string, klados?: KladosType) {
    const period = await this.requirePeriod(user, periodId);

    const rows = await this.prisma.syndromi.findMany({
      where: {
        periodId: period.id,
        status: { in: [SyndromiStatus.EKKREMI, SyndromiStatus.MERIKI] },
        user: this.memberScopeFilter(user, klados),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
          },
        },
      },
    });

    return rows
      .map((row) => ({
        syndromiId: row.id,
        memberId: row.user.id,
        name: `${row.user.lastName} ${row.user.firstName}`.trim(),
        email: row.user.email,
        phone: row.user.phone,
        kladosType: (row.user.memberships[0]?.klados.type as KladosType | undefined) ?? null,
        amountDue: Number(row.amountDue),
        amountPaid: Number(row.amountPaid),
        balance: round2(Number(row.amountDue) - Number(row.amountPaid)),
      }))
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }

  /**
   * Οι εισπράξεις μετρητών και το στάδιο της καθεμιάς — τροφοδοτεί τον πίνακα
   * «πορεία μετρητών» (ποιος έχει πληρώσει, τι έχει κατατεθεί κ.λπ.).
   */
  async cashFlow(user: RequestUser, periodId?: string, klados?: KladosType) {
    const period = await this.requirePeriod(user, periodId);

    const payments = await this.prisma.payment.findMany({
      where: {
        handlingStatus: { not: null },
        syndromi: { periodId: period.id, user: this.memberScopeFilter(user, klados) },
      },
      orderBy: { paidAt: 'desc' },
      include: {
        collectedBy: { select: { firstName: true, lastName: true } },
        syndromi: {
          select: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
              },
            },
          },
        },
      },
    });

    const items = payments.map((p) => {
      const member = p.syndromi.user;
      return {
        paymentId: p.id,
        memberName: `${member.lastName} ${member.firstName}`.trim(),
        kladosType: (member.memberships[0]?.klados.type as KladosType | undefined) ?? null,
        amount: Number(p.amount),
        paidAt: p.paidAt.toISOString(),
        handlingStatus: p.handlingStatus,
        collectedBy: p.collectedBy ? `${p.collectedBy.lastName} ${p.collectedBy.firstName}`.trim() : null,
      };
    });

    // Σύνοψη ανά στάδιο — πλήθος + ποσό.
    const byStage = PAYMENT_HANDLING_FLOW.map((stage) => {
      const forStage = items.filter((i) => i.handlingStatus === stage);
      return { stage, count: forStage.length, amount: round2(forStage.reduce((s, i) => s + i.amount, 0)) };
    });

    return { period: { id: period.id, label: period.label }, items, byStage };
  }

  private async requirePeriod(user: RequestUser, periodId?: string) {
    const period = periodId
      ? await this.prisma.period.findFirst({ where: { id: periodId, topikoId: user.topikoId } })
      : await this.prisma.period.findFirst({ where: { topikoId: user.topikoId, isCurrent: true } });

    if (!period) {
      throw new NotFoundException(
        periodId ? 'Η περίοδος δεν βρέθηκε.' : 'Δεν έχει οριστεί τρέχουσα περίοδος.',
      );
    }
    return period;
  }

  /**
   * Φίλτρο Prisma που περιορίζει σε μέλη της εμβέλειας. Όταν δοθεί ρητός
   * `klados` (π.χ. από σελίδα κλάδου), φιλτράρει σε αυτόν· αλλιώς στους κλάδους
   * του χρήστη (null = όλοι, για τον υπερδιαχειριστή).
   */
  private memberScopeFilter(user: RequestUser, klados?: KladosType): Prisma.UserWhereInput {
    const kladoi = this.resolveKladoi(user, klados);
    if (!kladoi) return {};
    return { memberships: { some: { leftAt: null, klados: { type: { in: kladoi } } } } };
  }

  private resolveKladoi(user: RequestUser, klados?: KladosType): KladosType[] | null {
    if (klados) {
      assertKladosAccess(user, klados);
      return [klados];
    }
    return scopedKladoi(user);
  }

  /** Το μέλος ανήκει σε κλάδο που βλέπει ο χρήστης; */
  private async assertMemberInScope(user: RequestUser, memberId: string): Promise<void> {
    const kladoi = scopedKladoi(user);
    if (!kladoi) return;
    const membership = await this.prisma.membership.findFirst({
      where: { userId: memberId, leftAt: null, klados: { topikoId: user.topikoId, type: { in: kladoi } } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Το μέλος δεν ανήκει στον κλάδο σας.');
  }

  private assertKladosInScope(user: RequestUser, kladosType: KladosType | undefined): void {
    const kladoi = scopedKladoi(user);
    if (!kladoi) return;
    if (!kladosType || !kladoi.includes(kladosType)) {
      throw new ForbiddenException('Το μέλος δεν ανήκει στον κλάδο σας.');
    }
  }
}

/** Η κατάσταση προκύπτει πάντα από τα ποσά — ποτέ χειροκίνητα. */
function deriveStatus(amountDue: Prisma.Decimal, amountPaid: Prisma.Decimal): SyndromiStatus {
  const due = Number(amountDue);
  const paid = Number(amountPaid);
  if (paid >= due) return SyndromiStatus.PLIROMENI;
  if (paid > 0) return SyndromiStatus.MERIKI;
  return SyndromiStatus.EKKREMI;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
