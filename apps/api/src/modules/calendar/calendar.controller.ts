import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { KladosRequiredRangeDto } from '../../common/dto/klados-range.dto';
import { UpcomingQueryDto } from './dto/upcoming.dto';
import { CalendarService } from './calendar.service';

@ApiTags('Ημερολόγιο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Γεγονότα διαστήματος',
    description: 'Δράσεις, συγκεντρώσεις και συμβούλια σε ένα ενιαίο σχήμα.',
  })
  events(@CurrentUser() user: RequestUser, @Query() query: KladosRequiredRangeDto) {
    if (query.from >= query.to) {
      throw new BadRequestException('Το `from` πρέπει να προηγείται του `to`.');
    }
    return this.calendar.events(user, query.from, query.to, query.klados);
  }

  @Get('upcoming')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Easy view — επόμενα γεγονότα ανά ημέρα' })
  upcoming(@CurrentUser() user: RequestUser, @Query() query: UpcomingQueryDto) {
    return this.calendar.upcoming(user, query.days, query.klados);
  }

  @Get('dashboard')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Σύνοψη αρχικής οθόνης' })
  dashboard(@CurrentUser() user: RequestUser) {
    return this.calendar.dashboard(user);
  }
}
