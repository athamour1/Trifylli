import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisMythosService } from './draseis-mythos.service';
import { CreateCharacterDto, OrderCharactersDto, UpdateCharacterDto, UpdateMythosDto } from './dto/drasi-mythos.dto';

/** Ο μύθος μιας δράσης και οι ρόλοι των στελεχών. */
@ApiTags('Δράσεις — μύθος')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('draseis/:id')
export class DraseisMythosController {
  constructor(private readonly mythos: DraseisMythosService) {}

  @Get('mythos')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Ο μύθος, οι ρόλοι και τα στελέχη που μπορούν να τους παίξουν' })
  view(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mythos.view(user, id);
  }

  @Put('mythos')
  @RequireCapability('drasi:write')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMythosDto) {
    return this.mythos.update(user, id, dto);
  }

  @Post('characters')
  @RequireCapability('drasi:write')
  create(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCharacterDto) {
    return this.mythos.createCharacter(user, id, dto);
  }

  // Πριν από το `:characterId`, αλλιώς το «order» θα διαβαζόταν ως id.
  @Put('characters/order')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Νέα σειρά ρόλων (όλα τα ids)' })
  order(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderCharactersDto) {
    return this.mythos.orderCharacters(user, id, dto);
  }

  @Patch('characters/:characterId')
  @RequireCapability('drasi:write')
  updateCharacter(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.mythos.updateCharacter(user, id, characterId, dto);
  }

  @Delete('characters/:characterId')
  @RequireCapability('drasi:write')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('characterId', ParseUUIDPipe) characterId: string,
  ) {
    return this.mythos.deleteCharacter(user, id, characterId);
  }
}
