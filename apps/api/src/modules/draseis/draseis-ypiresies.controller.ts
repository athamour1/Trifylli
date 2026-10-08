import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DrasiPermGuard } from './drasi-perm.guard';
import { DraseisYpiresiesService } from './draseis-ypiresies.service';
import { CreateYpiresiaDto, SetResponsiblesDto, SetYpiresiaSlotsDto, SetYpiresiesSettingsDto, UpdateYpiresiaDto } from './dto/drasi-ypiresies.dto';

/** Υπηρεσίες μιας δράσης: ρυθμίσεις, υπεύθυνοι, χρονοδιάγραμμα. */
@ApiTags('Δράσεις — υπηρεσίες')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id/ypiresies')
export class DraseisYpiresiesController {
  constructor(private readonly ypiresies: DraseisYpiresiesService) {}

  @Get()
  @RequireDrasi('ypiresies')
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ypiresies.view(user, id);
  }

  @Put('settings')
  @RequireDrasi('ypiresies', 'edit')
  @ApiOperation({ summary: 'Κύλιση (σταθερές / ανά ημέρα / δύο φορές τη μέρα) — σβήνει το χρονοδιάγραμμα αν αλλάξει' })
  settings(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetYpiresiesSettingsDto) {
    return this.ypiresies.setSettings(user, id, dto);
  }

  @Put('slots')
  @RequireDrasi('ypiresies', 'edit')
  slots(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetYpiresiaSlotsDto) {
    return this.ypiresies.setSlots(user, id, dto);
  }

  @Post('rotate')
  @RequireDrasi('ypiresies', 'edit')
  @ApiOperation({ summary: 'Κυκλική κατανομή υπηρεσιών στις ομάδες (αντικαθιστά το χρονοδιάγραμμα)' })
  rotate(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ypiresies.rotate(user, id);
  }

  @Post()
  @RequireDrasi('ypiresies', 'edit')
  create(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateYpiresiaDto) {
    return this.ypiresies.create(user, id, dto);
  }

  @Patch(':serviceId')
  @RequireDrasi('ypiresies', 'edit')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: UpdateYpiresiaDto,
  ) {
    return this.ypiresies.update(user, id, serviceId, dto);
  }

  @Delete(':serviceId')
  @RequireDrasi('ypiresies', 'edit')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.ypiresies.remove(user, id, serviceId);
  }

  @Put(':serviceId/responsibles')
  @RequireDrasi('ypiresies', 'edit')
  responsibles(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: SetResponsiblesDto,
  ) {
    return this.ypiresies.setResponsibles(user, id, serviceId, dto);
  }
}
