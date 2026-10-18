import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { LinkEmailResult } from '@trifylli/shared';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { linkEmail, type LinkEmailKind } from './link-emails';

/** Ένας σύνδεσμος έτοιμος να φύγει: ήδη ελεγμένος (token, ισχύς) από όποιον τον ζητά. */
export interface MailableLink {
  id: string;
  kind: LinkEmailKind;
  participant: string;
  to: string[];
  url: string;
  expiresAt: Date;
}

/**
 * Τα email των προσωπικών συνδέσμων μιας δράσης (έντυπα, αξιολόγηση): ένα ανά
 * σύνδεσμο, με απάντηση προς το στέλεχος που το έστειλε. Ένα που αποτυγχάνει
 * δεν σταματά τα υπόλοιπα — η σελίδα δείχνει τι έφυγε και τι όχι.
 */
@Injectable()
export class LinkMailer {
  private readonly logger = new Logger(LinkMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  get enabled(): boolean {
    return this.mail.enabled;
  }

  async send(user: RequestUser, drasiId: string, links: readonly MailableLink[]): Promise<LinkEmailResult[]> {
    if (!this.mail.enabled) throw new ServiceUnavailableException('Η αποστολή email δεν έχει ρυθμιστεί στον server (SMTP).');
    const drasi = await this.prisma.drasi.findFirst({
      where: { id: drasiId, topikoId: user.topikoId },
      select: { title: true, dateStart: true, dateEnd: true, location: true, topiko: { select: { name: true, timezone: true } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');

    const results: LinkEmailResult[] = [];
    for (const link of links) {
      if (!link.to.length) {
        results.push({ id: link.id, sent: false, to: [], error: 'Δεν υπάρχει email στην καρτέλα του μέλους ή των κηδεμόνων.' });
        continue;
      }
      const message = linkEmail({
        kind: link.kind,
        drasi,
        topiko: drasi.topiko.name,
        participant: link.participant,
        url: link.url,
        expiresAt: link.expiresAt,
        timeZone: drasi.topiko.timezone,
      });
      try {
        await this.mail.send({ to: link.to, ...message, replyTo: user.email ?? undefined });
        results.push({ id: link.id, sent: true, to: link.to, error: null });
      } catch (err) {
        // Χωρίς διευθύνσεις στο log: μόνο τι απέτυχε και γιατί.
        this.logger.warn({ event: 'link-email-failed', drasiId, linkId: link.id, message: err instanceof Error ? err.message : String(err) });
        results.push({ id: link.id, sent: false, to: link.to, error: 'Το email δεν έφυγε — δοκίμασε ξανά σε λίγο.' });
      }
    }
    return results;
  }
}
