import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountRole, KLADOS_LABEL, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertScopeAccess } from '../../common/util/klados-scope';
import { OuchtrackerClient } from '../integrations/ouchtracker.client';
import type { LendPharmacyDto, LinkPharmacyDto } from './dto/pharmacy.dto';

/**
 * Φαρμακεία — τα Kits του OuchTracker, ιδωμένα ανά κλάδο ή Τοπικό.
 *
 * Το OuchTracker είναι η πηγή αλήθειας για το περιεχόμενο· εδώ κρατάμε μόνο
 * την ιδιοκτησία (ποιος κλάδος) και τον δανεισμό. Ο δανεισμός κάνει **φυσική
 * ανάθεση** στο OuchTracker (το Kit ανατίθεται στα άτομα του κλάδου που
 * δανείζεται) και η επιστροφή επαναφέρει τους προηγούμενους assignees.
 */
@Injectable()
export class PharmaciesService {
  private readonly logger = new Logger(PharmaciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ouchtracker: OuchtrackerClient,
  ) {}

  /** Τα φαρμακεία που βλέπει μια εμβέλεια: τα δικά της + όσα της έχουν δανειστεί. */
  async list(user: RequestUser, kladosType?: KladosType) {
    assertScopeAccess(user, 'farmakeio:read', kladosType);
    const kladosId = await this.resolveKladosId(user, kladosType);
    const scopeKladosId = kladosType ? kladosId : null;

    const loanInclude = {
      where: { returnedAt: null },
      include: { toKlados: { select: { type: true } } },
      orderBy: { borrowedAt: 'desc' as const },
      take: 1,
    };

    const own = await this.prisma.pharmacyKit.findMany({
      where: { topikoId: user.topikoId, kladosId: scopeKladosId, archivedAt: null },
      include: { klados: { select: { type: true } }, loans: loanInclude },
      orderBy: { name: 'asc' },
    });

    // Kits άλλης εμβέλειας που αυτή τη στιγμή είναι δανεισμένα σε εμάς.
    const borrowedRaw = await this.prisma.pharmacyKit.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        loans: { some: { returnedAt: null, toKladosId: scopeKladosId } },
      },
      include: { klados: { select: { type: true } }, loans: loanInclude },
      orderBy: { name: 'asc' },
    });
    const borrowed = borrowedRaw.filter((k) => k.kladosId !== scopeKladosId);

    const configured = this.ouchtracker.configured;
    return {
      configured,
      kits: [
        ...own.map((k) => this.toView(k, 'OWNED')),
        ...borrowed.map((k) => this.toView(k, 'BORROWED')),
      ],
    };
  }

  /** Τα Kits του OuchTracker που δεν έχουν συνδεθεί ακόμη ως φαρμακείο. */
  async availableKits(user: RequestUser, kladosType?: KladosType) {
    assertScopeAccess(user, 'farmakeio:write', kladosType);
    const [kits, linked] = await Promise.all([
      this.ouchtracker.kits(),
      this.prisma.pharmacyKit.findMany({
        where: { topikoId: user.topikoId, archivedAt: null },
        select: { ouchtrackerKitId: true },
      }),
    ]);
    const taken = new Set(linked.map((l) => l.ouchtrackerKitId));
    return kits.filter((k) => !taken.has(k.id));
  }

  /** Σύνδεση ενός Kit του OuchTracker ως φαρμακείο μιας εμβέλειας. */
  async link(user: RequestUser, dto: LinkPharmacyDto) {
    assertScopeAccess(user, 'farmakeio:write', dto.kladosType);
    const kladosId = await this.resolveKladosId(user, dto.kladosType);

    const existing = await this.prisma.pharmacyKit.findUnique({
      where: { topikoId_ouchtrackerKitId: { topikoId: user.topikoId, ouchtrackerKitId: dto.ouchtrackerKitId } },
      select: { id: true, archivedAt: true },
    });
    if (existing && !existing.archivedAt) {
      throw new BadRequestException('Αυτό το Kit έχει ήδη συνδεθεί ως φαρμακείο.');
    }

    const kit = existing
      ? await this.prisma.pharmacyKit.update({
          where: { id: existing.id },
          data: { name: dto.name, kladosId: dto.kladosType ? kladosId : null, archivedAt: null },
          include: { klados: { select: { type: true } }, loans: { where: { returnedAt: null }, include: { toKlados: { select: { type: true } } }, take: 1 } },
        })
      : await this.prisma.pharmacyKit.create({
          data: {
            topikoId: user.topikoId,
            kladosId: dto.kladosType ? kladosId : null,
            name: dto.name,
            ouchtrackerKitId: dto.ouchtrackerKitId,
          },
          include: { klados: { select: { type: true } }, loans: { where: { returnedAt: null }, include: { toKlados: { select: { type: true } } }, take: 1 } },
        });

    // Ανάθεση στα άτομα της εμβέλειας στο OuchTracker: έτσι το φαρμακείο το
    // βλέπουν **μόνο** αυτοί (ο CHECKER βλέπει μόνο ό,τι του έχει ανατεθεί) και
    // όχι όλοι οι κλάδοι. Best-effort — αν το OuchTracker είναι προσωρινά
    // απρόσιτο, το φαρμακείο συνδέεται ούτως ή άλλως και το φτιάχνει ο
    // «Συγχρονισμός προσβάσεων».
    if (this.ouchtracker.configured) {
      await this.assignScopePeople(user, kit.ouchtrackerKitId, dto.kladosType).catch((e) =>
        this.logger.warn(
          `Αποτυχία ανάθεσης προσβάσεων φαρμακείου ${kit.id}: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }
    return this.toView(kit, 'OWNED');
  }

  /**
   * Συγχρονισμός προσβάσεων: αναθέτει ξανά όλα τα (μη δανεισμένα) φαρμακεία μιας
   * εμβέλειας στους τρέχοντες ανθρώπους της. Χρήσιμο όταν συνδεθεί νέο στέλεχος
   * στο OuchTracker — τότε εμφανίζονται και σ' εκείνον τα φαρμακεία του κλάδου.
   */
  async syncAccess(user: RequestUser, kladosType?: KladosType) {
    assertScopeAccess(user, 'farmakeio:write', kladosType);
    const kladosId = await this.resolveKladosId(user, kladosType);
    const scopeKladosId = kladosType ? kladosId : null;

    const owned = await this.prisma.pharmacyKit.findMany({
      where: { topikoId: user.topikoId, kladosId: scopeKladosId, archivedAt: null },
      include: { loans: { where: { returnedAt: null }, select: { id: true } } },
    });
    // Kits άλλης εμβέλειας που είναι τώρα δανεισμένα σε αυτή — ανατίθενται κι αυτά
    // στα άτομά της, ώστε να μπορεί να τα δει ο κλάδος που τα δανείστηκε.
    const borrowed = await this.prisma.pharmacyKit.findMany({
      where: {
        topikoId: user.topikoId,
        archivedAt: null,
        loans: { some: { returnedAt: null, toKladosId: scopeKladosId } },
      },
      select: { id: true, ouchtrackerKitId: true, kladosId: true },
    });

    const targetUserIds = await this.resolveOuchUserIds(user.topikoId, kladosType);
    let synced = 0;
    let skipped = 0;
    for (const kit of owned) {
      if (kit.loans.length > 0) {
        // Δανεισμένο προς τα έξω — η ανάθεση ανήκει στον κλάδο που το δανείστηκε.
        skipped += 1;
        continue;
      }
      await this.ouchtracker.assignKit(kit.ouchtrackerKitId, targetUserIds);
      synced += 1;
    }
    for (const kit of borrowed) {
      if (kit.kladosId === scopeKladosId) continue; // δικό της — καλύφθηκε στο owned
      await this.ouchtracker.assignKit(kit.ouchtrackerKitId, targetUserIds);
      synced += 1;
    }
    return { synced, skipped, people: targetUserIds.length };
  }

  private async assignScopePeople(user: RequestUser, ouchtrackerKitId: string, kladosType?: KladosType) {
    const ids = await this.resolveOuchUserIds(user.topikoId, kladosType);
    await this.ouchtracker.assignKit(ouchtrackerKitId, ids);
  }

  /** Αποσύνδεση φαρμακείου (αρχειοθέτηση). Δεν επιτρέπεται αν είναι δανεισμένο. */
  async unlink(user: RequestUser, id: string) {
    const kit = await this.findOwned(user, id);
    const active = await this.prisma.kitLoan.findFirst({ where: { pharmacyKitId: id, returnedAt: null } });
    if (active) throw new BadRequestException('Το φαρμακείο είναι δανεισμένο — επιστρέψτε το πρώτα.');
    await this.prisma.pharmacyKit.update({ where: { id: kit.id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }

  /** Δανεισμός φαρμακείου σε άλλον κλάδο ή στο Τοπικό (με φυσική ανάθεση). */
  async lend(user: RequestUser, id: string, dto: LendPharmacyDto) {
    const kit = await this.findOwned(user, id);

    const toKladosId = await this.resolveKladosId(user, dto.toKladosType);
    const targetKladosId = dto.toKladosType ? toKladosId : null;
    if (targetKladosId === kit.kladosId) {
      throw new BadRequestException('Το φαρμακείο ανήκει ήδη σε αυτή την εμβέλεια.');
    }

    const active = await this.prisma.kitLoan.findFirst({ where: { pharmacyKitId: id, returnedAt: null } });
    if (active) throw new BadRequestException('Το φαρμακείο είναι ήδη δανεισμένο.');

    // Φυσική ανάθεση στο OuchTracker: κρατάμε στιγμιότυπο των τρεχόντων
    // assignees για την επιστροφή, μετά αναθέτουμε στα άτομα που δανείζονται.
    const previous = await this.ouchtracker.getKitAssigneeIds(kit.ouchtrackerKitId);
    const targetUserIds = await this.resolveOuchUserIds(user.topikoId, dto.toKladosType);
    await this.ouchtracker.assignKit(kit.ouchtrackerKitId, targetUserIds);
    if (targetUserIds.length === 0) {
      this.logger.warn(
        `Δανεισμός φαρμακείου ${kit.id}: κανένα άτομο της εμβέλειας δεν έχει λογαριασμό OuchTracker — το Kit έμεινε χωρίς ανάθεση.`,
      );
    }

    await this.prisma.kitLoan.create({
      data: {
        pharmacyKitId: kit.id,
        toKladosId: targetKladosId,
        dueAt: dto.dueAt ?? null,
        note: dto.note ?? null,
        previousAssigneeIds: previous,
        createdById: user.id,
      },
    });

    return this.getView(user, kit.id);
  }

  /** Επιστροφή δανεισμένου φαρμακείου — επαναφέρει τους αρχικούς assignees. */
  async returnKit(user: RequestUser, id: string) {
    const kit = await this.findOwned(user, id);
    const active = await this.prisma.kitLoan.findFirst({
      where: { pharmacyKitId: id, returnedAt: null },
      orderBy: { borrowedAt: 'desc' },
    });
    if (!active) throw new BadRequestException('Το φαρμακείο δεν είναι δανεισμένο.');

    await this.ouchtracker.assignKit(kit.ouchtrackerKitId, active.previousAssigneeIds);
    await this.prisma.kitLoan.update({ where: { id: active.id }, data: { returnedAt: new Date() } });
    return this.getView(user, kit.id);
  }

  /**
   * Αυτόματη επιστροφή ληγμένων δανεισμών. Κάθε αποτυχία απομονώνεται ώστε ένα
   * μη προσβάσιμο OuchTracker να μην μπλοκάρει τις υπόλοιπες επιστροφές.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoReturnOverdue() {
    const due = await this.prisma.kitLoan.findMany({
      where: { returnedAt: null, dueAt: { not: null, lt: new Date() } },
      include: { kit: { select: { id: true, ouchtrackerKitId: true } } },
    });
    if (due.length === 0) return;

    for (const loan of due) {
      try {
        await this.ouchtracker.assignKit(loan.kit.ouchtrackerKitId, loan.previousAssigneeIds);
        await this.prisma.kitLoan.update({ where: { id: loan.id }, data: { returnedAt: new Date() } });
        this.logger.log(`Αυτόματη επιστροφή ληγμένου δανεισμού φαρμακείου ${loan.kit.id}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Αποτυχία αυτόματης επιστροφής δανεισμού ${loan.id}: ${message}`);
      }
    }
  }

  /**
   * Αυτόματος συγχρονισμός προσβάσεων: κάθε φαρμακείο ανατίθεται στα τρέχοντα
   * άτομα της εμβέλειας που το κατέχει (ή το δανείστηκε). Έτσι, όταν αλλάξει
   * κάποιο στέλεχος ή συνδεθεί νέο, οι προσβάσεις ενημερώνονται μόνες τους — ο
   * χειροκίνητος «Συγχρονισμός» μένει μόνο για άμεση ενημέρωση. Ανατίθεται ξανά
   * μόνο όταν όντως διαφέρει, για να μη χτυπάμε τζάμπα το OuchTracker.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileAssignees() {
    if (!this.ouchtracker.configured) return;

    const kits = await this.prisma.pharmacyKit.findMany({
      where: { archivedAt: null },
      include: {
        klados: { select: { type: true } },
        loans: {
          where: { returnedAt: null },
          include: { toKlados: { select: { type: true } } },
          take: 1,
        },
      },
    });

    for (const kit of kits) {
      try {
        const loan = kit.loans[0];
        // Δανεισμένο → ο κλάδος που το δανείστηκε· αλλιώς → ο ιδιοκτήτης.
        const scopeKladosType = loan
          ? (loan.toKlados?.type ?? undefined)
          : (kit.klados?.type ?? undefined);
        const target = await this.resolveOuchUserIds(kit.topikoId, scopeKladosType);
        const current = await this.ouchtracker.getKitAssigneeIds(kit.ouchtrackerKitId);
        const currentSet = new Set(current);
        const same = current.length === target.length && target.every((id) => currentSet.has(id));
        if (!same) {
          await this.ouchtracker.assignKit(kit.ouchtrackerKitId, target);
          this.logger.log(`Αυτόματος συγχρονισμός προσβάσεων φαρμακείου ${kit.id}.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Αποτυχία συγχρονισμού προσβάσεων φαρμακείου ${kit.id}: ${message}`);
      }
    }
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async getView(user: RequestUser, id: string) {
    const kit = await this.prisma.pharmacyKit.findFirst({
      where: { id, topikoId: user.topikoId },
      include: {
        klados: { select: { type: true } },
        loans: {
          where: { returnedAt: null },
          include: { toKlados: { select: { type: true } } },
          orderBy: { borrowedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!kit) throw new NotFoundException('Το φαρμακείο δεν βρέθηκε.');
    return this.toView(kit, 'OWNED');
  }

  private async findOwned(user: RequestUser, id: string) {
    const kit = await this.prisma.pharmacyKit.findFirst({
      where: { id, topikoId: user.topikoId, archivedAt: null },
      include: { klados: { select: { type: true } } },
    });
    if (!kit) throw new NotFoundException('Το φαρμακείο δεν βρέθηκε.');
    // Ο δανεισμός/αποσύνδεση ελέγχεται από την εμβέλεια **ιδιοκτησίας**.
    assertScopeAccess(user, 'farmakeio:write', kit.klados?.type ?? undefined);
    return kit;
  }

  /** Τα OuchTracker user ids της εμβέλειας που δανείζεται (αντιστοίχιση με email). */
  private async resolveOuchUserIds(topikoId: string, kladosType?: KladosType): Promise<string[]> {
    // Μόνο όσοι μπορούν πραγματικά να μπουν στο OuchTracker (έχουν λογαριασμό
    // Trifylli → λογαριασμό Authentik): για κλάδο = ο/οι διαχειριστής/ές του
    // κλάδου, για Τοπικό = οι υπερδιαχειριστές.
    const people = kladosType
      ? await this.prisma.user.findMany({
          where: {
            topikoId,
            email: { not: null },
            accountRole: { not: null },
            adminKlados: { type: kladosType },
          },
          select: { email: true, firstName: true, lastName: true },
        })
      : await this.prisma.user.findMany({
          where: { topikoId, email: { not: null }, accountRole: AccountRole.SUPER_ADMIN },
          select: { email: true, firstName: true, lastName: true },
        });
    if (people.length === 0) return [];

    const ouchUsers = await this.ouchtracker.listUsers();
    const byEmail = new Map(ouchUsers.map((u) => [u.email, u.id]));

    const ids: string[] = [];
    for (const person of people) {
      const email = person.email!.toLowerCase();
      let id = byEmail.get(email);
      if (!id) {
        // Auto-provision λογαριασμού CHECKER, ώστε να ανατεθεί το Kit ακόμη κι αν
        // δεν έχει συνδεθεί ποτέ στο OuchTracker. Μία αποτυχία δεν ρίχνει τους
        // υπόλοιπους.
        try {
          id = await this.ouchtracker.createUser(email, `${person.firstName} ${person.lastName}`.trim());
        } catch (error) {
          this.logger.warn(
            `Αποτυχία auto-provision OuchTracker για ${email}: ${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }
      }
      ids.push(id);
    }
    return ids;
  }

  private async resolveKladosId(user: RequestUser, kladosType?: KladosType): Promise<string | null> {
    if (!kladosType) return null;
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type: kladosType } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${kladosType} δεν υπάρχει.`);
    return klados.id;
  }

  private toView(
    kit: {
      id: string;
      name: string;
      ouchtrackerKitId: string;
      kladosId: string | null;
      klados: { type: KladosType } | null;
      loans: { id: string; toKladosId: string | null; borrowedAt: Date; dueAt: Date | null; toKlados: { type: KladosType } | null }[];
    },
    relation: 'OWNED' | 'BORROWED',
  ) {
    const ownerType = kit.klados?.type ?? null;
    const loan = kit.loans[0] ?? null;
    return {
      id: kit.id,
      name: kit.name,
      ouchtrackerKitId: kit.ouchtrackerKitId,
      relation,
      owner: { kladosType: ownerType, label: ownerType ? KLADOS_LABEL[ownerType] : 'Τοπικό' },
      loan: loan
        ? {
            id: loan.id,
            toKladosType: loan.toKlados?.type ?? null,
            toLabel: loan.toKlados?.type ? KLADOS_LABEL[loan.toKlados.type] : 'Τοπικό',
            borrowedAt: loan.borrowedAt,
            dueAt: loan.dueAt,
            overdue: loan.dueAt !== null && loan.dueAt.getTime() < Date.now(),
          }
        : null,
    };
  }
}
