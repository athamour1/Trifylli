import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountRole, CheckoutStatus, DrasiStatus, DrasiType, MemberKind, Prisma } from '@prisma/client';
import {
  can,
  KLADOS_LABEL,
  KLADOS_META,
  type EseoUnitInfo,
  type DrasiRoleKind,
  type KataskinosiStats,
  type MyDrasiView,
  type KladosType,
  type Paginated,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { accessProfileOf, assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';
import { EseoClient } from '../integrations/eseo.client';
import { DrasiAccessService } from './drasi-access.service';
import { defaultFeeKind } from './draseis-finance.service';
import type {
  AddParticipantsDto,
  CreateDrasiDto,
  QueryDraseisDto,
  SetDrasiKladoiDto,
  SetDrasiRolesDto,
  SetGuestTopikaDto,
  UpdateDrasiDto,
  UpdateParticipantDto,
} from './dto/drasi.dto';

const roleUserSelect = { id: true, firstName: true, lastName: true, phone: true } as const;

@Injectable()
export class DraseisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eseo: EseoClient,
    private readonly drasiAccess: DrasiAccessService,
  ) {}

  async list(user: RequestUser, query: QueryDraseisDto): Promise<Paginated<unknown>> {
    if (query.klados) assertKladosAccess(user, query.klados);

    const scope = scopedKladoi(user);
    const where: Prisma.DrasiWhereInput = {
      topikoId: user.topikoId,
      archivedAt: null,
      ...(query.type?.length ? { type: { in: query.type } } : {}),
      ...(query.klados
        ? {
            // «Δράσεις του κλάδου»: όσες διοργανώνει ΚΑΙ όσες συμμετέχει.
            OR: [{ klados: { type: query.klados } }, { kladoi: { some: { klados: { type: query.klados } } } }],
          }
        : {}),
      ...(query.upcoming ? { dateEnd: { gte: new Date() } } : {}),
      ...(query.from ? { dateEnd: { gte: query.from } } : {}),
      ...(query.to ? { dateStart: { lte: query.to } } : {}),
    };

    // Ο διαχειριστής κλάδου βλέπει: τις δράσεις που διοργανώνει ο κλάδος του, τις
    // δράσεις Τοπικού (kladosId = null) και όσες ο κλάδος του απλώς συμμετέχει.
    // Μπαίνει ως AND ώστε να μη συγχωνευτεί με το OR του φίλτρου `klados`.
    if (scope) {
      where.AND = [
        {
          OR: [
            { kladosId: null },
            { klados: { type: { in: scope } } },
            { kladoi: { some: { klados: { type: { in: scope } } } } },
          ],
        },
      ];
    }

    // Στελέχη: μόνο οι δράσεις όπου είναι στελέχη (ρόλος στο αρχηγείο ή στέλεχος
    // στους συμμετέχοντες) — ή όσες διαχειρίζονται ως Αρχηγοί κλάδου.
    if (user.role === AccountRole.STELEXOS) {
      const profile = accessProfileOf(user);
      const writesIn = user.kladoi.filter((k) => can(profile, 'drasi:write', k));
      (where.AND as Prisma.DrasiWhereInput[] | undefined)?.push({
        OR: [
          { roles: { some: { userId: user.id } } },
          { participants: { some: { userId: user.id, kind: MemberKind.STELEXOS } } },
          ...(writesIn.length
            ? [{ klados: { type: { in: writesIn } } }, { kladoi: { some: { klados: { type: { in: writesIn } } } } }]
            : []),
        ],
      });
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.drasi.count({ where }),
      this.prisma.drasi.findMany({
        where,
        orderBy: { dateStart: 'desc' },
        skip: query.skip,
        take: query.take,
        include: {
          klados: { select: { type: true } },
          kladoi: { select: { klados: { select: { type: true } } } },
          guestTopika: { select: { topikoName: true } },
          _count: { select: { participants: true, syggentrwseis: true, checkouts: true, roles: true } },
        },
      }),
    ]);

    return {
      items: items.map((d) => ({ ...d, kladoi: d.kladoi.map((k) => k.klados.type as KladosType) })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Οι δράσεις όπου ο χρήστης είναι στέλεχος (ρόλος στο αρχηγείο ή στέλεχος στους
   * συμμετέχοντες). Για τον εξωτερικό: μόνο οι ανοιχτές — αυτές που του δίνουν πρόσβαση.
   */
  async mine(user: RequestUser): Promise<MyDrasiView[]> {
    const rows = await this.prisma.drasi.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        ...(user.role === AccountRole.EXTERNAL ? { status: { not: DrasiStatus.KLEISTI } } : {}),
        OR: [{ roles: { some: { userId: user.id } } }, { participants: { some: { userId: user.id, kind: MemberKind.STELEXOS } } }],
      },
      orderBy: { dateStart: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        dateStart: true,
        dateEnd: true,
        klados: { select: { type: true } },
        roles: { where: { userId: user.id }, select: { kind: true } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      dateStart: d.dateStart.toISOString(),
      dateEnd: d.dateEnd.toISOString(),
      klados: (d.klados?.type as KladosType | undefined) ?? null,
      roles: d.roles.map((r) => r.kind as DrasiRoleKind),
    }));
  }

  async findOne(user: RequestUser, id: string) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: {
        klados: { select: { type: true, name: true } },
        kladoi: { select: { klados: { select: { type: true } } } },
        guestTopika: { orderBy: { topikoName: 'asc' } },
        roles: {
          include: { user: { select: roleUserSelect } },
          orderBy: [{ kind: 'asc' }, { user: { lastName: 'asc' } }],
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                kind: true,
                memberships: { where: { leftAt: null }, include: { klados: { select: { type: true } } } },
              },
            },
          },
          orderBy: [{ kind: 'desc' }, { user: { lastName: 'asc' } }],
        },
        syggentrwseis: {
          orderBy: { date: 'asc' },
          include: { klados: { select: { type: true } }, _count: { select: { timeline: true } } },
        },
        checkouts: {
          where: { status: { not: CheckoutStatus.AKYROSI } },
          include: { yliko: { select: { id: true, name: true, category: true, unit: true } } },
        },
        incidents: { orderBy: { occurredAt: 'desc' } },
      },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');

    const kladoi = drasi.kladoi.map((k) => k.klados.type as KladosType);
    if (user.drasiGrant?.drasiId !== id) this.assertReadAccess(user, drasi.klados?.type as KladosType | undefined, kladoi);

    // Τι μπορεί ο χρήστης εδώ — το UI δείχνει μόνο τις ενότητες του ρόλου του.
    const access = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : await this.drasiAccess.accessFor(user, id);
    return { ...drasi, kladoi, access };
  }

  async create(user: RequestUser, dto: CreateDrasiDto) {
    this.assertDates(dto.type, dto.dateStart, dto.dateEnd);

    const kladosId = dto.kladosType ? await this.kladosId(user, dto.kladosType) : null;

    return this.prisma.drasi.create({
      data: {
        topikoId: user.topikoId,
        kladosId,
        title: dto.title,
        type: dto.type,
        dateStart: dto.dateStart,
        dateEnd: dto.dateEnd,
        location: dto.location,
        description: dto.description,
        costPerPerson: dto.costPerPerson,
        costReduced: dto.costReduced,
        costStelexos: dto.costStelexos,
        transportCost: dto.transportCost,
        // Μονοήμερη ⇒ ποτέ σκηνές· αλλιώς ό,τι διάλεξε ο wizard (προεπιλογή: ναι).
        hasSkines: dto.type === 'MONOIMERI' ? false : (dto.hasSkines ?? true),
        status: dto.draft ? DrasiStatus.PROSXEDIO : DrasiStatus.ENERGI,
        // Ο διοργανωτής συμμετέχει εξ ορισμού — το «ποιοι έρχονται» ξεκινά από εδώ.
        ...(kladosId ? { kladoi: { create: { kladosId } } } : {}),
      },
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateDrasiDto) {
    const drasi = await this.assertAccess(user, id);
    const type = dto.type ?? drasi.type;
    const dateStart = dto.dateStart ?? drasi.dateStart;
    const dateEnd = dto.dateEnd ?? drasi.dateEnd;
    this.assertDates(type, dateStart, dateEnd);

    return this.prisma.drasi.update({ where: { id }, data: { ...dto } });
  }

  /**
   * Κλείσιμο / άνοιγμα ξανά. Ξεχωριστό από την επεξεργασία, γιατί το επιτρέπει
   * και ο **αρχηγός της δράσης** (ρόλος «Αρχηγός» στο αρχηγείο της), που μπορεί
   * να είναι απλό στέλεχος χωρίς δικαίωμα επεξεργασίας — εκτός από όσους
   * γράφουν ήδη στη δράση (διαχειριστής / Αρχηγός κλάδου, υπερδιαχειριστής).
   */
  async setClosed(user: RequestUser, id: string, closed: boolean) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } }, roles: { where: { kind: 'ARXIGOS', userId: user.id }, select: { id: true } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');

    const organiser = drasi.klados?.type as KladosType | undefined;
    const writes = can(accessProfileOf(user), 'drasi:write', organiser);
    if (!writes && drasi.roles.length === 0) {
      throw new ForbiddenException('Κλείνει ο αρχηγός της δράσης, ο διαχειριστής του κλάδου ή ο υπερδιαχειριστής.');
    }
    if (closed && drasi.status !== DrasiStatus.ENERGI) {
      throw new BadRequestException('Κλείνει μόνο ενεργή δράση.');
    }
    if (!closed && drasi.status !== DrasiStatus.KLEISTI) {
      throw new BadRequestException('Η δράση δεν είναι κλειστή.');
    }
    return this.prisma.drasi.update({
      where: { id },
      data: { status: closed ? DrasiStatus.KLEISTI : DrasiStatus.ENERGI },
      select: { id: true, status: true },
    });
  }

  async archive(user: RequestUser, id: string) {
    await this.assertAccess(user, id);
    return this.prisma.drasi.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  /**
   * Τι εμποδίζει την οριστική διαγραφή.
   *
   * Η διαγραφή σβήνει ό,τι κρέμεται από τη δράση. Τα περισσότερα είναι δικά της
   * (πρόγραμμα, ομάδες, έντυπα), αλλά τα χρήματα και το υλικό έχουν ζωή και
   * έξω από αυτήν: μια πληρωμή ή κίνηση ταμείου που χάνεται αλλάζει το υπόλοιπο
   * του κλάδου, και ένα αντικείμενο που δεν γύρισε χάνεται από την αποθήκη.
   * Εκεί η απάντηση είναι η αρχειοθέτηση.
   */
  async deletionBlockers(user: RequestUser, id: string): Promise<string[]> {
    await this.assertAccess(user, id);
    const [payments, ledger, treasury, outstanding] = await Promise.all([
      this.prisma.drasiPayment.count({ where: { participant: { drasiId: id } } }),
      this.prisma.drasiLedgerEntry.count({ where: { drasiId: id } }),
      this.prisma.treasuryEntry.count({ where: { drasiId: id } }),
      this.prisma.ylikoCheckout.count({ where: { drasiId: id, status: CheckoutStatus.PARALAVI } }),
    ]);
    const blockers: string[] = [];
    if (payments) blockers.push(`${payments} ${payments === 1 ? 'πληρωμή συμμετεχόντων' : 'πληρωμές συμμετεχόντων'}`);
    if (ledger) blockers.push(`${ledger} ${ledger === 1 ? 'κίνηση' : 'κινήσεις'} στο ταμείο της δράσης`);
    if (treasury) blockers.push(`${treasury} ${treasury === 1 ? 'κίνηση' : 'κινήσεις'} στο ταμείο του κλάδου/Τοπικού`);
    if (outstanding) blockers.push(`${outstanding} ${outstanding === 1 ? 'είδος υλικού' : 'είδη υλικού'} που δεν έχουν επιστραφεί`);
    return blockers;
  }

  /** Οριστική διαγραφή — μόνο χωρίς χρήματα και εκκρεμές υλικό, και με τον τίτλο ως επιβεβαίωση. */
  async remove(user: RequestUser, id: string, confirmTitle: string): Promise<{ id: string; title: string }> {
    const drasi = await this.assertAccess(user, id);
    if (confirmTitle.trim() !== drasi.title.trim()) {
      throw new BadRequestException('Ο τίτλος δεν ταιριάζει — η δράση δεν σβήστηκε.');
    }
    const blockers = await this.deletionBlockers(user, id);
    if (blockers.length) {
      throw new ConflictException(`Η δράση έχει ${blockers.join(', ')} — αρχειοθέτησέ την αντί να τη σβήσεις.`);
    }
    await this.prisma.drasi.delete({ where: { id } });
    return { id, title: drasi.title };
  }

  // ───────────────────────── Wizard: ποιοι έρχονται ─────────────────────────

  /**
   * Αντικαθιστά τους συμμετέχοντες κλάδους. Ο διοργανωτής μένει πάντα μέσα —
   * μια δράση Οδηγών χωρίς Οδηγούς δεν σημαίνει τίποτα.
   */
  async setKladoi(user: RequestUser, id: string, dto: SetDrasiKladoiDto): Promise<KladosType[]> {
    const drasi = await this.assertAccess(user, id);
    const wanted = new Set<KladosType>(dto.kladoi);
    if (drasi.klados?.type) wanted.add(drasi.klados.type as KladosType);

    const rows = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId, type: { in: [...wanted] } },
      select: { id: true, type: true },
    });
    const missing = [...wanted].filter((t) => !rows.some((r) => r.type === t));
    if (missing.length > 0) {
      throw new BadRequestException(`Δεν υπάρχει στο Τοπικό: ${missing.map((t) => KLADOS_LABEL[t]).join(', ')}.`);
    }

    await this.prisma.$transaction([
      this.prisma.drasiKlados.deleteMany({ where: { drasiId: id } }),
      this.prisma.drasiKlados.createMany({ data: rows.map((r) => ({ drasiId: id, kladosId: r.id })) }),
    ]);

    return rows
      .map((r) => r.type as KladosType)
      .sort((a, b) => KLADOS_META[a].order - KLADOS_META[b].order);
  }

  /** Αντικαθιστά τα φιλοξενούμενα Τοπικά. Ίδιος κωδικός δύο φορές ⇒ κρατιέται ο τελευταίος. */
  async setGuestTopika(user: RequestUser, id: string, dto: SetGuestTopikaDto) {
    await this.assertAccess(user, id);

    const byCode = new Map(dto.items.map((item) => [item.topikoCode, item]));
    await this.prisma.$transaction([
      this.prisma.drasiGuestTopiko.deleteMany({ where: { drasiId: id } }),
      this.prisma.drasiGuestTopiko.createMany({
        data: [...byCode.values()].map((item) => ({
          drasiId: id,
          topikoCode: item.topikoCode,
          topikoName: item.topikoName.trim(),
          kladoi: item.kladoi,
          contactName: item.contactName?.trim() || null,
          contactPhone: item.contactPhone?.trim() || null,
        })),
      }),
    ]);

    return this.prisma.drasiGuestTopiko.findMany({ where: { drasiId: id }, orderBy: { topikoName: 'asc' } });
  }

  /**
   * Ένα Τοπικό από το e-SEO, για να μην πληκτρολογεί κανείς «Ελευσίνα» με τρεις
   * ορθογραφίες. Το token μας βλέπει μονάδες μόνο με κωδικό (όχι λίστα), οπότε
   * η ροή είναι: κωδικός → όνομα → επιβεβαίωση.
   */
  async eseoTopiko(code: string): Promise<EseoUnitInfo> {
    const unit = await this.eseo.unit(code);
    if (!unit) throw new NotFoundException('Δεν βρέθηκε Τοπικό με αυτόν τον κωδικό στο e-SEO.');
    return { code: unit.code, name: unit.name, parentName: unit.parentName, type: unit.type };
  }

  // ───────────────────────── Wizard: αρχηγείο & υπηρεσίες ─────────────────────────

  /** Αντικαθιστά όλες τις ευθύνες. Τα ids ελέγχονται στο Τοπικό — όχι ευθύνες-φαντάσματα. */
  async setRoles(user: RequestUser, id: string, dto: SetDrasiRolesDto) {
    await this.assertAccess(user, id);

    const userIds = [...new Set(dto.roles.map((r) => r.userId))];
    const known = await this.prisma.user.findMany({
      where: { id: { in: userIds }, topikoId: user.topikoId, archivedAt: null },
      select: { id: true },
    });
    const knownIds = new Set(known.map((k) => k.id));
    const unknown = userIds.filter((uid) => !knownIds.has(uid));
    if (unknown.length > 0) throw new BadRequestException(`Άγνωστα στελέχη: ${unknown.join(', ')}`);

    // Ίδιο ζεύγος (ευθύνη, άτομο) δύο φορές: μία γραμμή, η σημείωση του τελευταίου.
    const unique = new Map(dto.roles.map((r) => [`${r.kind}:${r.userId}`, r]));

    await this.prisma.$transaction([
      this.prisma.drasiRole.deleteMany({ where: { drasiId: id } }),
      this.prisma.drasiRole.createMany({
        data: [...unique.values()].map((r) => ({
          drasiId: id,
          kind: r.kind,
          userId: r.userId,
          note: r.note?.trim() || null,
        })),
      }),
    ]);

    return this.prisma.drasiRole.findMany({
      where: { drasiId: id },
      include: { user: { select: roleUserSelect } },
      orderBy: [{ kind: 'asc' }, { user: { lastName: 'asc' } }],
    });
  }

  async addParticipants(user: RequestUser, id: string, dto: AddParticipantsDto) {
    const drasi = await this.assertAccess(user, id);

    // Τα ids ελέγχονται απέναντι στο Τοπικό: ένα λάθος id δεν πρέπει να
    // δημιουργεί συμμετοχή-φάντασμα.
    const valid = await this.prisma.user.findMany({
      where: { id: { in: dto.memberIds }, topikoId: user.topikoId, archivedAt: null },
      select: { id: true, kind: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const unknown = dto.memberIds.filter((mid) => !validIds.has(mid));
    if (unknown.length > 0) throw new BadRequestException(`Άγνωστα μέλη: ${unknown.join(', ')}`);

    await this.prisma.$transaction(
      valid.map((member) => {
        // Προεπιλογές κόστους από τη δράση: 40 παιδιά δεν ζητούν 40 φορές το ποσό.
        // Κενά ποσά ⇒ ακολουθούν τις Ρυθμίσεις της δράσης (βλ. `feeOf`).
        const feeKind = defaultFeeKind(dto.kind ?? member.kind);
        return this.prisma.drasiParticipant.upsert({
          where: { drasiId_userId: { drasiId: id, userId: member.id } },
          create: {
            drasiId: id,
            userId: member.id,
            kind: dto.kind ?? member.kind,
            confirmed: dto.confirmed ?? false,
            feeKind,
          },
          update: {
            kind: dto.kind ?? member.kind,
            ...(dto.confirmed !== undefined ? { confirmed: dto.confirmed } : {}),
          },
        });
      }),
    );

    return { added: valid.length };
  }

  async updateParticipant(user: RequestUser, id: string, memberId: string, dto: UpdateParticipantDto) {
    await this.assertAccess(user, id);
    return this.prisma.drasiParticipant.update({
      where: { drasiId_userId: { drasiId: id, userId: memberId } },
      data: { ...dto },
    });
  }

  async removeParticipant(user: RequestUser, id: string, memberId: string) {
    await this.assertAccess(user, id);
    return this.prisma.drasiParticipant.delete({
      where: { drasiId_userId: { drasiId: id, userId: memberId } },
    });
  }

  /**
   * Στοιχεία κατασκήνωσης ανά κλάδο: στελέχη, κατασκηνωτές και το υλικό που έχει
   * δεσμευτεί. Αυτό είναι το φύλλο που ζητά το Τοπικό πριν φύγει η κατασκήνωση.
   *
   * Ο κλάδος κάθε συμμετέχοντα προκύπτει από τα ενεργά του `Membership` — σε
   * δράση Τοπικού δεν υπάρχει ένας κλάδος για όλη τη δράση.
   */
  async kataskinosiStats(user: RequestUser, id: string): Promise<KataskinosiStats> {
    const drasi = await this.assertAccess(user, id);

    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id },
      include: {
        user: {
          select: {
            id: true,
            memberships: {
              where: { leftAt: null },
              select: { klados: { select: { type: true } } },
            },
          },
        },
      },
    });

    const checkouts = await this.prisma.ylikoCheckout.findMany({
      where: { drasiId: id, status: { not: CheckoutStatus.AKYROSI } },
      include: {
        yliko: { select: { id: true, name: true } },
        // Ο κλάδος της δέσμευσης, όχι του υλικού: μετράει ποιος το πήρε.
      },
    });

    const kladoi = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: { id: true, type: true },
    });
    const typeById = new Map(kladoi.map((k) => [k.id, k.type as KladosType]));

    const buckets = new Map<KladosType, KataskinosiStats['perKlados'][number]>();
    const bucket = (type: KladosType) => {
      const existing = buckets.get(type);
      if (existing) return existing;
      const created = {
        kladosType: type,
        stelexi: 0,
        kataskinotes: 0,
        total: 0,
        ylikoCheckedOut: [] as { ylikoId: string; name: string; qty: number }[],
      };
      buckets.set(type, created);
      return created;
    };

    for (const participant of participants) {
      // Συμμετέχοντας σε δύο κλάδους (στέλεχος που καλύπτει και άλλο κλάδο)
      // μετριέται στον πρώτο κατά σειρά ηλικίας, ώστε τα σύνολα να αθροίζουν.
      const types = participant.user.memberships
        .map((m) => m.klados.type as KladosType)
        .sort((a, b) => KLADOS_META[a].order - KLADOS_META[b].order);
      const type = types[0];
      if (!type) continue;

      const entry = bucket(type);
      if (participant.kind === MemberKind.MELOS) entry.kataskinotes += 1;
      else entry.stelexi += 1;
      entry.total += 1;
    }

    for (const checkout of checkouts) {
      const type = checkout.kladosId ? typeById.get(checkout.kladosId) : undefined;
      if (!type) continue; // Υλικό κεντρικής αποθήκης χωρίς κλάδο: εμφανίζεται στα σύνολα της δράσης.
      const entry = bucket(type);
      const existing = entry.ylikoCheckedOut.find((y) => y.ylikoId === checkout.ylikoId);
      if (existing) existing.qty += checkout.qty;
      else entry.ylikoCheckedOut.push({ ylikoId: checkout.ylikoId, name: checkout.yliko.name, qty: checkout.qty });
    }

    const perKlados = [...buckets.values()].sort(
      (a, b) => KLADOS_META[a.kladosType].order - KLADOS_META[b.kladosType].order,
    );

    return {
      drasiId: drasi.id,
      title: drasi.title,
      perKlados,
      totals: {
        stelexi: perKlados.reduce((sum, k) => sum + k.stelexi, 0),
        kataskinotes: perKlados.reduce((sum, k) => sum + k.kataskinotes, 0),
        total: perKlados.reduce((sum, k) => sum + k.total, 0),
      },
    };
  }

  /** Συγκεντρωτικά όλων των κατασκηνώσεων — η προβολή του Τοπικού. */
  async kataskinoseis(user: RequestUser) {
    const rows = await this.prisma.drasi.findMany({
      where: {
        topikoId: user.topikoId,
        type: DrasiType.KATASKINOSI,
        archivedAt: null,
        status: { not: DrasiStatus.PROSXEDIO },
      },
      orderBy: { dateStart: 'desc' },
      include: {
        klados: { select: { type: true } },
        _count: { select: { participants: true, checkouts: true, incidents: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      dateStart: row.dateStart,
      dateEnd: row.dateEnd,
      location: row.location,
      kladosType: (row.klados?.type as KladosType | undefined) ?? null,
      kladosLabel: row.klados?.type ? KLADOS_LABEL[row.klados.type as KladosType] : 'Τοπικό',
      participants: row._count.participants,
      checkouts: row._count.checkouts,
      incidents: row._count.incidents,
      days: Math.max(1, Math.ceil((row.dateEnd.getTime() - row.dateStart.getTime()) / 86_400_000)),
    }));
  }

  // ───────────────────────── Εσωτερικά ─────────────────────────

  /** Εγγραφή: μόνο ο διοργανωτής (ή ο υπερδιαχειριστής για δράσεις Τοπικού). */
  private async assertAccess(user: RequestUser, id: string) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');
    // Εγκεκριμένο από τον `DrasiPermGuard` με τους ρόλους της δράσης.
    if (user.drasiGrant?.drasiId === id) return drasi;
    assertKladosAccess(user, drasi.klados?.type as KladosType | undefined);
    return drasi;
  }

  /**
   * Ανάγνωση: και ο κλάδος που απλώς **συμμετέχει** βλέπει τη δράση — τα
   * στελέχη του θα είναι εκεί, χρειάζονται το πρόγραμμα και το αρχηγείο.
   */
  private assertReadAccess(user: RequestUser, organiser: KladosType | undefined, kladoi: KladosType[]): void {
    const scope = scopedKladoi(user);
    if (!scope || !organiser) return;
    if (scope.includes(organiser) || kladoi.some((k) => scope.includes(k))) return;
    throw new ForbiddenException(`Δεν έχετε πρόσβαση στα δεδομένα του κλάδου ${organiser}.`);
  }

  private assertDates(type: DrasiType, dateStart: Date, dateEnd: Date): void {
    if (dateStart > dateEnd) {
      throw new BadRequestException('Η έναρξη της δράσης πρέπει να προηγείται της λήξης.');
    }
    // Μια μονοήμερη που απλώνεται σε δύο μέρες είναι λάθος τύπος, όχι λάθος ημερομηνία.
    if (type === DrasiType.MONOIMERI && !sameDay(dateStart, dateEnd)) {
      throw new BadRequestException('Η μονοήμερη δράση πρέπει να ξεκινά και να τελειώνει την ίδια μέρα.');
    }
  }

  private async kladosId(user: RequestUser, type: KladosType): Promise<string> {
    assertKladosAccess(user, type);
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${type} δεν υπάρχει στο Τοπικό.`);
    return klados.id;
  }
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
