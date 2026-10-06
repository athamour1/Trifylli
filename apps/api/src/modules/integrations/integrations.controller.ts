import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, Public, SuperAdminOnly } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EseoClient } from './eseo.client';
import { EseoSyncService } from './eseo-sync.service';
import { OuchtrackerClient } from './ouchtracker.client';

@ApiTags('Ενσωματώσεις')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eseoSync: EseoSyncService,
    private readonly eseo: EseoClient,
    private readonly ouchtracker: OuchtrackerClient,
    @Inject(AppConfigToken) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  @SuperAdminOnly()
  @ApiOperation({ summary: 'Κατάσταση ενσωματώσεων και τελευταίοι συγχρονισμοί' })
  async status(@CurrentUser() user: RequestUser) {
    const runs = await this.prisma.syncRun.findMany({
      where: { topikoId: user.topikoId },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return {
      eseo: {
        configured: this.eseo.configured,
        cron: this.config.ESEO_SYNC_CRON,
        enabled: this.config.SYNC_ENABLED,
        webhookConfigured: Boolean(this.config.ESEO_WEBHOOK_SECRET),
      },
      ouchtracker: { configured: this.ouchtracker.configured },
      recentRuns: runs,
    };
  }

  @Post('eseo/sync')
  @SuperAdminOnly()
  @ApiOperation({
    summary: 'Χειροκίνητος συγχρονισμός μητρώου από e-SEO',
    description: 'Ο ρόλος των χρηστών δεν αλλάζει — τα δικαιώματα ορίζονται στο Authentik.',
  })
  async syncEseo(@CurrentUser() user: RequestUser) {
    await this.audit.record(user, 'integrations.eseo.sync', 'topiko', user.topikoId);
    return this.eseoSync.syncTopiko(user.topikoId);
  }

  /**
   * Webhook του e-SEO.
   *
   * Δημόσιο endpoint (δεν υπάρχει χρήστης), οπότε η αυθεντικοποίηση γίνεται με
   * HMAC υπογραφή του σώματος. Χωρίς `ESEO_WEBHOOK_SECRET` το endpoint είναι
   * απενεργοποιημένο — ένα ανοιχτό webhook είναι χειρότερο από κανένα.
   */
  @Post('eseo/webhook')
  @Public()
  @HttpCode(202)
  @ApiExcludeEndpoint()
  // Δημόσιο endpoint χωρίς χρήστη: μικρό όριο, ώστε μια καταιγίδα αιτημάτων να
  // μη γίνει καταιγίδα υπολογισμών HMAC.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-eseo-signature') signature: string | undefined,
    @Body() payload: { topikoCode?: string },
  ) {
    const secret = this.config.ESEO_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('Το webhook e-SEO δεν έχει ρυθμιστεί.');
    }
    if (!signature) throw new UnauthorizedException('Λείπει η υπογραφή.');

    // Η υπογραφή επαληθεύεται πάνω στα **bytes που έφτασαν** — όχι σε δική μας
    // επανασειριοποίηση, που θα διέφερε σε κενά, σειρά κλειδιών ή escaping και θα
    // απέρριπτε έγκυρα μηνύματα (ή, χειρότερα, θα δεχόταν ό,τι τυχαίνει να
    // σειριοποιείται ίδια).
    const raw = req.rawBody;
    if (!raw) throw new BadRequestException('Κενό σώμα.');

    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    if (!safeEqual(signature, expected)) {
      this.logger.warn('Webhook e-SEO με άκυρη υπογραφή — απορρίφθηκε.');
      throw new UnauthorizedException('Άκυρη υπογραφή.');
    }

    // Replay: μια έγκυρη υπογραφή που ξανάρχεται μέσα στο παράθυρο δεν πυροδοτεί
    // δεύτερο συγχρονισμό. Ο αποστολέας δεν στέλνει timestamp, οπότε το «ξανά»
    // το κρίνουμε από την ίδια την υπογραφή.
    if (!this.replayGuard.admit(signature)) {
      this.logger.warn('Webhook e-SEO: επαναλαμβανόμενη υπογραφή — αγνοήθηκε.');
      return { accepted: true, duplicate: true };
    }

    if (!payload.topikoCode) throw new BadRequestException('Λείπει το `topikoCode`.');

    const topiko = await this.prisma.topiko.findUnique({
      where: { eseoCode: payload.topikoCode },
      select: { id: true },
    });
    if (!topiko) throw new BadRequestException('Άγνωστος κωδικός Τοπικού.');

    // Απαντάμε 202 και τρέχουμε τον συγχρονισμό στο παρασκήνιο: το e-SEO δεν
    // πρέπει να περιμένει ένα πλήρες πέρασμα μητρώου για να πάρει απάντηση. Αν
    // τρέχει ήδη, ο sync σημειώνει «ξανά μετά» αντί να ξεκινήσει δεύτερος.
    void this.eseoSync
      .requestSync(topiko.id)
      .catch((error: unknown) =>
        this.logger.error(`Αποτυχία συγχρονισμού από webhook: ${String(error)}`),
      );

    return { accepted: true };
  }

  private readonly replayGuard = new ReplayGuard(10 * 60 * 1000);
}

/**
 * Θυμάται τις υπογραφές που έγιναν δεκτές για `windowMs`. Μικρό και in-memory:
 * ένα Τοπικό δέχεται λίγα webhooks την ημέρα, και μια επανεκκίνηση απλώς
 * ξεχνά — το κόστος είναι ένας επιπλέον (idempotent) συγχρονισμός.
 */
class ReplayGuard {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  admit(signature: string): boolean {
    const now = Date.now();
    for (const [key, at] of this.seen) if (now - at > this.windowMs) this.seen.delete(key);
    if (this.seen.has(signature)) return false;
    this.seen.set(signature, now);
    return true;
  }
}

/** Σύγκριση σταθερού χρόνου, ανεκτική σε διαφορετικό μήκος. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
