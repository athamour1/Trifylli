import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KladosType, SymvoulioType, TOPIKO_SYMVOULIA, can } from '@trifylli/shared';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { CreateSymvoulioDto, UpdateSymvoulioDto } from './dto/symvoulio.dto';
import { SymvouliaService } from './symvoulia.service';

/**
 * Ένας controller για τα δύο επίπεδα συμβουλίων.
 *
 * Η διάκριση δικαιωμάτων γίνεται ανά τύπο: τα συμβούλια Τοπικού/Στελεχών
 * απαιτούν `symvoulio:topiko:write`, τα συμβούλια κλάδου `symvoulio:klados:write`.
 * Ο έλεγχος είναι στο service για τα υπάρχοντα και στο `assertWriteCapability`
 * για τη δημιουργία, όπου ο τύπος έρχεται από το body.
 */
@ApiTags('Συμβούλια')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('symvoulia')
export class SymvouliaController {
  constructor(private readonly symvoulia: SymvouliaService) {}

  @Get()
  @RequireCapability('calendar:read')
  @ApiQuery({ name: 'type', enum: SymvoulioType, required: false })
  @ApiQuery({ name: 'klados', enum: KladosType, required: false })
  @ApiQuery({ name: 'drasiId', required: false })
  list(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: SymvoulioType,
    @Query('klados') klados?: KladosType,
    @Query('drasiId') drasiId?: string,
  ) {
    return this.symvoulia.list(user, type, klados, drasiId);
  }

  @Get(':id')
  @RequireCapability('calendar:read')
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.symvoulia.findOne(user, id);
  }

  @Post()
  @RequireCapability('symvoulio:klados:write')
  @ApiOperation({
    summary: 'Δημιουργία συμβουλίου',
    description: 'Τα συμβούλια Τοπικού/Στελεχών απαιτούν επιπλέον δικαίωμα `symvoulio:topiko:write`.',
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSymvoulioDto) {
    assertWriteCapability(user, dto.type);
    return this.symvoulia.create(user, dto);
  }

  @Patch(':id')
  @RequireCapability('symvoulio:klados:write')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSymvoulioDto,
  ) {
    return this.symvoulia.update(user, id, dto);
  }

  @Get(':id/stelexi')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Τα στελέχη που μπορούν να συμμετέχουν',
    description:
      'Σε συμβούλιο κλάδου τα στελέχη του κλάδου· σε συμβούλιο Τοπικού όλα τα στελέχη. ' +
      'Η επιλογή αποθηκεύεται από το `PATCH :id`, μαζί με τα υπόλοιπα.',
  })
  stelexi(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.symvoulia.stelexi(user, id);
  }

  @Delete(':id')
  @RequireCapability('symvoulio:klados:write')
  @ApiOperation({ summary: 'Αρχειοθέτηση συμβουλίου' })
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.symvoulia.archive(user, id);
  }

  @Post(':id/finalize')
  @RequireCapability('symvoulio:klados:write')
  @ApiOperation({ summary: 'Οριστικοποίηση πρακτικών (κλείδωμα)' })
  finalize(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.symvoulia.finalize(user, id);
  }
}

function assertWriteCapability(user: RequestUser, type: SymvoulioType): void {
  if (!(TOPIKO_SYMVOULIA as readonly string[]).includes(type)) return;
  const profile = { role: user.role, adminKlados: user.adminKlados };
  if (!can(profile, 'symvoulio:topiko:write')) {
    throw new ForbiddenException('Τα συμβούλια Τοπικού τα διαχειρίζεται ο υπερδιαχειριστής.');
  }
}
