import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Readiness — ελέγχει τη σύνδεση με τη βάση (503 όταν πέσει)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      // Η λεπτομέρεια (host, χρήστης, διάγνωση) ανήκει στα logs — το endpoint
      // είναι δημόσιο και δεν χρειάζεται να εξηγεί σε όποιον περάσει.
      this.logger.error(`Readiness: η βάση δεν απαντά — ${error instanceof Error ? error.message : String(error)}`);
      // 503 και όχι 200: οι έλεγχοι απ' έξω (Uptime Kuma, UptimeRobot, watchdog)
      // κοιτάζουν τον κωδικό — ένα 200 «degraded» θα περνούσε για υγιές.
      throw new ServiceUnavailableException({ status: 'degraded', database: 'down' });
    }
  }
}
