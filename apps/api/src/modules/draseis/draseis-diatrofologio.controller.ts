import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisDiatrofologioService } from './draseis-diatrofologio.service';
import { UpdateMealDto } from './dto/drasi-diatrofologio.dto';

/** Το διατροφολόγιο: τα γεύματα του προγράμματος με μενού, συνταγή και ποσολόγιο. */
@ApiTags('Δράσεις — διατροφολόγιο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id/diatrofologio')
export class DraseisDiatrofologioController {
  constructor(private readonly diatrofologio: DraseisDiatrofologioService) {}

  @Get()
  @RequireDrasi('diatrofologio')
  @ApiOperation({ summary: 'Οι ημέρες της δράσης με τα γεύματά τους (από το πρόγραμμα)' })
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.diatrofologio.view(user, id);
  }

  @Get(':itemId')
  @RequireDrasi('diatrofologio')
  meal(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.diatrofologio.meal(user, id, itemId);
  }

  @Patch(':itemId')
  @RequireDrasi('diatrofologio', 'edit')
  @ApiOperation({ summary: 'Μενού, συνταγή και ποσολόγιο ενός γεύματος — μαγείρισσα και τροφοδοσία' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMealDto,
  ) {
    return this.diatrofologio.updateMeal(user, id, itemId, dto);
  }
}
