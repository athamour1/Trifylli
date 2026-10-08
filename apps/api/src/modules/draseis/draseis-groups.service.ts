import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiGroupKind, DrasiType, MemberKind, Prisma } from '@prisma/client';
import {
  DRASI_GROUP_KIND_LABEL,
  DrasiFeeKind,
  drasiHasSkines,
  type DrasiGroupMemberView,
  type DrasiGroupsView,
  type DrasiGroupView,
  type GuestMemberView,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import type { CreateGroupDto, CreateGuestDto, SetGroupMembersDto, UpdateGroupDto } from './dto/drasi-groups.dto';

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
          },
        },
      },
      include: { _count: { select: { participations: true } } },
    });
    return toGuestView(created);
  }

  // ───────────────────────── Ομάδες ─────────────────────────

  async groups(user: RequestUser, id: string): Promise<DrasiGroupsView> {
    const drasi = await this.access.load(user, id, 'read');
    const [groups, participants] = await Promise.all([
      this.prisma.drasiGroup.findMany({
        // Ό,τι δεν ισχύει για τη δράση κρύβεται (δεν σβήνεται) — από εδώ
        // τροφοδοτούνται και η ενότητα Ομάδες και το ντοσιέ.
        where: { drasiId: id, kind: { in: visibleKinds(drasi) } },
        orderBy: [{ kind: 'asc' }, { order: 'asc' }, { name: 'asc' }],
        include: {
          klados: { select: { type: true } },
          scheduleItem: { select: scheduleItemSelect },
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
        scheduleItem: toScheduleItemRef(g.scheduleItem),
        order: g.order,
        members: g.members.map((m) => toMemberView(m.participant)),
      })),
      participants: participants.map(toMemberView),
    };
  }

  async createGroup(user: RequestUser, id: string, dto: CreateGroupDto): Promise<DrasiGroupView> {
    const drasi = await this.access.load(user, id, 'write');
    this.assertKindAvailable(drasi, dto.kind);
    if (dto.scheduleItemId) await this.assertScheduleItem(id, dto.kind, dto.scheduleItemId, null);
    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;
    const last = await this.prisma.drasiGroup.findFirst({
      where: { drasiId: id, kind: dto.kind },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const group = await this.prisma.drasiGroup.create({
      data: {
        drasiId: id,
        kind: dto.kind,
        name: dto.name.trim(),
        kladosId,
        scheduleItemId: dto.scheduleItemId ?? null,
        order: (last?.order ?? -1) + 1,
      },
      include: { klados: { select: { type: true } }, scheduleItem: { select: scheduleItemSelect } },
    });
    return {
      id: group.id,
      kind: group.kind,
      name: group.name,
      kladosType: (group.klados?.type as KladosType | undefined) ?? null,
      leaderParticipantId: null,
      scheduleItem: toScheduleItemRef(group.scheduleItem),
      order: group.order,
      members: [],
    };
  }

  async updateGroup(user: RequestUser, id: string, groupId: string, dto: UpdateGroupDto) {
    await this.access.load(user, id, 'write');
    const group = await this.group(id, groupId);
    if (dto.leaderParticipantId) await this.assertLeader(id, group, dto.leaderParticipantId);
    if (dto.scheduleItemId) await this.assertScheduleItem(id, group.kind, dto.scheduleItemId, group.id);
    if (dto.scheduleItemId !== undefined && group.kind !== DrasiGroupKind.EPITROPI) {
      throw new BadRequestException('Μόνο οι επιτροπές συνδέονται με προγραμματικό.');
    }
    return this.prisma.drasiGroup.update({
      where: { id: group.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.leaderParticipantId !== undefined ? { leaderParticipantId: dto.leaderParticipantId } : {}),
        ...(dto.scheduleItemId !== undefined ? { scheduleItemId: dto.scheduleItemId } : {}),
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
      select: { id: true, kind: true },
    });
    if (valid.length !== ids.length) throw new BadRequestException('Κάποιος από τους συμμετέχοντες δεν ανήκει στη δράση.');
    // Οι ΟΕ είναι παιδιά· το στέλεχος μπαίνει ως υπεύθυνος, όχι ως μέλος.
    if (group.kind === DrasiGroupKind.OE && valid.some((p) => p.kind !== MemberKind.MELOS)) {
      throw new BadRequestException('Μέλη μιας ΟΕ είναι μόνο παιδιά — το στέλεχος ορίζεται ως υπεύθυνο.');
    }
    // Στις ΟΕ ο υπεύθυνος ΔΕΝ είναι μέλος, οπότε οι αλλαγές μελών δεν τον αγγίζουν.
    const leaderIsMember = group.kind !== DrasiGroupKind.OE;

    await this.prisma.$transaction([
      // Φεύγουν από οποιαδήποτε ομάδα του ίδιου είδους (και από αυτή).
      this.prisma.drasiGroupMember.deleteMany({ where: { kind: group.kind, participantId: { in: ids } } }),
      this.prisma.drasiGroupMember.deleteMany({ where: { groupId } }),
      this.prisma.drasiGroupMember.createMany({ data: ids.map((participantId) => ({ groupId, participantId, kind: group.kind })) }),
      // Ομαδάρχης που έφυγε από την ομάδα του (είτε από αυτήν, είτε από άλλη του
      // ίδιου είδους επειδή μεταφέρθηκε εδώ) παύει να είναι ομαδάρχης.
      ...(leaderIsMember && group.leaderParticipantId && !ids.includes(group.leaderParticipantId)
        ? [this.prisma.drasiGroup.update({ where: { id: groupId }, data: { leaderParticipantId: null } })]
        : []),
      ...(leaderIsMember
        ? [
            this.prisma.drasiGroup.updateMany({
              where: { drasiId: id, kind: group.kind, id: { not: groupId }, leaderParticipantId: { in: ids } },
              data: { leaderParticipantId: null },
            }),
          ]
        : []),
    ]);
    return { members: ids.length };
  }

  // ───────────────────────── Εσωτερικά ─────────────────────────

  /** Σκηνές μόνο όπου η δράση έχει (όχι μονοήμερες, όχι με τη ρύθμιση κλειστή). */
  private assertKindAvailable(drasi: { type: DrasiType; hasSkines: boolean; kladosId: string | null }, kind: DrasiGroupKind): void {
    if (kind === DrasiGroupKind.SKINI && !drasiHasSkines(drasi)) {
      throw new BadRequestException('Η δράση δεν έχει σκηνές — ενεργοποιήστε τις από τις Ρυθμίσεις.');
    }
    // Πεντάδες, φωλιές, ενωμοτίες, ΟΕ και επιτροπές ανήκουν στη ζωή ενός κλάδου·
    // μια δράση του Τοπικού έχει μόνο σκηνές.
    if (kind !== DrasiGroupKind.SKINI && !drasi.kladosId) {
      throw new BadRequestException('Οι δράσεις του Τοπικού δεν έχουν ομάδες κλάδου — μόνο σκηνές.');
    }
  }

  /**
   * Ποιος μπορεί να είναι υπεύθυνος: στις ΟΕ ένα στέλεχος της δράσης (όχι μέλος
   * της ομάδας)· στις πεντάδες/φωλιές/ενωμοτίες ένα παιδί-μέλος· επιτροπές και
   * σκηνές δεν έχουν.
   */
  private async assertLeader(drasiId: string, group: { id: string; kind: DrasiGroupKind }, participantId: string): Promise<void> {
    if (group.kind === DrasiGroupKind.SKINI || group.kind === DrasiGroupKind.EPITROPI) {
      throw new BadRequestException(`${DRASI_GROUP_KIND_LABEL[group.kind]}: δεν ορίζεται υπεύθυνος.`);
    }
    if (group.kind === DrasiGroupKind.OE) {
      const p = await this.prisma.drasiParticipant.findFirst({ where: { id: participantId, drasiId }, select: { kind: true } });
      if (!p || p.kind !== MemberKind.STELEXOS) throw new BadRequestException('Υπεύθυνος ΟΕ είναι στέλεχος της δράσης.');
      return;
    }
    const member = await this.prisma.drasiGroupMember.findUnique({
      where: { groupId_participantId: { groupId: group.id, participantId } },
    });
    if (!member) throw new BadRequestException('Ο ομαδάρχης πρέπει να είναι μέλος της ομάδας.');
  }

  /** Το προγραμματικό ανήκει στη δράση και δεν το έχει ήδη άλλη επιτροπή. */
  private async assertScheduleItem(drasiId: string, kind: DrasiGroupKind, scheduleItemId: string, selfId: string | null): Promise<void> {
    if (kind !== DrasiGroupKind.EPITROPI) throw new BadRequestException('Μόνο οι επιτροπές συνδέονται με προγραμματικό.');
    const item = await this.prisma.drasiScheduleItem.findFirst({
      where: { id: scheduleItemId, drasiId },
      select: { epitropi: { select: { id: true, name: true } } },
    });
    if (!item) throw new BadRequestException('Το προγραμματικό δεν ανήκει στη δράση.');
    if (item.epitropi && item.epitropi.id !== selfId) {
      throw new BadRequestException(`Το προγραμματικό το έχει ήδη η επιτροπή «${item.epitropi.name}».`);
    }
  }

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

const scheduleItemSelect = { id: true, title: true, date: true } as const;

function toScheduleItemRef(item: { id: string; title: string; date: Date } | null) {
  return item ? { id: item.id, title: item.title, date: item.date.toISOString().slice(0, 10) } : null;
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

/**
 * Ποια είδη ομάδων φαίνονται: χωρίς σκηνές στη δράση κρύβονται οι σκηνές, και
 * μια δράση του Τοπικού δεν έχει ομάδες κλάδου.
 */
function visibleKinds(drasi: { type: DrasiType; hasSkines: boolean; kladosId: string | null }): DrasiGroupKind[] {
  return Object.values(DrasiGroupKind).filter((kind) =>
    kind === DrasiGroupKind.SKINI ? drasiHasSkines(drasi) : drasi.kladosId !== null,
  );
}
