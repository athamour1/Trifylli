import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisGonisService } from './draseis-gonis.service';
import { DrasiPermGuard } from './drasi-perm.guard';

/**
 * Γράμμα προς τους γονείς και εξάρτυση. Γράφονται μόνο ως κοινά έγγραφα
 * (`drasi:<id>:gramma`, `drasi:<id>:exartysi`)· εδώ η ανάγνωση.
 */
@ApiTags('Δράσεις — γονείς')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisGonisController {
  constructor(private readonly gonis: DraseisGonisService) {}

  @Get('gramma')
  @RequireDrasi('gramma')
  @ApiOperation({ summary: 'Το γράμμα προς τους γονείς (Markdown) — ή το πρότυπο, αν δεν γράφτηκε ακόμα' })
  gramma(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gonis.gramma(user, id);
  }

  @Get('exartysi')
  @RequireDrasi('exartysi')
  @ApiOperation({ summary: 'Η εξάρτυση: ενότητες και είδη — ή το πρότυπο, αν δεν γράφτηκε ακόμα' })
  exartysi(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gonis.exartysi(user, id);
  }
}
