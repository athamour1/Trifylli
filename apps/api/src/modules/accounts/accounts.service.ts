import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountRole, MemberKind } from '@prisma/client';
import {
  KLADOI_IN_ORDER,
  KLADOS_LABEL,
  KLADOS_META,
  accountRoleLabel,
  type AccountCreated,
  type AccountSummary,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { AuthentikClient } from '../integrations/authentik.client';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

/**
 * Διαχείριση των λογαριασμών που μπαίνουν στην εφαρμογή.
 *
 * Το Τοπικό λειτουργεί με πέντε: έναν υπερδιαχειριστή και έναν διαχειριστή ανά
 * κλάδο. Τους φτιάχνει ο υπερδιαχειριστής **εδώ**, όχι στο Authentik: έτσι η
 * εξουσιοδότηση είναι ορατή και ελέγξιμη μέσα από την εφαρμογή, και το Authentik
 * μένει υπεύθυνο μόνο για το «ποιος είσαι».
 *
 * Ένας λογαριασμός δεν είναι νέο άτομο αν το άτομο υπάρχει ήδη στο μητρώο: το
 * email κάνει τη σύνδεση, ώστε ο διαχειριστής των Πουλιών να είναι το ίδιο
 * πρόσωπο με το στέλεχος «Μαρία Παπαδοπούλου» και όχι διπλότυπο.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authentik: AuthentikClient,
  ) {}

  async list(user: RequestUser): Promise<{ accounts: AccountSummary[]; kladoiWithoutAdmin: KladosType[] }> {
    const rows = await this.prisma.user.findMany({
      where: { topikoId: user.topikoId, accountRole: { not: null } },
      include: { adminKlados: { select: { type: true } } },
      orderBy: [{ accountRole: 'asc' }, { lastName: 'asc' }],
    });

    const accounts = rows.map((row) => this.toSummary(row));

    const covered = new Set(accounts.map((a) => a.adminKlados).filter((k): k is KladosType => !!k));
    const existing = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: { type: true },
    });

    return {
      accounts,
      kladoiWithoutAdmin: existing
        .map((k) => k.type as KladosType)
        .filter((k) => !covered.has(k))
        .sort((a, b) => KLADOS_META[a].order - KLADOS_META[b].order),
    };
  }

  async create(user: RequestUser, dto: CreateAccountDto): Promise<AccountCreated> {
    const email = dto.email.trim().toLowerCase();
    const adminKladosId = await this.resolveKladosId(user.topikoId, dto.role, dto.adminKlados);

    const existing = await this.prisma.user.findFirst({
      where: { topikoId: user.topikoId, email },
      include: { adminKlados: { select: { type: true } } },
    });

    if (existing?.accountRole) {
      throw new ConflictException(`Υπάρχει ήδη λογαριασμός για το ${email}.`);
    }

    // Υπάρχον άτομο του μητρώου: το προάγουμε σε λογαριασμό αντί να φτιάξουμε
    // διπλότυπο, ώστε να μη χαθεί το ιστορικό του.
    if (existing) {
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          accountRole: dto.role,
          adminKladosId,
          kind: MemberKind.STELEXOS,
          ...(dto.firstName ? { firstName: dto.firstName } : {}),
          ...(dto.lastName ? { lastName: dto.lastName } : {}),
        },
        include: { adminKlados: { select: { type: true } } },
      });
      return this.withInvitation(this.toSummary(updated));
    }

    const created = await this.prisma.user.create({
      data: {
        topikoId: user.topikoId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        kind: MemberKind.STELEXOS,
        accountRole: dto.role,
        adminKladosId,
      },
      include: { adminKlados: { select: { type: true } } },
    });

    return this.withInvitation(this.toSummary(created));
  }

  /**
   * Ξαναστέλνει τον σύνδεσμο ορισμού κωδικού — για πρόσκληση που χάθηκε και για
   * «ξέχασα τον κωδικό» που ζητείται από τον υπερδιαχειριστή.
   *
   * Εδώ, σε αντίθεση με τη δημιουργία, η αποτυχία **πρέπει** να φτάσει στον
   * χρήστη: το μόνο που ζήτησε είναι να φύγει ένα email.
   */
  async invite(user: RequestUser, id: string): Promise<{ sent: true; email: string }> {
    const account = await this.load(user, id);
    if (!account.email) {
      throw new BadRequestException('Ο λογαριασμός δεν έχει email — προσθέστε το πρώτα.');
    }

    await this.authentik.sendPasswordSetupEmail({
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
    });

    return { sent: true, email: account.email };
  }

  /**
   * Στέλνει την πρόσκληση **χωρίς** να ρίξει τη δημιουργία: ο λογαριασμός έχει
   * ήδη γραφτεί στη βάση, και ένα 503 από το Authentik δεν πρέπει να κάνει τον
   * υπερδιαχειριστή να νομίζει ότι απέτυχε όλη η ενέργεια — θα ξαναδοκίμαζε και
   * θα έπαιρνε «υπάρχει ήδη λογαριασμός».
   */
  private async withInvitation(account: AccountSummary): Promise<AccountCreated> {
    if (!account.email) {
      return { account, invited: false, inviteError: 'Ο λογαριασμός δεν έχει email.' };
    }
    if (!this.authentik.configured) {
      return {
        account,
        invited: false,
        inviteError:
          'Δεν έχει ρυθμιστεί η σύνδεση με το Authentik — ο κωδικός ορίζεται χειροκίνητα από εκεί.',
      };
    }

    try {
      await this.authentik.sendPasswordSetupEmail({
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
      });
      return { account, invited: true, inviteError: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ο λογαριασμός ${account.email} δημιουργήθηκε αλλά η πρόσκληση απέτυχε: ${message}`);
      return { account, invited: false, inviteError: message };
    }
  }

  async update(user: RequestUser, id: string, dto: UpdateAccountDto): Promise<AccountSummary> {
    const account = await this.load(user, id);

    const role = dto.role ?? account.accountRole!;
    const adminKlados = dto.adminKlados ?? (account.adminKlados?.type as KladosType | undefined);
    const adminKladosId = await this.resolveKladosId(user.topikoId, role, adminKlados);

    if (account.accountRole === AccountRole.SUPER_ADMIN && role !== AccountRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(user.topikoId, account.id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        accountRole: role,
        adminKladosId,
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
      },
      include: { adminKlados: { select: { type: true } } },
    });

    return this.toSummary(updated);
  }

  /**
   * Ανάκληση πρόσβασης. Το άτομο **δεν** διαγράφεται: παραμένει στο μητρώο με
   * όλο του το ιστορικό, απλώς δεν μπορεί πια να μπει.
   */
  async revoke(user: RequestUser, id: string): Promise<{ revoked: true }> {
    const account = await this.load(user, id);

    if (account.id === user.id) {
      throw new BadRequestException('Δεν μπορείτε να αφαιρέσετε τη δική σας πρόσβαση.');
    }
    if (account.accountRole === AccountRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(user.topikoId, account.id);
    }

    await this.prisma.user.update({
      where: { id },
      // Το `ssoId` καθαρίζεται ώστε μια μελλοντική επαναφορά να ξαναδέσει
      // καθαρά με το Authentik αντί να κληρονομήσει παλιά ταυτότητα.
      data: { accountRole: null, adminKladosId: null, ssoId: null },
    });

    return { revoked: true };
  }

  /** Οι κλάδοι που μπορούν να ανατεθούν, με τον τρέχοντα διαχειριστή τους. */
  async assignableKladoi(user: RequestUser) {
    const rows = await this.prisma.klados.findMany({
      where: { topikoId: user.topikoId },
      select: {
        type: true,
        admins: {
          where: { accountRole: { not: null } },
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return (rows.length > 0 ? rows : KLADOI_IN_ORDER.map((type) => ({ type, admins: [] })))
      .map((row) => ({
        type: row.type as KladosType,
        label: KLADOS_LABEL[row.type as KladosType],
        admins: row.admins,
      }))
      .sort((a, b) => KLADOS_META[a.type].order - KLADOS_META[b.type].order);
  }

  private async load(user: RequestUser, id: string) {
    const account = await this.prisma.user.findFirst({
      where: { id, topikoId: user.topikoId, accountRole: { not: null } },
      include: { adminKlados: { select: { type: true } } },
    });
    if (!account) throw new NotFoundException('Ο λογαριασμός δεν βρέθηκε.');
    return account;
  }

  /** Ένα Τοπικό χωρίς υπερδιαχειριστή δεν μπορεί να ξαναδώσει δικαιώματα σε κανέναν. */
  private async assertNotLastSuperAdmin(topikoId: string, excludeId: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: { topikoId, accountRole: AccountRole.SUPER_ADMIN, id: { not: excludeId } },
    });
    if (others === 0) {
      throw new BadRequestException('Πρέπει να παραμείνει τουλάχιστον ένας υπερδιαχειριστής.');
    }
  }

  private async resolveKladosId(
    topikoId: string,
    role: AccountRole,
    klados: KladosType | undefined,
  ): Promise<string | null> {
    if (role === AccountRole.SUPER_ADMIN) {
      if (klados) throw new BadRequestException('Ο υπερδιαχειριστής δεν ανήκει σε κλάδο.');
      return null;
    }
    if (!klados) throw new BadRequestException('Ο διαχειριστής κλάδου πρέπει να έχει κλάδο.');

    const row = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId, type: klados } },
      select: { id: true },
    });
    if (!row) throw new BadRequestException(`Ο κλάδος ${klados} δεν υπάρχει στο Τοπικό.`);
    return row.id;
  }

  private toSummary(row: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    accountRole: AccountRole | null;
    ssoId: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    adminKlados: { type: string } | null;
  }): AccountSummary {
    const adminKlados = (row.adminKlados?.type as KladosType | undefined) ?? null;
    const role = row.accountRole ?? AccountRole.KLADOS_ADMIN;

    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role,
      adminKlados,
      roleLabel: accountRoleLabel(role, adminKlados),
      activated: row.ssoId !== null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
