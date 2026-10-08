import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind, MemberStatus } from '@prisma/client';
import {
  ACCOUNT_ROLE_LABEL,
  KLADOS_LABEL,
  KLADOS_META,
  MEMBER_KIND_LABEL,
  YLIKO_CATEGORY_LABEL,
  accountRoleLabel,
  isSuperAdmin,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { accessProfileOf, assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import type { UpdateKladosDto, UpdateMembershipDto } from './dto/topiko.dto';

@Injectable()
export class TopikoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Το προφίλ του συνδεδεμένου χρήστη — η πρώτη κλήση κάθε φόρτωσης της PWA. */
  async me(user: RequestUser) {
    const topiko = await this.prisma.topiko.findUnique({
      where: { id: user.topikoId },
      select: { id: true, name: true, location: true, timezone: true },
    });

    const period = await this.prisma.period.findFirst({
      where: { topikoId: user.topikoId, isCurrent: true },
      select: { id: true, label: true, syndromiAmount: true },
    });

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        roleLabel: accountRoleLabel(user.role, user.adminKlados),
        adminKlados: user.adminKlados,
        isSuperAdmin: isSuperAdmin(accessProfileOf(user)),
        /** Στελέχη: δικαιώματα ανά κλάδο — το UI τα δίνει στο ίδιο `can()` με το API. */
        grants: user.grants,
        /** Οι κλάδοι που βλέπει — τροφοδοτεί απευθείας το μενού. */
        kladoi: user.kladoi.map((type) => ({
          type,
          label: KLADOS_LABEL[type],
          color: KLADOS_META[type].color,
          icon: KLADOS_META[type].icon,
        })),
      },
      topiko,
      currentPeriod: period ? { ...period, syndromiAmount: Number(period.syndromiAmount) } : null,
      /** Στατικά λεξικά ετικετών — η PWA τα αποθηκεύει και δουλεύει offline. */
      labels: {
        klados: KLADOS_LABEL,
        accountRole: ACCOUNT_ROLE_LABEL,
        memberKind: MEMBER_KIND_LABEL,
        ylikoCategory: YLIKO_CATEGORY_LABEL,
      },
    };
  }

  /** Οι κλάδοι που βλέπει ο χρήστης, με πλήθη μελών. */
  async kladoi(user: RequestUser) {
    const scope = scopedKladoi(user);

    const rows = await this.prisma.klados.findMany({
      where: {
        topikoId: user.topikoId,
        ...(scope ? { type: { in: scope } } : {}),
      },
      include: {
        _count: { select: { yliko: true, draseis: true, syggentrwseis: true } },
        memberships: {
          where: { leftAt: null, user: { status: MemberStatus.ENERGO, archivedAt: null } },
          select: { kind: true, subUnit: true },
        },
        admins: {
          where: { accountRole: { not: null } },
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return rows
      .map((row) => {
        const type = row.type as KladosType;
        const stelexi = row.memberships.filter((m) => m.kind === MemberKind.STELEXOS).length;
        const subUnits = [...new Set(row.memberships.map((m) => m.subUnit).filter((s): s is string => !!s))];

        return {
          id: row.id,
          type,
          label: KLADOS_LABEL[type],
          name: row.name,
          color: KLADOS_META[type].color,
          icon: KLADOS_META[type].icon,
          subUnitLabel: KLADOS_META[type].subUnitLabel,
          minAge: row.minAge,
          maxAge: row.maxAge,
          counts: {
            meli: row.memberships.length - stelexi,
            stelexi,
            total: row.memberships.length,
            yliko: row._count.yliko,
            draseis: row._count.draseis,
            syggentrwseis: row._count.syggentrwseis,
          },
          subUnits: subUnits.sort((a, b) => a.localeCompare(b, 'el')),
          /** Ποιος διαχειρίζεται τον κλάδο — κενό σημαίνει ότι λείπει λογαριασμός. */
          admins: row.admins,
        };
      })
      .sort((a, b) => KLADOS_META[a.type].order - KLADOS_META[b.type].order);
  }

  async updateKlados(user: RequestUser, type: KladosType, dto: UpdateKladosDto) {
    assertKladosAccess(user, type);
    if (dto.minAge !== undefined && dto.maxAge !== undefined && dto.minAge > dto.maxAge) {
      throw new BadRequestException('Το κάτω ηλικιακό όριο δεν μπορεί να ξεπερνά το άνω.');
    }
    return this.prisma.klados.update({
      where: { topikoId_type: { topikoId: user.topikoId, type } },
      data: { name: dto.name, minAge: dto.minAge, maxAge: dto.maxAge },
    });
  }

  /**
   * Τοποθέτηση ατόμου σε κλάδο και υποομάδα.
   *
   * Αφορά **εγγραφές μητρώου**, όχι λογαριασμούς: το ποιος μπαίνει στην
   * εφαρμογή ορίζεται στο `AccountsModule` από τον υπερδιαχειριστή.
   */
  async setMembership(user: RequestUser, memberId: string, dto: UpdateMembershipDto) {
    assertKladosAccess(user, dto.kladosType);

    const [member, klados] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: memberId, topikoId: user.topikoId }, select: { id: true } }),
      this.prisma.klados.findUnique({
        where: { topikoId_type: { topikoId: user.topikoId, type: dto.kladosType } },
        select: { id: true },
      }),
    ]);
    if (!member) throw new NotFoundException('Το μέλος δεν βρέθηκε.');
    if (!klados) throw new NotFoundException('Ο κλάδος δεν βρέθηκε.');

    return this.prisma.membership.upsert({
      where: { userId_kladosId: { userId: memberId, kladosId: klados.id } },
      create: {
        userId: memberId,
        kladosId: klados.id,
        subUnit: dto.subUnit,
        kind: dto.kind ?? MemberKind.MELOS,
      },
      update: {
        subUnit: dto.subUnit,
        ...(dto.kind ? { kind: dto.kind } : {}),
        leftAt: dto.leftAt ?? null,
      },
    });
  }

  /**
   * Διαγνωστικό ρυθμίσεων: τι λείπει για να λειτουργήσει το Τοπικό.
   * Γλιτώνει μια ώρα ψαξίματος στο πρώτο στήσιμο.
   */
  async setupCheck(user: RequestUser) {
    const [kladoi, currentPeriods, yliko, goals, admins] = await this.prisma.$transaction([
      this.prisma.klados.findMany({
        where: { topikoId: user.topikoId },
        select: { type: true, admins: { where: { accountRole: { not: null } }, select: { id: true } } },
      }),
      this.prisma.period.count({ where: { topikoId: user.topikoId, isCurrent: true } }),
      this.prisma.yliko.count({ where: { topikoId: user.topikoId, archivedAt: null } }),
      this.prisma.proodosGoal.count({ where: { klados: { topikoId: user.topikoId } } }),
      this.prisma.user.count({ where: { topikoId: user.topikoId, accountRole: 'SUPER_ADMIN' } }),
    ]);

    const present = new Set(kladoi.map((k) => k.type));
    const missingKladoi = (Object.keys(KLADOS_META) as KladosType[]).filter((k) => !present.has(k));
    const kladoiWithoutAdmin = kladoi
      .filter((k) => k.admins.length === 0)
      .map((k) => KLADOS_LABEL[k.type as KladosType]);

    return {
      kladoi: { configured: kladoi.length, missing: missingKladoi },
      superAdmins: admins,
      kladoiWithoutAdmin,
      currentPeriod: currentPeriods > 0,
      ylikoItems: yliko,
      proodosGoals: goals,
      warnings: [
        ...(admins === 0 ? ['Δεν υπάρχει υπερδιαχειριστής — ορίστε `SUPER_ADMIN_EMAIL`.'] : []),
        ...(kladoiWithoutAdmin.length > 0
          ? [`Κλάδοι χωρίς διαχειριστή: ${kladoiWithoutAdmin.join(', ')}`]
          : []),
        ...(currentPeriods === 0 ? ['Δεν έχει οριστεί τρέχουσα περίοδος — οι συνδρομές δεν υπολογίζονται.'] : []),
        ...(missingKladoi.length > 0
          ? [`Λείπουν κλάδοι: ${missingKladoi.map((k) => KLADOS_LABEL[k]).join(', ')}`]
          : []),
        ...(goals === 0 ? ['Δεν έχουν καταχωρηθεί στόχοι προόδου.'] : []),
      ],
    };
  }
}
