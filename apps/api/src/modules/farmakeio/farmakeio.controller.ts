import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { FarmakeioService } from './farmakeio.service';

@ApiTags('Φαρμακείο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('farmakeio')
export class FarmakeioController {
  constructor(private readonly farmakeio: FarmakeioService) {}

  @Get()
  @RequireCapability('farmakeio:read')
  @ApiOperation({
    summary: 'Απόθεμα φαρμακείου',
    description: 'Τοπικό αντίγραφο του Ouchtracker — διαθέσιμο και χωρίς δίκτυο.',
  })
  inventory(@CurrentUser() user: RequestUser) {
    return this.farmakeio.inventory(user);
  }

  @Get('incidents')
  @RequireCapability('farmakeio:read')
  @ApiQuery({ name: 'drasiId', required: false })
  @ApiOperation({ summary: 'Ιατρικά περιστατικά' })
  incidents(@CurrentUser() user: RequestUser, @Query('drasiId') drasiId?: string) {
    return this.farmakeio.incidents(user, drasiId);
  }

  @Post('sync')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Συγχρονισμός αποθέματος από Ouchtracker' })
  syncInventory(@CurrentUser() user: RequestUser) {
    return this.farmakeio.syncInventory(user);
  }

  @Post('sync/incidents')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Συγχρονισμός περιστατικών από Ouchtracker' })
  syncIncidents(@CurrentUser() user: RequestUser) {
    return this.farmakeio.syncIncidents(user);
  }
}
