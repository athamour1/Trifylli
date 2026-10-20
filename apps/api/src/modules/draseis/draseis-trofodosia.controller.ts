import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DrasiPermGuard } from './drasi-perm.guard';
import { DraseisTrofodosiaService } from './draseis-trofodosia.service';
import { CreateFoodPurchaseDto, SetBoughtDto, UpdateFoodPurchaseDto } from './dto/drasi-trofodosia.dto';

/** Η Τροφοδοσία: τι αγοράζουμε κάθε ημέρα — τα υλικά των γευμάτων και τα επιπλέον. */
@ApiTags('Δράσεις — τροφοδοσία')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id/trofodosia')
export class DraseisTrofodosiaController {
  constructor(private readonly trofodosia: DraseisTrofodosiaService) {}

  @Get()
  @RequireDrasi('trofodosia')
  @ApiOperation({ summary: 'Οι ημέρες της δράσης: τα υλικά των γευμάτων και όσα ζητήθηκαν επιπλέον' })
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trofodosia.view(user, id);
  }

  @Post()
  @RequireDrasi('trofodosia', 'edit')
  @ApiOperation({ summary: 'Κάτι να αγοραστεί μια ημέρα — λειτουργία, πρόγραμμα, αρχηγός, μαγείρισσα, τροφοδοσία' })
  add(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateFoodPurchaseDto) {
    return this.trofodosia.add(user, id, dto);
  }

  @Patch(':purchaseId')
  @RequireDrasi('trofodosia', 'edit')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body() dto: UpdateFoodPurchaseDto,
  ) {
    return this.trofodosia.update(user, id, purchaseId, dto);
  }

  @Delete(':purchaseId')
  @RequireDrasi('trofodosia', 'edit')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('purchaseId', ParseUUIDPipe) purchaseId: string) {
    return this.trofodosia.remove(user, id, purchaseId);
  }

  @Put(':purchaseId/bought')
  @RequireDrasi('purchase', 'edit')
  @ApiOperation({ summary: '«Αγοράστηκε» — η τροφοδοσία και ο αρχηγός' })
  setBought(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body() dto: SetBoughtDto,
  ) {
    return this.trofodosia.setBought(user, id, purchaseId, dto.bought);
  }

  @Put('meals/:itemId/ingredients/:ingredientId/bought')
  @RequireDrasi('purchase', 'edit')
  @ApiOperation({ summary: '«Αγοράστηκε» ενός υλικού γεύματος — το ίδιο τικ με το ποσολόγιο του γεύματος' })
  setIngredientBought(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Body() dto: SetBoughtDto,
  ) {
    return this.trofodosia.setIngredientBought(user, id, itemId, ingredientId, dto.bought);
  }

  @Put('meals/:itemId/variants/:variantId/ingredients/:ingredientId/bought')
  @RequireDrasi('purchase', 'edit')
  @ApiOperation({ summary: '«Αγοράστηκε» ενός υλικού παράλληλου γεύματος' })
  setVariantIngredientBought(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Body() dto: SetBoughtDto,
  ) {
    return this.trofodosia.setVariantIngredientBought(user, id, itemId, variantId, ingredientId, dto.bought);
  }
}
