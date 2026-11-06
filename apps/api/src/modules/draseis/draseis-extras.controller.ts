import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DrasiPermGuard } from './drasi-perm.guard';
import { DraseisExtrasService } from './draseis-extras.service';
import { CreateExtraItemDto, PlaceExtraItemDto, UpdateExtraItemDto } from './dto/drasi-plan.dto';

/**
 * Προγραμματικά εκτός ωρολογίου («έξτρα») — κάτω από το `schedule`, ώστε οι
 * αλλαγές να φτάνουν ζωντανά όπου φαίνεται το ωρολόγιο (θέμα `schedule`). Τα
 * διαβάζει το `GET schedule` (πεδίο `extras`).
 */
@ApiTags('Δράσεις — πρόγραμμα & υλικό')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id/schedule/extras')
export class DraseisExtrasController {
  constructor(private readonly extras: DraseisExtrasService) {}

  @Post()
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Νέο προγραμματικό εκτός ωρολογίου (από το kanban)' })
  add(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateExtraItemDto) {
    return this.extras.add(user, id, dto);
  }

  @Patch(':extraId')
  @RequireDrasi('programma', 'edit')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('extraId', ParseUUIDPipe) extraId: string,
    @Body() dto: UpdateExtraItemDto,
  ) {
    return this.extras.update(user, id, extraId, dto);
  }

  @Delete(':extraId')
  @RequireDrasi('programma', 'edit')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('extraId', ParseUUIDPipe) extraId: string) {
    return this.extras.remove(user, id, extraId);
  }

  @Post(':extraId/place')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Το προγραμματικό μπαίνει στο ωρολόγιο, στο τέλος μιας ημέρας (κρατά το id του)' })
  place(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('extraId', ParseUUIDPipe) extraId: string,
    @Body() dto: PlaceExtraItemDto,
  ) {
    return this.extras.place(user, id, extraId, dto.date);
  }
}
