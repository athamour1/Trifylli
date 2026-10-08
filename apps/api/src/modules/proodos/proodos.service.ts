import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind, ProodosStatus } from '@prisma/client';
import { PROODOS_STATUS_LABEL, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import type {
  CreateGoalDto,
  ProodosEntryDto,
  UpdateEntryDto,
  UpdateProodosDto,
} from './dto/proodos.dto';

@Injectable()
export class ProodosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ο κατάλογος στόχων ενός κλάδου — τα «στάδια» που ακολουθεί ο κλάδος. */
  async goals(user: RequestUser, klados: KladosType) {
    assertKladosAccess(user, klados);
    const kladosId = await this.kladosId(user, klados);

    return this.prisma.proodosGoal.findMany({
      where: { kladosId, archivedAt: null },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
  }

  async createGoal(user: RequestUser, klados: KladosType, dto: CreateGoalDto) {
    assertKladosAccess(user, klados);
    const kladosId = await this.kladosId(user, klados);

    return this.prisma.proodosGoal.create({
      data: {
        kladosId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        order: dto.order ?? 0,
      },
    });
  }

  /**
   * Ο πίνακας προόδου ενός κλάδου: μέλη × στόχοι.
   *
   * Επιστρέφεται πλήρες πλέγμα (και τα κενά), ώστε το UI να μπορεί να το
   * εμφανίσει ως πίνακα χωρίς δεύτερη κλήση και να δουλεύει offline.
   */
  async grid(user: RequestUser, klados: KladosType) {
    assertKladosAccess(user, klados);
    const kladosId = await this.kladosId(user, klados);

    const [goals, members, records] = await this.prisma.$transaction([
      this.prisma.proodosGoal.findMany({
        where: { kladosId, archivedAt: null },
        orderBy: [{ category: 'asc' }, { order: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          status: 'ENERGO',
          // Μόνο τα (ανήλικα) μέλη του κλάδου — όχι τα στελέχη: η ατομική πρόοδος
          // (Υπόσχεση/Μονοπάτια/Πτυχία/Κορυφές) αφορά τους οδηγούς, όχι τους ενήλικες.
          memberships: { some: { kladosId, leftAt: null, kind: MemberKind.MELOS } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          memberships: { where: { kladosId, leftAt: null }, select: { subUnit: true } },
        },
      }),
      this.prisma.proodosRecord.findMany({
        where: { goal: { kladosId } },
        select: { userId: true, goalId: true, status: true, completedAt: true, note: true },
      }),
    ]);

    const byKey = new Map(records.map((r) => [`${r.userId}:${r.goalId}`, r]));

    return {
      kladosType: klados,
      goals,
      members: members.map((member) => {
        const cells = goals.map((goal) => {
          const record = byKey.get(`${member.id}:${goal.id}`);
          return {
            goalId: goal.id,
            status: record?.status ?? ProodosStatus.DEN_XEKINISE,
            completedAt: record?.completedAt ?? null,
            note: record?.note ?? null,
          };
        });
        const done = cells.filter((c) => c.status === ProodosStatus.OLOKLIROMENO).length;
        return {
          memberId: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          subUnit: member.memberships[0]?.subUnit ?? null,
          cells,
          completed: done,
          progressPct: goals.length === 0 ? 0 : Math.round((done / goals.length) * 100),
        };
      }),
      labels: PROODOS_STATUS_LABEL,
    };
  }

  /**
   * Καταχώρηση προόδου. Το `completedAt` τίθεται αυτόματα όταν ο στόχος
   * ολοκληρώνεται και καθαρίζεται αν επιστρέψει σε εξέλιξη — αλλιώς μένουν
   * ημερομηνίες ολοκλήρωσης σε στόχους που δεν ολοκληρώθηκαν.
   */
  async setRecord(user: RequestUser, memberId: string, dto: UpdateProodosDto) {
    const goal = await this.prisma.proodosGoal.findFirst({
      where: { id: dto.goalId, klados: { topikoId: user.topikoId } },
      include: { klados: { select: { id: true, type: true } } },
    });
    if (!goal) throw new NotFoundException('Ο στόχος δεν βρέθηκε.');
    assertKladosAccess(user, goal.klados.type as KladosType);

    const membership = await this.prisma.membership.findFirst({
      where: { userId: memberId, kladosId: goal.klados.id, leftAt: null },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException('Το μέλος δεν ανήκει στον κλάδο του στόχου.');

    const period = await this.prisma.period.findFirst({
      where: { topikoId: user.topikoId, isCurrent: true },
      select: { id: true },
    });

    const completedAt = dto.status === ProodosStatus.OLOKLIROMENO ? (dto.completedAt ?? new Date()) : null;

    return this.prisma.proodosRecord.upsert({
      where: { userId_goalId: { userId: memberId, goalId: dto.goalId } },
      create: {
        userId: memberId,
        goalId: dto.goalId,
        periodId: period?.id,
        status: dto.status,
        completedAt,
        note: dto.note,
      },
      update: { status: dto.status, completedAt, note: dto.note },
    });
  }

  /** Η ατομική καρτέλα προόδου ενός μέλους, ομαδοποιημένη κατά κατηγορία στόχων. */
  async forMember(user: RequestUser, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, topikoId: user.topikoId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
      },
    });
    if (!member) throw new NotFoundException('Το μέλος δεν βρέθηκε.');

    const kladoi = member.memberships.map((m) => m.klados.type as KladosType);
    const scope = scopedKladoi(user);
    if (scope && !kladoi.some((k) => scope.includes(k))) {
      throw new NotFoundException('Το μέλος δεν βρέθηκε.');
    }

    const records = await this.prisma.proodosRecord.findMany({
      where: { userId: memberId },
      include: { goal: true },
      orderBy: [{ goal: { category: 'asc' } }, { goal: { order: 'asc' } }],
    });

    const byCategory = new Map<string, typeof records>();
    for (const record of records) {
      const key = record.goal.category ?? 'Γενικά';
      byCategory.set(key, [...(byCategory.get(key) ?? []), record]);
    }

    return {
      member: { id: member.id, firstName: member.firstName, lastName: member.lastName },
      categories: [...byCategory.entries()].map(([category, items]) => ({
        category,
        items,
        completed: items.filter((i) => i.status === ProodosStatus.OLOKLIROMENO).length,
        total: items.length,
      })),
    };
  }

  // ────── Καρτέλα Ατομικής Προόδου (entries) — Οδηγοί & Μεγάλοι Οδηγοί ──────
  // Το backend μόνο αποθηκεύει/επιστρέφει εγγραφές και ελέγχει εμβέλεια· η
  // σύνοψη (Κορυφές / Πυξίδες) υπολογίζεται στο UI, γιατί διαφέρει ανά κλάδο.

  /** Φορτώνει μέλος ελέγχοντας Τοπικό + εμβέλεια κλάδου του χρήστη. */
  private async memberInScope(user: RequestUser, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, topikoId: user.topikoId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } },
      },
    });
    if (!member) throw new NotFoundException('Το μέλος δεν βρέθηκε.');

    const kladoi = member.memberships.map((m) => m.klados.type as KladosType);
    const scope = scopedKladoi(user);
    if (scope && !kladoi.some((k) => scope.includes(k))) {
      throw new NotFoundException('Το μέλος δεν βρέθηκε.');
    }
    return member;
  }

  /** Μέλη κλάδου με τις εγγραφές προόδου τους — η σύνοψη υπολογίζεται στο UI. */
  async cardMembers(user: RequestUser, klados: KladosType) {
    assertKladosAccess(user, klados);
    const kladosId = await this.kladosId(user, klados);

    const members = await this.prisma.user.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        status: 'ENERGO',
        // Μόνο τα (ανήλικα) μέλη του κλάδου — όχι τα στελέχη: η ατομική πρόοδος
        // αφορά τους οδηγούς/ανήλικα μέλη, όχι τους ενήλικες αρχηγούς.
        memberships: { some: { kladosId, leftAt: null, kind: MemberKind.MELOS } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberships: { where: { kladosId, leftAt: null }, select: { subUnit: true } },
        proodosEntries: { select: { kind: true, category: true } },
      },
    });

    return members.map((m) => ({
      memberId: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      subUnit: m.memberships[0]?.subUnit ?? null,
      entries: m.proodosEntries,
    }));
  }

  /** Η Καρτέλα Ατομικής Προόδου ενός μέλους — πλήρεις εγγραφές. */
  async card(user: RequestUser, memberId: string) {
    const member = await this.memberInScope(user, memberId);
    const entries = await this.prisma.proodosEntry.findMany({
      where: { userId: memberId },
      orderBy: [{ passedAt: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      member: { id: member.id, firstName: member.firstName, lastName: member.lastName },
      entries,
    };
  }

  async addEntry(user: RequestUser, memberId: string, dto: ProodosEntryDto) {
    await this.memberInScope(user, memberId);
    return this.prisma.proodosEntry.create({
      data: {
        userId: memberId,
        kind: dto.kind,
        category: dto.category ?? null,
        title: dto.title,
        passedAt: dto.passedAt ?? null,
        note: dto.note ?? null,
      },
    });
  }

  async updateEntry(user: RequestUser, entryId: string, dto: UpdateEntryDto) {
    const entry = await this.prisma.proodosEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true },
    });
    if (!entry) throw new NotFoundException('Η εγγραφή δεν βρέθηκε.');
    await this.memberInScope(user, entry.userId);

    return this.prisma.proodosEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.passedAt !== undefined ? { passedAt: dto.passedAt } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  async deleteEntry(user: RequestUser, entryId: string) {
    const entry = await this.prisma.proodosEntry.findUnique({
      where: { id: entryId },
      select: { id: true, userId: true },
    });
    if (!entry) throw new NotFoundException('Η εγγραφή δεν βρέθηκε.');
    await this.memberInScope(user, entry.userId);
    await this.prisma.proodosEntry.delete({ where: { id: entryId } });
    return { deleted: true };
  }

  private async kladosId(user: RequestUser, type: KladosType): Promise<string> {
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type } },
      select: { id: true },
    });
    if (!klados) throw new NotFoundException(`Ο κλάδος ${type} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}
