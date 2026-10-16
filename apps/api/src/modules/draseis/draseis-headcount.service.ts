import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind, type DrasiGroupKind } from '@prisma/client';
import type { DrasiHeadcountView } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DrasiAccessService } from './drasi-access.service';
import { headcountTotals, newerCheck } from './headcount';

/** Πόσες καταμετρήσεις δείχνει η δράση. */
const LIST_SIZE = 10;
const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;
/** Ώρα συσκευής λίγο μπροστά από τον server: δεκτή (ρολόγια). Πιο πέρα: η ώρα του server. */
const CLOCK_SKEW_MS = 2 * 60_000;

/**
 * Η καταμέτρηση της δράσης (συνεργασία, Φ13): ο Αρχηγός ξεκινά («Αναχώρηση
 * από Μέγαρα») ανά ενωμοτία ή ανά σκηνή· κάθε στέλεχος επιβεβαιώνει όποια ομάδα
 * — «όλοι εδώ» ή ποιοι λείπουν — και φαίνεται ποιος. Δουλεύει και με κακό σήμα:
 * η μέτρηση μπαίνει στην ουρά της συσκευής και κρατιέται η νεότερη.
 *
 * Οι ειδοποιήσεις λένε μόνο πόσοι και ποια ομάδα — ποτέ ονόματα παιδιών.
 */
@Injectable()
export class DraseisHeadcountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Οι ομάδες του είδους, με τα μέλη τους (όσοι μετρώνται). */
  private async groups(drasiId: string, kind: DrasiGroupKind) {
    return this.prisma.drasiGroup.findMany({
      where: { drasiId, kind },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        members: { select: { participant: { select: { id: true, user: { select: { firstName: true, lastName: true } } } } } },
      },
    });
  }

  async list(user: RequestUser, drasiId: string): Promise<DrasiHeadcountView[]> {
    await this.access.load(user, drasiId, 'read');
    const rows = await this.prisma.drasiHeadcount.findMany({
      where: { drasiId },
      orderBy: { createdAt: 'desc' },
      take: LIST_SIZE,
      include: { createdBy: PERSON, checks: { include: { checkedBy: PERSON } } },
    });
    const byKind = new Map<DrasiGroupKind, Awaited<ReturnType<DraseisHeadcountService['groups']>>>();
    for (const kind of new Set(rows.map((row) => row.groupKind))) byKind.set(kind, await this.groups(drasiId, kind));

    return rows.map((row) => {
      const checks = new Map(row.checks.map((check) => [check.groupId, check]));
      const groups = (byKind.get(row.groupKind) ?? [])
        .filter((group) => group.members.length > 0)
        .map((group) => {
          const check = checks.get(group.id);
          return {
            id: group.id,
            name: group.name,
            members: group.members
              .map((member) => ({ id: member.participant.id, ...member.participant.user }))
              .sort((a, b) => a.lastName.localeCompare(b.lastName, 'el') || a.firstName.localeCompare(b.firstName, 'el')),
            check: check ? { absentIds: check.absentIds, by: check.checkedBy, at: check.checkedAt.toISOString() } : null,
          };
        });
      return {
        id: row.id,
        title: row.title,
        groupKind: row.groupKind,
        by: row.createdBy,
        at: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        closedAt: row.closedAt?.toISOString() ?? null,
        groups,
        totals: headcountTotals(groups.map((group) => ({ members: group.members.map((m) => m.id), check: group.check }))),
      };
    });
  }

  /** «Αναχώρηση από Μέγαρα»: ξεκινά, και το μαθαίνουν τα στελέχη της δράσης. */
  async start(user: RequestUser, drasiId: string, title: string, groupKind: DrasiGroupKind): Promise<{ id: string }> {
    const drasi = await this.access.load(user, drasiId, 'write');
    const name = title.trim().slice(0, 120);
    if (!name) throw new BadRequestException('Δώσε έναν τίτλο — π.χ. «Αναχώρηση από Μέγαρα».');
    const groups = await this.groups(drasiId, groupKind);
    if (!groups.some((group) => group.members.length)) throw new BadRequestException('Δεν υπάρχουν ομάδες με μέλη αυτού του είδους.');

    const row = await this.prisma.drasiHeadcount.create({ data: { drasiId, title: name, groupKind, createdById: user.id }, select: { id: true } });
    const staff = await this.staff(drasiId);
    void this.notifications.notify(
      staff.filter((id) => id !== user.id),
      { kind: 'headcount', title: `Καταμέτρηση «${name}» — δράση «${drasi.title}»`, link: `/draseis/${drasiId}` },
    );
    return row;
  }

  /**
   * Μια ομάδα μετρήθηκε — από οποιοδήποτε στέλεχος. Κρατιέται η νεότερη μέτρηση
   * (ώρα της συσκευής), οπότε μια παλιά που φτάνει αργότερα από την ουρά δεν
   * σβήνει μια νεότερη. Όσοι «λείπουν» μετρούν μόνο αν είναι μέλη της ομάδας.
   */
  async check(user: RequestUser, drasiId: string, headcountId: string, groupId: string, absentIds: readonly string[], checkedAt: Date): Promise<void> {
    await this.access.load(user, drasiId, 'read');
    const headcount = await this.prisma.drasiHeadcount.findFirst({
      where: { id: headcountId, drasiId },
      select: { id: true, title: true, groupKind: true, createdById: true, completedAt: true, closedAt: true },
    });
    if (!headcount) throw new NotFoundException('Η καταμέτρηση δεν βρέθηκε.');
    const group = await this.prisma.drasiGroup.findFirst({
      where: { id: groupId, drasiId, kind: headcount.groupKind },
      select: { id: true, name: true, members: { select: { participantId: true } } },
    });
    if (!group) throw new NotFoundException('Η ομάδα δεν βρέθηκε.');

    const at = Number.isNaN(checkedAt.getTime()) || checkedAt.getTime() > Date.now() + CLOCK_SKEW_MS ? new Date() : checkedAt;
    const members = new Set(group.members.map((member) => member.participantId));
    const absent = [...new Set(absentIds)].filter((id) => members.has(id));
    const existing = await this.prisma.drasiHeadcountCheck.findUnique({
      where: { headcountId_groupId: { headcountId, groupId } },
      select: { checkedAt: true, absentIds: true },
    });
    if (!newerCheck(existing, at)) return;
    await this.prisma.drasiHeadcountCheck.upsert({
      where: { headcountId_groupId: { headcountId, groupId } },
      create: { headcountId, groupId, absentIds: absent, total: members.size, checkedById: user.id, checkedAt: at },
      update: { absentIds: absent, total: members.size, checkedById: user.id, checkedAt: at, receivedAt: new Date() },
    });

    // Οι ειδοποιήσεις μόνο όσο τρέχει, σε όποιον την ξεκίνησε: ποια ομάδα και πόσοι — όχι ποιοι.
    const starter = !headcount.closedAt && headcount.createdById !== user.id ? headcount.createdById : null;
    // Ίδιοι απόντες με πριν (ξαναμέτρησε κάποιος): όχι δεύτερη ειδοποίηση.
    const same = !!existing && existing.absentIds.length === absent.length && absent.every((id) => existing.absentIds.includes(id));
    if (starter && absent.length && !same) {
      void this.notifications.notify([starter], {
        kind: 'headcount',
        title: `Καταμέτρηση «${headcount.title}»: λείπ${absent.length === 1 ? 'ει 1' : `ουν ${absent.length}`} από «${group.name}»`,
        link: `/draseis/${drasiId}`,
      });
    }
    await this.markComplete(headcount, drasiId, user);
  }

  /** Μετρήθηκαν όλες οι ομάδες: μία ειδοποίηση σε όποιον την ξεκίνησε, με το σύνολο. */
  private async markComplete(
    headcount: { id: string; title: string; groupKind: DrasiGroupKind; createdById: string | null; completedAt: Date | null; closedAt: Date | null },
    drasiId: string,
    user: RequestUser,
  ): Promise<void> {
    if (headcount.completedAt || headcount.closedAt) return;
    const [groups, checks] = await Promise.all([
      this.groups(drasiId, headcount.groupKind),
      this.prisma.drasiHeadcountCheck.findMany({ where: { headcountId: headcount.id }, select: { groupId: true, absentIds: true } }),
    ]);
    const byGroup = new Map(checks.map((check) => [check.groupId, check]));
    const totals = headcountTotals(
      groups.map((group) => ({ members: group.members.map((member) => member.participant.id), check: byGroup.get(group.id) ?? null })),
    );
    if (totals.checkedGroups < totals.groups) return;
    const { count } = await this.prisma.drasiHeadcount.updateMany({ where: { id: headcount.id, completedAt: null }, data: { completedAt: new Date() } });
    if (!count || !headcount.createdById || headcount.createdById === user.id) return;
    void this.notifications.notify([headcount.createdById], {
      kind: 'headcount',
      title: totals.absent
        ? `Καταμέτρηση «${headcount.title}»: ${totals.present}/${totals.members} — λείπ${totals.absent === 1 ? 'ει 1' : `ουν ${totals.absent}`}`
        : `Καταμέτρηση «${headcount.title}»: όλοι εδώ (${totals.present}/${totals.members})`,
      link: `/draseis/${drasiId}`,
    });
  }

  /** Τέλος — ή ξανά ανοιχτή. */
  async close(user: RequestUser, drasiId: string, headcountId: string, closed: boolean): Promise<void> {
    await this.access.load(user, drasiId, 'write', { allowClosed: true });
    const { count } = await this.prisma.drasiHeadcount.updateMany({
      where: { id: headcountId, drasiId },
      data: { closedAt: closed ? new Date() : null },
    });
    if (!count) throw new NotFoundException('Η καταμέτρηση δεν βρέθηκε.');
  }

  /** Τα στελέχη της δράσης (δικά μας, φιλοξενούμενα, εξωτερικά, και όσοι έχουν ευθύνη). */
  private async staff(drasiId: string): Promise<string[]> {
    const [participants, roles] = await Promise.all([
      this.prisma.drasiParticipant.findMany({ where: { drasiId, kind: MemberKind.STELEXOS }, select: { userId: true } }),
      this.prisma.drasiRole.findMany({ where: { drasiId }, select: { userId: true } }),
    ]);
    return [...new Set([...participants, ...roles].map((row) => row.userId))];
  }
}
