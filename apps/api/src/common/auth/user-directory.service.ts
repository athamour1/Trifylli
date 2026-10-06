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
import { maskEmail } from '../util/mask';

export interface TokenIdentity {
  /** `sub` του Authentik· κενό στη dev παράκαμψη. */
  ssoId?: string;
  /**
   * Το id του λογαριασμού Trifylli, όπως το έγραψε το API στο attribute του
   * χρήστη Authentik κατά την πρόσκληση και το επιστρέφει το token ως claim.
   * Όταν υπάρχει, είναι η **μόνη** αλήθεια: το email μπορεί να το αλλάξει ο
   * ίδιος ο χρήστης, αυτό όχι.
   */
  accountId?: string;
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

    // 0) Σταθερός δεσμός από την πρόσκληση: το claim `trifylli_account_id`.
    //    Προηγείται από όλα — ούτε αλλαγή email ούτε αλλαγή `sub` το επηρεάζει.
    let account = identity.accountId
      ? await this.prisma.user.findFirst({
          where: { id: identity.accountId, topikoId: topiko.id, accountRole: { not: null } },
          include: { adminKlados: { select: { type: true } } },
        })
      : null;

    if (account && identity.ssoId && account.ssoId !== identity.ssoId) {
      account = await this.prisma.user.update({
        where: { id: account.id },
        data: { ssoId: identity.ssoId },
        include: { adminKlados: { select: { type: true } } },
      });
    }

    // 1) Γνωστή συνεδρία: ο χρήστης έχει ξανασυνδεθεί.
    if (!account && identity.ssoId) {
      account = await this.prisma.user.findUnique({
        where: { ssoId: identity.ssoId },
        include: { adminKlados: { select: { type: true } } },
      });
    }

    // 2) Πρώτη σύνδεση σε λογαριασμό που δημιούργησε ο υπερδιαχειριστής — με
    //    κλειδί το email. Εφεδρεία για λογαριασμούς που προϋπήρχαν της
    //    πρόσκλησης (χωρίς claim)· γι' αυτό το email στο Authentik είναι
    //    read-only για τον χρήστη (βλ. trifylli-security.yaml).
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
        this.logger.log(`Ο λογαριασμός ${maskEmail(email)} συνδέθηκε με το Authentik.`);
      }
    }

    // 3) Bootstrap υπερδιαχειριστή — **μόνο σε φρέσκο στήσιμο**, δηλαδή όταν δεν
    //    υπάρχει κανένας υπερδιαχειριστής. Αλλιώς ένας λογαριασμός με αυτό το email
    //    που ανακλήθηκε θα ξαναγινόταν υπερδιαχειριστής στην επόμενη σύνδεση — και
    //    η ανάκληση θα ήταν διακοσμητική.
    if (!account && this.config.SUPER_ADMIN_EMAIL?.toLowerCase() === email) {
      const superAdmins = await this.prisma.user.count({
        where: { topikoId: topiko.id, accountRole: AccountRole.SUPER_ADMIN },
      });
      if (superAdmins === 0) {
        account = await this.bootstrapSuperAdmin(topiko.id, email, identity);
      } else {
        this.logger.warn(
          `Το SUPER_ADMIN_EMAIL (${maskEmail(email)}) ζήτησε σύνδεση χωρίς λογαριασμό, ` +
            'αλλά υπάρχει ήδη υπερδιαχειριστής — δεν γίνεται bootstrap.',
        );
      }
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

    this.logger.warn(`Bootstrap υπερδιαχειριστή για ${maskEmail(email)} (SUPER_ADMIN_EMAIL).`);

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
