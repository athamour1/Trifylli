import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisDiatrofologioService } from './draseis-diatrofologio.service';
import { CreateMealVariantDto, UpdateMealDto, UpdateMealVariantDto } from './dto/drasi-diatrofologio.dto';

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

  @Get('allergies')
  @RequireDrasi('diatrofologio')
  @ApiOperation({ summary: 'Αλλεργίες & διατροφή από τις δηλώσεις υγείας — για την κουζίνα (καταγράφεται)' })
  foodNeeds(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.diatrofologio.foodNeeds(user, id);
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

  @Post(':itemId/variants')
  @RequireDrasi('diatrofologio', 'edit')
  @ApiOperation({ summary: 'Νέο παράλληλο γεύμα — δική του συνταγή, μενού και ποσολόγιο' })
  addVariant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CreateMealVariantDto,
  ) {
    return this.diatrofologio.addVariant(user, id, itemId, dto.label);
  }

  @Patch(':itemId/variants/:vid')
  @RequireDrasi('diatrofologio', 'edit')
  @ApiOperation({ summary: 'Όνομα, σειρά και «για ποιους» ενός παράλληλου γεύματος' })
  updateVariant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @Body() dto: UpdateMealVariantDto,
  ) {
    return this.diatrofologio.updateVariant(user, id, itemId, vid, dto);
  }

  @Delete(':itemId/variants/:vid')
  @RequireDrasi('diatrofologio', 'edit')
  @ApiOperation({ summary: 'Σβήνει ένα παράλληλο γεύμα και το κοινό του έγγραφο' })
  removeVariant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('vid', ParseUUIDPipe) vid: string,
  ) {
    return this.diatrofologio.removeVariant(user, id, itemId, vid);
  }
}
