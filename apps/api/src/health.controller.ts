import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/auth/decorators';
import { PrismaService } from './common/prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness — απαντά χωρίς εξαρτήσεις' })
  live() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Readiness — ελέγχει τη σύνδεση με τη βάση' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      // Η λεπτομέρεια (host, χρήστης, διάγνωση) ανήκει στα logs — το endpoint
      // είναι δημόσιο και δεν χρειάζεται να εξηγεί σε όποιον περάσει.
      this.logger.error(`Readiness: η βάση δεν απαντά — ${error instanceof Error ? error.message : String(error)}`);
      return { status: 'degraded', database: 'down' };
    }
  }
}
