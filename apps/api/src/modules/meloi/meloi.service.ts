import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind, MemberStatus, Prisma } from '@prisma/client';
import {
  deriveLeaderProfile,
  KLADOS_META,
  primaryKladosRole,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { scopedKladoi } from '../../common/util/klados-scope';
import { ageInYears, ageToBirthDateBounds } from './age';
import type { QueryMeloiDto } from './dto/meloi.dto';

@Injectable()
export class MeloiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Μητρώο μελών με σύνθετα φίλτρα.
   *
   * Δύο σημεία αξίζουν προσοχή:
   *  * Η εμβέλεια του χρήστη επιβάλλεται πάντα — ένα στέλεχος Πουλιών δεν βλέπει
   *    Οδηγούς, ακόμη κι αν ζητήσει ρητά `kladosType=ODIGOI`. Τα φίλτρα τέμνονται
   *    με την εμβέλεια αντί να την αντικαθιστούν.
   *  * Το υπόλοιπο οφειλής υπολογίζεται από τη συνδρομή της **τρέχουσας** περιόδου.
   */
  async list(user: RequestUser, query: QueryMeloiDto): Promise<Paginated<MemberSummary>> {
    const period = await this.currentPeriod(user.topikoId);
    const scoped = this.scopeKladoi(user, query.kladosType);
    const ageBounds = ageToBirthDateBounds(query.ageMin, query.ageMax);

    const where: Prisma.UserWhereInput = {
      topikoId: user.topikoId,
      archivedAt: null,
      status: { in: query.status?.length ? query.status : [MemberStatus.ENERGO] },
      ...(query.kind?.length ? { kind: { in: query.kind } } : {}),
      ...(query.idiotita?.length ? { idiotita: { in: query.idiotita } } : {}),
      ...(query.sos
        ? {
            licenses: {
              some: {
                status: 'ACTIVE',
                OR: [{ title: { contains: 'SOS', mode: 'insensitive' } }, { title: { contains: 'ΣΟΣ' } }],
              },
            },
          }
        : {}),
      ...(ageBounds ? { birthDate: ageBounds } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(scoped
        ? {
            memberships: {
              some: {
                leftAt: null,
                klados: { type: { in: scoped } },
                ...(query.subUnit ? { subUnit: query.subUnit } : {}),
              },
            },
          }
        : query.subUnit
          ? { memberships: { some: { leftAt: null, subUnit: query.subUnit } } }
          : {}),
      ...(period && (query.hasDebt || query.syndromiStatus?.length)
        ? {
            syndromes: {
              some: {
                periodId: period.id,
                ...(query.syndromiStatus?.length ? { status: { in: query.syndromiStatus } } : {}),
              },
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: query.skip,
        take: query.take,
        include: {
          memberships: {
            where: { leftAt: null },
            include: { klados: { select: { type: true } } },
          },
          syndromes: period ? { where: { periodId: period.id } } : false,
          licenses: { where: { status: 'ACTIVE' }, select: { title: true, status: true } },
        },
      }),
    ]);

    let items = rows.map((row) => toSummary(row));

    // Το `hasDebt` δεν εκφράζεται σε Prisma `where` (σύγκριση δύο κολονών της
    // ίδιας εγγραφής), γι' αυτό εφαρμόζεται μετά — με το `syndromiStatus`
    // φίλτρο παραπάνω να έχει ήδη περιορίσει δραστικά το σύνολο.
    if (query.hasDebt) items = items.filter((item) => item.balanceDue > 0);

    return { items, total: query.hasDebt ? items.length : total, page: query.page, pageSize: query.pageSize };
  }

  /** Καρτέλα μέλους: κλάδοι, παρουσίες, πρόοδος, οικονομικά. */
  async findOne(user: RequestUser, id: string) {
    const member = await this.prisma.user.findFirst({
      where: { id, topikoId: user.topikoId },
      include: {
        memberships: { include: { klados: { select: { type: true, name: true } } } },
        syndromes: { include: { period: true, payments: { orderBy: { paidAt: 'desc' } } } },
        guardians: true,
        licenses: { orderBy: [{ status: 'asc' }, { expirationDate: 'desc' }] },
        proodos: { include: { goal: true }, orderBy: { updatedAt: 'desc' } },
        participations: {
          include: { drasi: { select: { id: true, title: true, type: true, dateStart: true } } },
          orderBy: { drasi: { dateStart: 'desc' } },
          take: 20,
        },
      },
    });
    if (!member) throw new NotFoundException('Το μέλος δεν βρέθηκε.');

    this.assertVisible(user, member.memberships.map((m) => m.klados.type as KladosType));

    const attendance = await this.attendanceRate(id);

    return {
      ...member,
      age: ageInYears(member.birthDate),
      attendance,
    };
  }

  /** Ποσοστό παρουσίας στις συγκεντρώσεις — ο πιο χρήσιμος δείκτης για τα στελέχη. */
  async attendanceRate(userId: string): Promise<{ total: number; present: number; rate: number }> {
    const grouped = await this.prisma.parousia.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });

    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const present = grouped
      .filter((g) => g.status === 'PAROUSIA' || g.status === 'ARGOPORIA')
      .reduce((sum, g) => sum + g._count._all, 0);

    return { total, present, rate: total === 0 ? 0 : Math.round((present / total) * 100) };
  }

  /** Κατανομή μελών ανά κλάδο και ρόλο — τροφοδοτεί το dashboard Τοπικού. */
  async stats(user: RequestUser) {
    const kladoi = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: {
        type: true,
        memberships: {
          where: { leftAt: null, user: { status: MemberStatus.ENERGO, archivedAt: null } },
          select: { kind: true },
        },
      },
    });

    return kladoi
      .map((klados) => {
        const stelexi = klados.memberships.filter((m) => m.kind === MemberKind.STELEXOS).length;
        return {
          kladosType: klados.type as KladosType,
          total: klados.memberships.length,
          stelexi,
          meli: klados.memberships.length - stelexi,
        };
      })
      .sort((a, b) => KLADOS_META[a.kladosType].order - KLADOS_META[b.kladosType].order);
  }

  /** Τέμνει το αιτούμενο φίλτρο κλάδων με την εμβέλεια του χρήστη. */
  private scopeKladoi(user: RequestUser, requested?: KladosType[]): KladosType[] | null {
    const allowed = scopedKladoi(user);
    if (!allowed) return requested?.length ? requested : null;
    if (!requested?.length) return allowed;
    return requested.filter((k) => allowed.includes(k));
  }

  private assertVisible(user: RequestUser, memberKladoi: KladosType[]): void {
    const allowed = scopedKladoi(user);
    if (!allowed) return;
    // Μέλη χωρίς κλάδο (π.χ. νέα εγγραφή από e-SEO) είναι ορατά μόνο στον
    // υπερδιαχειριστή — κανένας διαχειριστής κλάδου δεν τα «κληρονομεί».
    if (!memberKladoi.some((k) => allowed.includes(k))) {
      throw new NotFoundException('Το μέλος δεν βρέθηκε.');
    }
  }

  private async currentPeriod(topikoId: string) {
    return this.prisma.period.findFirst({
      where: { topikoId, isCurrent: true },
      select: { id: true },
    });
  }
}

type MemberRow = Prisma.UserGetPayload<{
  include: {
    memberships: { include: { klados: { select: { type: true } } } };
    syndromes: true;
    licenses: { select: { title: true; status: true } };
  };
}>;

function toSummary(row: MemberRow | (Omit<MemberRow, 'syndromes'> & { syndromes?: false })): MemberSummary {
  const membership = row.memberships.find((m) => !m.leftAt) ?? row.memberships[0];
  const syndromes = Array.isArray(row.syndromes) ? row.syndromes : [];
  const balanceDue = syndromes.reduce(
    (sum, s) => sum + Math.max(0, Number(s.amountDue) - Number(s.amountPaid)),
    0,
  );

  // Θέση στελέχους από τα ενεργά πτυχία (κλάδος+ρόλος / θέση Τοπικού / ΣΟΣ).
  const leader = deriveLeaderProfile(row.licenses);
  const primary = primaryKladosRole(leader);

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    kind: row.kind,
    status: row.status,
    kladosType: (membership?.klados.type as KladosType | undefined) ?? null,
    idiotita: row.idiotita ?? null,
    subUnit: membership?.subUnit ?? null,
    leaderTitle: primary?.title ?? leader.topikoTitles[0] ?? null,
    isSOS: leader.isSOS,
    birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
    balanceDue: Number(balanceDue.toFixed(2)),
  };
}
