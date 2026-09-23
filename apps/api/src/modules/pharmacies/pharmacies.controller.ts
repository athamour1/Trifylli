import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { LendPharmacyDto, LinkPharmacyDto, QueryPharmacyDto } from './dto/pharmacy.dto';
import { PharmaciesService } from './pharmacies.service';

@ApiTags('Φαρμακεία')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmacies: PharmaciesService) {}

  @Get()
  @RequireCapability('farmakeio:read')
  @ApiOperation({ summary: 'Φαρμακεία μιας εμβέλειας (δικά της + δανεισμένα σε αυτή)' })
  list(@CurrentUser() user: RequestUser, @Query() query: QueryPharmacyDto) {
    return this.pharmacies.list(user, query.klados);
  }

  @Get('available-kits')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Kits του OuchTracker που δεν έχουν συνδεθεί ακόμη' })
  availableKits(@CurrentUser() user: RequestUser, @Query() query: QueryPharmacyDto) {
    return this.pharmacies.availableKits(user, query.klados);
  }

  @Post()
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Σύνδεση Kit ως φαρμακείο μιας εμβέλειας' })
  link(@CurrentUser() user: RequestUser, @Body() dto: LinkPharmacyDto) {
    return this.pharmacies.link(user, dto);
  }

  @Post('sync-access')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Συγχρονισμός προσβάσεων OuchTracker με τα άτομα της εμβέλειας' })
  syncAccess(@CurrentUser() user: RequestUser, @Query() query: QueryPharmacyDto) {
    return this.pharmacies.syncAccess(user, query.klados);
  }

  @Post(':id/lend')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Δανεισμός φαρμακείου σε άλλον κλάδο ή στο Τοπικό' })
  lend(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LendPharmacyDto,
  ) {
    return this.pharmacies.lend(user, id, dto);
  }

  @Post(':id/return')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Επιστροφή δανεισμένου φαρμακείου' })
  returnKit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharmacies.returnKit(user, id);
  }

  @Delete(':id')
  @RequireCapability('farmakeio:write')
  @ApiOperation({ summary: 'Αποσύνδεση φαρμακείου' })
  unlink(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pharmacies.unlink(user, id);
  }
}
