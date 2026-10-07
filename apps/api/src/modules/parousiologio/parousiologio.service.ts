import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus, ParousiaStatus } from '@prisma/client';
import { PAROUSIA_LABEL, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess } from '../../common/util/klados-scope';
import { mergeParousies } from './merge';
import type { SubmitParousiologioDto } from './dto/parousiologio.dto';

@Injectable()
export class ParousiologioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Το φύλλο παρουσιολογίου μιας συγκέντρωσης: όλα τα ενεργά μέλη του κλάδου,
   * με την υπάρχουσα καταχώρηση όπου υπάρχει. Επιστρέφεται πλήρες ώστε η PWA να
   * το αποθηκεύσει τοπικά και να λειτουργεί χωρίς δίκτυο.
   */
  async sheet(user: RequestUser, syggentrwshId: string) {
    const syggentrwsh = await this.loadSyggentrwsh(user, syggentrwshId);

    // Ημέρα δράσης: το παρουσιολόγιο είναι οι συμμετέχοντες της δράσης (και οι
    // φιλοξενούμενοι), όχι το μητρώο του κλάδου.
    const members = await this.prisma.user.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        ...(syggentrwsh.drasiId
          ? { participations: { some: { drasiId: syggentrwsh.drasiId } } }
          : { status: MemberStatus.ENERGO, memberships: { some: { kladosId: syggentrwsh.kladosId ?? '', leftAt: null } } }),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        kind: true,
        memberships: {
          where: { kladosId: syggentrwsh.kladosId ?? '', leftAt: null },
          select: { subUnit: true, kind: true },
        },
      },
    });

    const existing = await this.prisma.parousia.findMany({
      where: { syggentrwshId },
      select: { userId: true, status: true, note: true, recordedAt: true },
    });
    const byUser = new Map(existing.map((e) => [e.userId, e]));

    return {
      syggentrwsh: {
        id: syggentrwsh.id,
        date: syggentrwsh.date,
        title: syggentrwsh.title,
        kladosType: (syggentrwsh.klados?.type as KladosType | undefined) ?? null,
      },
      entries: members.map((member) => {
        const recorded = byUser.get(member.id);
        return {
          memberId: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          kind: member.memberships[0]?.kind ?? member.kind,
          subUnit: member.memberships[0]?.subUnit ?? null,
          status: recorded?.status ?? null,
          note: recorded?.note ?? null,
          recordedAt: recorded?.recordedAt ?? null,
        };
      }),
      completed: existing.length > 0,
    };
  }

  /**
   * Υποβολή παρουσιολογίου. Ίδιο endpoint για online και για την offline ουρά:
   * ο `recordedAt` του payload αποφασίζει, όχι η ώρα άφιξης.
   */
  async submit(user: RequestUser, syggentrwshId: string, dto: SubmitParousiologioDto) {
    const syggentrwsh = await this.loadSyggentrwsh(user, syggentrwshId);

    if (dto.recordedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('Το `recordedAt` είναι στο μέλλον — ελέγξτε το ρολόι της συσκευής.');
    }

    // Επιτρέπουμε μόνο μέλη του κλάδου (ή, σε ημέρα δράσης, συμμετέχοντες της
    // δράσης): ένα λάθος id από την offline ουρά δεν πρέπει να δημιουργεί
    // παρουσία σε άλλον κλάδο.
    const validIds = new Set(
      syggentrwsh.drasiId
        ? (await this.prisma.drasiParticipant.findMany({ where: { drasiId: syggentrwsh.drasiId }, select: { userId: true } })).map((p) => p.userId)
        : (await this.prisma.membership.findMany({ where: { kladosId: syggentrwsh.kladosId ?? '', leftAt: null }, select: { userId: true } })).map((m) => m.userId),
    );

    const unknown = dto.entries.filter((e) => !validIds.has(e.memberId)).map((e) => e.memberId);
    if (unknown.length > 0) {
      throw new BadRequestException(`Μέλη εκτός κλάδου: ${unknown.join(', ')}`);
    }

    const existing = await this.prisma.parousia.findMany({
      where: { syggentrwshId },
      select: { userId: true, status: true, note: true, recordedAt: true },
    });

    const { toWrite, stale } = mergeParousies(
      existing,
      dto.entries.map((e) => ({
        userId: e.memberId,
        status: e.status,
        note: e.note ?? null,
        recordedAt: dto.recordedAt,
      })),
    );

    await this.prisma.$transaction(
      toWrite.map((entry) =>
        this.prisma.parousia.upsert({
          where: { syggentrwshId_userId: { syggentrwshId, userId: entry.userId } },
          create: {
            syggentrwshId,
            userId: entry.userId,
            status: entry.status as ParousiaStatus,
            note: entry.note ?? undefined,
            recordedAt: entry.recordedAt,
          },
          update: {
            status: entry.status as ParousiaStatus,
            note: entry.note ?? undefined,
            recordedAt: entry.recordedAt,
          },
        }),
      ),
    );

    return {
      written: toWrite.length,
      /** Ό,τι απορρίφθηκε ως παλαιότερο — η PWA το εμφανίζει ως «δεν εφαρμόστηκε». */
      stale,
    };
  }

  /**
   * Στατιστικά παρουσίας για έναν κλάδο σε διάστημα. Δείχνει ποια μέλη χάνονται
   * — το πρακτικό ερώτημα που θέτουν τα στελέχη στο συμβούλιο ομάδας.
   */
  async report(user: RequestUser, klados: KladosType, from?: Date, to?: Date) {
    assertKladosAccess(user, klados);

    const kladosRow = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type: klados } },
      select: { id: true },
    });
    if (!kladosRow) throw new NotFoundException('Ο κλάδος δεν βρέθηκε.');

    const syggentrwseis = await this.prisma.syggentrwsh.findMany({
      where: {
        kladosId: kladosRow.id,
        archivedAt: null,
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      select: {
        id: true,
        date: true,
        parousies: {
          select: {
            status: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    const perMember = new Map<
      string,
      { memberId: string; name: string; counts: Record<ParousiaStatus, number>; total: number }
    >();

    for (const s of syggentrwseis) {
      for (const p of s.parousies) {
        const key = p.user.id;
        const entry =
          perMember.get(key) ??
          {
            memberId: key,
            name: `${p.user.lastName} ${p.user.firstName}`.trim(),
            counts: {
              PAROUSIA: 0,
              APOUSIA: 0,
              DIKAIOLOGIMENI: 0,
              ARGOPORIA: 0,
            } as Record<ParousiaStatus, number>,
            total: 0,
          };
        entry.counts[p.status] += 1;
        entry.total += 1;
        perMember.set(key, entry);
      }
    }

    const members = [...perMember.values()]
      .map((entry) => {
        const present = entry.counts.PAROUSIA + entry.counts.ARGOPORIA;
        return {
          ...entry,
          labels: Object.fromEntries(
            (Object.keys(entry.counts) as ParousiaStatus[]).map((k) => [
              PAROUSIA_LABEL[k],
              entry.counts[k],
            ]),
          ),
          rate: entry.total === 0 ? 0 : Math.round((present / entry.total) * 100),
        };
      })
      .sort((a, b) => a.rate - b.rate);

    return {
      kladosType: klados,
      syggentrwseis: syggentrwseis.length,
      members,
    };
  }

  private async loadSyggentrwsh(user: RequestUser, id: string) {
    const syggentrwsh = await this.prisma.syggentrwsh.findFirst({
      where: { id, OR: [{ klados: { topikoId: user.topikoId } }, { drasi: { topikoId: user.topikoId } }] },
      include: { klados: { select: { type: true } } },
    });
    if (!syggentrwsh) throw new NotFoundException('Η συγκέντρωση δεν βρέθηκε.');

    const kladosType = (syggentrwsh.klados?.type as KladosType | undefined) ?? null;
    assertKladosAccess(user, kladosType);
    if (syggentrwsh.archivedAt) throw new ForbiddenException('Η συγκέντρωση έχει αρχειοθετηθεί.');

    return syggentrwsh;
  }
}
