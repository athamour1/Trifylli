import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { AccountRole, MemberKind } from '@prisma/client';
import {
  KLADOI_IN_ORDER,
  sortKladoi,
  visibleKladoi,
  type AuthenticatedUser,
  type KladosType,
} from '@trifylli/shared';
import { AppConfigToken } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenIdentity {
  /** `sub` του Authentik· κενό στη dev παράκαμψη. */
  ssoId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Δένει την ταυτότητα του Authentik με έναν λογαριασμό της εφαρμογής.
 *
 * Η **εξουσιοδότηση ζει στη βάση**, όχι στα Authentik groups: τους πέντε
 * λογαριασμούς (υπερδιαχειριστής + ένας ανά κλάδο) τους φτιάχνει ο
 * υπερδιαχειριστής μέσα από την εφαρμογή. Το Authentik απαντά μόνο «ποιος
 * είσαι»· το «τι μπορείς» το λέει η εγγραφή `User.accountRole`.
 *
 * Δεν γίνεται αυτόματο provisioning: άγνωστο email σημαίνει ότι δεν υπάρχει
 * λογαριασμός, και απορρίπτεται. Η μόνη εξαίρεση είναι το `SUPER_ADMIN_EMAIL`,
 * που λύνει το πρόβλημα του πρώτου χρήστη σε φρέσκο στήσιμο.
 */
@Injectable()
export class UserDirectoryService {
  private readonly logger = new Logger(UserDirectoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  async resolveFromToken(identity: TokenIdentity): Promise<AuthenticatedUser> {
    const topiko = await this.prisma.topiko.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!topiko) {
      throw new ForbiddenException('Δεν έχει ρυθμιστεί Τοπικό Τμήμα. Εκτελέστε το seed.');
    }

    const email = identity.email.trim().toLowerCase();

    // 1) Γνωστή συνεδρία: ο χρήστης έχει ξανασυνδεθεί.
    let account = identity.ssoId
      ? await this.prisma.user.findUnique({
          where: { ssoId: identity.ssoId },
          include: { adminKlados: { select: { type: true } } },
        })
      : null;

    // 2) Πρώτη σύνδεση σε λογαριασμό που δημιούργησε ο υπερδιαχειριστής.
    if (!account) {
      account = await this.prisma.user.findFirst({
        where: { topikoId: topiko.id, email, accountRole: { not: null } },
        include: { adminKlados: { select: { type: true } } },
      });

      if (account && identity.ssoId && account.ssoId !== identity.ssoId) {
        account = await this.prisma.user.update({
          where: { id: account.id },
          data: { ssoId: identity.ssoId },
          include: { adminKlados: { select: { type: true } } },
        });
        this.logger.log(`Ο λογαριασμός ${email} συνδέθηκε με το Authentik.`);
      }
    }

    // 3) Bootstrap υπερδιαχειριστή σε φρέσκο στήσιμο.
    if (!account && this.config.SUPER_ADMIN_EMAIL?.toLowerCase() === email) {
      account = await this.bootstrapSuperAdmin(topiko.id, email, identity);
    }

    if (!account) {
      throw new ForbiddenException(
        'Δεν υπάρχει λογαριασμός για αυτό το email. Ζητήστε από τον υπερδιαχειριστή να σας προσθέσει.',
      );
    }
    if (!account.accountRole) {
      throw new ForbiddenException('Ο λογαριασμός σας δεν έχει πρόσβαση στην εφαρμογή.');
    }

    await this.prisma.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    const adminKlados = (account.adminKlados?.type as KladosType | undefined) ?? null;
    const profile = { role: account.accountRole, adminKlados };

    return {
      id: account.id,
      ssoId: account.ssoId,
      email: account.email ?? email,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.accountRole,
      adminKlados,
      kladoi: sortKladoi(visibleKladoi(profile, await this.topikoKladoi(topiko.id))),
      topikoId: topiko.id,
    };
  }

  /**
   * Ο πρώτος χρήστης. Αν υπάρχει ήδη εγγραφή μητρώου με αυτό το email (π.χ. από
   * e-SEO) την προάγει, αντί να φτιάξει διπλότυπο άτομο.
   */
  private async bootstrapSuperAdmin(topikoId: string, email: string, identity: TokenIdentity) {
    const existing = await this.prisma.user.findFirst({
      where: { topikoId, email },
      select: { id: true },
    });

    this.logger.warn(`Bootstrap υπερδιαχειριστή για ${email} (SUPER_ADMIN_EMAIL).`);

    const data = {
      accountRole: AccountRole.SUPER_ADMIN,
      kind: MemberKind.STELEXOS,
      adminKladosId: null,
      ...(identity.ssoId ? { ssoId: identity.ssoId } : {}),
    };

    return existing
      ? this.prisma.user.update({
          where: { id: existing.id },
          data,
          include: { adminKlados: { select: { type: true } } },
        })
      : this.prisma.user.create({
          data: {
            topikoId,
            email,
            firstName: identity.firstName ?? 'Υπερδιαχειριστής',
            lastName: identity.lastName ?? '',
            ...data,
          },
          include: { adminKlados: { select: { type: true } } },
        });
  }

  private async topikoKladoi(topikoId: string): Promise<KladosType[]> {
    const rows = await this.prisma.klados.findMany({ where: { topikoId }, select: { type: true } });
    return rows.length > 0 ? (rows.map((r) => r.type) as KladosType[]) : [...KLADOI_IN_ORDER];
  }
}
