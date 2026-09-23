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
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
  syncEseo(@CurrentUser() user: RequestUser) {
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
  async webhook(
    @Headers('x-eseo-signature') signature: string | undefined,
    @Body() payload: { topikoCode?: string },
  ) {
    const secret = this.config.ESEO_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('Το webhook e-SEO δεν έχει ρυθμιστεί.');
    }
    if (!signature) throw new UnauthorizedException('Λείπει η υπογραφή.');

    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    if (!safeEqual(signature, expected)) {
      this.logger.warn('Webhook e-SEO με άκυρη υπογραφή — απορρίφθηκε.');
      throw new UnauthorizedException('Άκυρη υπογραφή.');
    }

    if (!payload.topikoCode) throw new BadRequestException('Λείπει το `topikoCode`.');

    const topiko = await this.prisma.topiko.findUnique({
      where: { eseoCode: payload.topikoCode },
      select: { id: true },
    });
    if (!topiko) throw new BadRequestException('Άγνωστος κωδικός Τοπικού.');

    // Απαντάμε 202 και τρέχουμε τον συγχρονισμό στο παρασκήνιο: το e-SEO δεν
    // πρέπει να περιμένει ένα πλήρες πέρασμα μητρώου για να πάρει απάντηση.
    void this.eseoSync
      .syncTopiko(topiko.id)
      .catch((error: unknown) =>
        this.logger.error(`Αποτυχία συγχρονισμού από webhook: ${String(error)}`),
      );

    return { accepted: true };
  }
}

/** Σύγκριση σταθερού χρόνου, ανεκτική σε διαφορετικό μήκος. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
