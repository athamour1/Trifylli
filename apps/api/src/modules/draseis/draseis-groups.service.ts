import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiGroupKind, MemberKind, Prisma } from '@prisma/client';
import {
  DRASI_GROUP_KIND_LABEL,
  DrasiFeeKind,
  type DrasiGroupMemberView,
  type DrasiGroupsView,
  type DrasiGroupView,
  type GuestMemberView,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import { defaultFee } from './draseis-finance.service';
import type { AutoGroupsDto, CreateGroupDto, CreateGuestDto, SetGroupMembersDto, UpdateGroupDto } from './dto/drasi-groups.dto';

const memberUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  kind: true,
  birthDate: true,
  memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } },
} as const;

/**
 * Φιλοξενούμενοι από άλλα Τοπικά (F3) και ομάδες — πεντάδες, φωλιές, ενωμοτίες,
 * σκηνές (F14).
 *
 * Οι φιλοξενούμενοι είναι κανονικές εγγραφές `User` με `guestTopikoCode`: έτσι
 * έντυπα, κόστη, ομάδες και φαρμακείο έχουν ΜΙΑ διαδρομή. Μένουν εκτός μητρώου,
 * συνδρομών και προόδου (τα ερωτήματα εκεί φιλτράρουν `guestTopikoCode: null`).
 */
@Injectable()
export class DraseisGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
  ) {}

  // ───────────────────────── Φιλοξενούμενοι ─────────────────────────

  /** Όλοι οι φιλοξενούμενοι του Τοπικού — για να μη γράφεται δύο φορές όποιος «ήρθε και πέρσι». */
  async guests(user: RequestUser, q?: string): Promise<GuestMemberView[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        guestTopikoCode: { not: null },
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { guestTopikoName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ guestTopikoName: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      include: { _count: { select: { participations: true } } },
      take: 300,
    });
    return rows.map(toGuestView);
  }

  /** Δημιουργεί τον φιλοξενούμενο και τον βάζει στη δράση, με τις προεπιλογές κόστους της. */
  async createGuest(user: RequestUser, id: string, dto: CreateGuestDto): Promise<GuestMemberView> {
    const drasi = await this.access.load(user, id, 'write');
    const kind = dto.kind ?? MemberKind.MELOS;
    const feeKind = kind === MemberKind.STELEXOS ? DrasiFeeKind.STELEXOS : DrasiFeeKind.PLIRIS;
    const feeAmount = defaultFee(drasi, feeKind);

    const created = await this.prisma.user.create({
      data: {
        topikoId: user.topikoId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        kind,
        birthDate: dto.birthDate,
        phone: dto.phone?.trim() || null,
        guestTopikoCode: dto.topikoCode,
        guestTopikoName: dto.topikoName.trim(),
        // Ο κηδεμόνας του φιλοξενούμενου: δεν υπάρχει εγγραφή e-SEO για να τον
        // δέσουμε, οπότε ζει στα ελεύθερα πεδία — όπως τα αντίστοιχα του e-SEO.
        eseoPayload: {
          guest: { guardianName: dto.guardianName?.trim() || null, guardianPhone: dto.guardianPhone?.trim() || null },
        },
        participations: {
          create: {
            drasiId: id,
            kind,
            feeKind,
            feeAmount: feeAmount === null ? null : new Prisma.Decimal(feeAmount),
            transportAmount: drasi.transportCost,
          },
        },
      },
      include: { _count: { select: { participations: true } } },
    });
    return toGuestView(created);
  }

  // ───────────────────────── Ομάδες ─────────────────────────

  async groups(user: RequestUser, id: string): Promise<DrasiGroupsView> {
    await this.access.load(user, id, 'read');
    const [groups, participants] = await Promise.all([
      this.prisma.drasiGroup.findMany({
        where: { drasiId: id },
        orderBy: [{ kind: 'asc' }, { order: 'asc' }, { name: 'asc' }],
        include: {
          klados: { select: { type: true } },
          members: {
            include: { participant: { include: { user: { select: memberUserSelect } } } },
            orderBy: { participant: { user: { lastName: 'asc' } } },
          },
        },
      }),
      this.prisma.drasiParticipant.findMany({
        where: { drasiId: id },
        include: { user: { select: memberUserSelect } },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      }),
    ]);

    return {
      groups: groups.map((g) => ({
        id: g.id,
        kind: g.kind,
        name: g.name,
        kladosType: (g.klados?.type as KladosType | undefined) ?? null,
        leaderParticipantId: g.leaderParticipantId,
        order: g.order,
        members: g.members.map((m) => toMemberView(m.participant)),
      })),
      participants: participants.map(toMemberView),
    };
  }

  async createGroup(user: RequestUser, id: string, dto: CreateGroupDto): Promise<DrasiGroupView> {
    await this.access.load(user, id, 'write');
    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;
    const last = await this.prisma.drasiGroup.findFirst({
      where: { drasiId: id, kind: dto.kind },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const group = await this.prisma.drasiGroup.create({
      data: { drasiId: id, kind: dto.kind, name: dto.name.trim(), kladosId, order: (last?.order ?? -1) + 1 },
      include: { klados: { select: { type: true } } },
    });
    return {
      id: group.id,
      kind: group.kind,
      name: group.name,
      kladosType: (group.klados?.type as KladosType | undefined) ?? null,
      leaderParticipantId: null,
      order: group.order,
      members: [],
    };
  }

  async updateGroup(user: RequestUser, id: string, groupId: string, dto: UpdateGroupDto) {
    await this.access.load(user, id, 'write');
    const group = await this.group(id, groupId);
    if (dto.leaderParticipantId) {
      const member = await this.prisma.drasiGroupMember.findUnique({
        where: { groupId_participantId: { groupId, participantId: dto.leaderParticipantId } },
      });
      if (!member) throw new BadRequestException('Ο ομαδάρχης πρέπει να είναι μέλος της ομάδας.');
    }
    return this.prisma.drasiGroup.update({
      where: { id: group.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.leaderParticipantId !== undefined ? { leaderParticipantId: dto.leaderParticipantId } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async deleteGroup(user: RequestUser, id: string, groupId: string) {
    await this.access.load(user, id, 'write');
    await this.group(id, groupId);
    await this.prisma.drasiGroup.delete({ where: { id: groupId } });
    return { deleted: true };
  }

  /**
   * Τα μέλη της ομάδας. Όποιος βρίσκεται σε άλλη ομάδα του ίδιου είδους
   * μεταφέρεται — το unique (participant, kind) στη βάση δεν αφήνει δεύτερη.
   */
  async setMembers(user: RequestUser, id: string, groupId: string, dto: SetGroupMembersDto) {
    await this.access.load(user, id, 'write');
    const group = await this.group(id, groupId);
    const ids = [...new Set(dto.participantIds)];

    const valid = await this.prisma.drasiParticipant.findMany({
      where: { id: { in: ids }, drasiId: id },
      select: { id: true },
    });
    if (valid.length !== ids.length) throw new BadRequestException('Κάποιος από τους συμμετέχοντες δεν ανήκει στη δράση.');

    await this.prisma.$transaction([
      // Φεύγουν από οποιαδήποτε ομάδα του ίδιου είδους (και από αυτή).
      this.prisma.drasiGroupMember.deleteMany({ where: { kind: group.kind, participantId: { in: ids } } }),
      this.prisma.drasiGroupMember.deleteMany({ where: { groupId } }),
      this.prisma.drasiGroupMember.createMany({ data: ids.map((participantId) => ({ groupId, participantId, kind: group.kind })) }),
      // Ομαδάρχης που έφυγε από την ομάδα του (είτε από αυτήν, είτε από άλλη του
      // ίδιου είδους επειδή μεταφέρθηκε εδώ) παύει να είναι ομαδάρχης.
      ...(group.leaderParticipantId && !ids.includes(group.leaderParticipantId)
        ? [this.prisma.drasiGroup.update({ where: { id: groupId }, data: { leaderParticipantId: null } })]
        : []),
      this.prisma.drasiGroup.updateMany({
        where: { drasiId: id, kind: group.kind, id: { not: groupId }, leaderParticipantId: { in: ids } },
        data: { leaderParticipantId: null },
      }),
    ]);
    return { members: ids.length };
  }

  /**
   * Αυτόματη κατανομή των αταξινόμητων: ταξινόμηση κατά ηλικία και μοίρασμα
   * κυκλικά, ώστε κάθε ομάδα να έχει μεγάλα και μικρά παιδιά. Αν υπάρχουν ήδη
   * ομάδες του είδους, γεμίζουν οι μικρότερες· αλλιώς φτιάχνονται `count`.
   */
  async autoGroups(user: RequestUser, id: string, dto: AutoGroupsDto) {
    await this.access.load(user, id, 'write');
    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;

    const participants = await this.prisma.drasiParticipant.findMany({
      where: {
        drasiId: id,
        kind: MemberKind.MELOS,
        groups: { none: { kind: dto.kind } },
        ...(kladosId
          ? {
              user: {
                OR: [
                  { memberships: { some: { kladosId, leftAt: null } } },
                  // Φιλοξενούμενοι χωρίς κλάδο στη βάση μας: μπαίνουν όπου τους βάλει το στέλεχος.
                  { guestTopikoCode: { not: null }, memberships: { none: {} } },
                ],
              },
            }
          : {}),
      },
      include: { user: { select: { birthDate: true } } },
    });
    if (participants.length === 0) return { created: 0, assigned: 0 };

    let groups = await this.prisma.drasiGroup.findMany({
      where: { drasiId: id, kind: dto.kind, ...(kladosId ? { kladosId } : {}) },
      include: { _count: { select: { members: true } } },
      orderBy: { order: 'asc' },
    });

    let created = 0;
    if (groups.length === 0) {
      const count = Math.max(1, Math.min(dto.count ?? Math.ceil(participants.length / 6), participants.length));
      const label = DRASI_GROUP_KIND_LABEL[dto.kind];
      for (let i = 1; i <= count; i += 1) {
        await this.prisma.drasiGroup.create({
          data: { drasiId: id, kind: dto.kind, name: `${label} ${i}`, kladosId, order: i - 1 },
        });
        created += 1;
      }
      groups = await this.prisma.drasiGroup.findMany({
        where: { drasiId: id, kind: dto.kind, ...(kladosId ? { kladosId } : {}) },
        include: { _count: { select: { members: true } } },
        orderBy: { order: 'asc' },
      });
    }

    // Μεγαλύτεροι πρώτοι, κυκλικά: η πρώτη «στροφή» δίνει σε κάθε ομάδα ένα μεγάλο παιδί.
    const sorted = [...participants].sort(
      (a, b) => (a.user.birthDate?.getTime() ?? 0) - (b.user.birthDate?.getTime() ?? 0),
    );
    const sizes = groups.map((g) => g._count.members);
    const data: { groupId: string; participantId: string; kind: DrasiGroupKind }[] = [];
    for (const p of sorted) {
      let target = 0;
      for (let i = 1; i < sizes.length; i += 1) if ((sizes[i] ?? 0) < (sizes[target] ?? 0)) target = i;
      sizes[target] = (sizes[target] ?? 0) + 1;
      data.push({ groupId: groups[target]!.id, participantId: p.id, kind: dto.kind });
    }
    await this.prisma.drasiGroupMember.createMany({ data, skipDuplicates: true });
    return { created, assigned: data.length };
  }

  // ───────────────────────── Εσωτερικά ─────────────────────────

  private async group(drasiId: string, groupId: string) {
    const group = await this.prisma.drasiGroup.findFirst({ where: { id: groupId, drasiId } });
    if (!group) throw new NotFoundException('Η ομάδα δεν βρέθηκε.');
    return group;
  }

  private async kladosId(user: RequestUser, type: KladosType): Promise<string> {
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${type} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}

function toMemberView(p: {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    kind: MemberKind;
    birthDate: Date | null;
    memberships: { klados: { type: string } }[];
  };
}): DrasiGroupMemberView {
  return {
    participantId: p.id,
    user: {
      id: p.user.id,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      kind: p.user.kind,
      birthDate: p.user.birthDate?.toISOString() ?? null,
      kladosType: (p.user.memberships[0]?.klados.type as KladosType | undefined) ?? null,
    },
  };
}

function toGuestView(u: {
  id: string;
  firstName: string;
  lastName: string;
  kind: MemberKind;
  birthDate: Date | null;
  phone: string | null;
  guestTopikoCode: string | null;
  guestTopikoName: string | null;
  eseoPayload: Prisma.JsonValue | null;
  _count: { participations: number };
}): GuestMemberView {
  const guest = ((u.eseoPayload as { guest?: { guardianName?: string | null; guardianPhone?: string | null } } | null)?.guest) ?? {};
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    kind: u.kind,
    birthDate: u.birthDate?.toISOString() ?? null,
    phone: u.phone,
    guestTopikoCode: u.guestTopikoCode ?? '',
    guestTopikoName: u.guestTopikoName ?? '',
    guardianName: guest.guardianName ?? null,
    guardianPhone: guest.guardianPhone ?? null,
    participations: u._count.participations,
  };
}
