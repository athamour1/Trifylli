import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { KladosType } from '@trifylli/shared';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DateRangeDto } from '../../common/dto/date-range.dto';
import { SubmitParousiologioDto } from './dto/parousiologio.dto';
import { ParousiologioService } from './parousiologio.service';

@ApiTags('Παρουσιολόγιο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('parousiologio')
export class ParousiologioController {
  constructor(private readonly parousiologio: ParousiologioService) {}

  @Get('syggentrwsh/:id')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Φύλλο παρουσιολογίου συγκέντρωσης',
    description: 'Πλήρες φύλλο με όλα τα ενεργά μέλη, ώστε η PWA να δουλεύει offline.',
  })
  sheet(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.parousiologio.sheet(user, id);
  }

  @Put('syggentrwsh/:id')
  @RequireCapability('parousiologio:write')
  @ApiOperation({
    summary: 'Υποβολή παρουσιολογίου',
    description:
      'Idempotent. Κερδίζει η καταχώρηση με το πιο πρόσφατο `recordedAt`, ώστε καθυστερημένος ' +
      'offline συγχρονισμός να μη σβήνει νεότερη διόρθωση.',
  })
  submit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitParousiologioDto,
  ) {
    return this.parousiologio.submit(user, id, dto);
  }

  @Get('klados/:klados/report')
  @RequireCapability('parousiologio:write')
  @ApiParam({ name: 'klados', enum: KladosType })
  @ApiOperation({
    summary: 'Αναφορά παρουσίας κλάδου',
    description: 'Ταξινομημένη ανοδικά κατά ποσοστό: πρώτα τα μέλη που χάνονται.',
  })
  report(
    @CurrentUser() user: RequestUser,
    @Param('klados') klados: KladosType,
    @Query() range: DateRangeDto,
  ) {
    return this.parousiologio.report(user, klados, range.from, range.to);
  }
}
