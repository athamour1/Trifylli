import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { KladosType } from '@trifylli/shared';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { CreateGoalDto, ProodosEntryDto, UpdateEntryDto, UpdateProodosDto } from './dto/proodos.dto';
import { ProodosService } from './proodos.service';

@ApiTags('Ατομική πρόοδος')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('proodos')
export class ProodosController {
  constructor(private readonly proodos: ProodosService) {}

  @Get('klados/:klados/goals')
  @RequireCapability('meloi:read')
  @ApiParam({ name: 'klados', enum: KladosType })
  @ApiOperation({ summary: 'Κατάλογος στόχων κλάδου' })
  goals(@CurrentUser() user: RequestUser, @Param('klados') klados: KladosType) {
    return this.proodos.goals(user, klados);
  }

  @Post('klados/:klados/goals')
  @RequireCapability('proodos:write')
  @ApiParam({ name: 'klados', enum: KladosType })
  createGoal(
    @CurrentUser() user: RequestUser,
    @Param('klados') klados: KladosType,
    @Body() dto: CreateGoalDto,
  ) {
    return this.proodos.createGoal(user, klados, dto);
  }

  @Get('klados/:klados/grid')
  @RequireCapability('meloi:read')
  @ApiParam({ name: 'klados', enum: KladosType })
  @ApiOperation({
    summary: 'Πίνακας προόδου κλάδου',
    description: 'Πλήρες πλέγμα μέλη × στόχοι, ώστε το UI να λειτουργεί offline.',
  })
  grid(@CurrentUser() user: RequestUser, @Param('klados') klados: KladosType) {
    return this.proodos.grid(user, klados);
  }

  @Get('member/:memberId')
  @RequireCapability('meloi:read')
  @ApiOperation({ summary: 'Ατομική καρτέλα προόδου' })
  forMember(@CurrentUser() user: RequestUser, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.proodos.forMember(user, memberId);
  }

  @Put('member/:memberId')
  @RequireCapability('proodos:write')
  @ApiOperation({ summary: 'Καταχώρηση προόδου σε στόχο' })
  setRecord(
    @CurrentUser() user: RequestUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateProodosDto,
  ) {
    return this.proodos.setRecord(user, memberId, dto);
  }

  // ── Καρτέλα Ατομικής Προόδου (entries) — Οδηγοί & Μεγάλοι Οδηγοί ──

  @Get('card/:klados/members')
  @RequireCapability('meloi:read')
  @ApiParam({ name: 'klados', enum: KladosType })
  @ApiOperation({ summary: 'Μέλη κλάδου με τις εγγραφές προόδου τους' })
  cardMembers(@CurrentUser() user: RequestUser, @Param('klados') klados: KladosType) {
    return this.proodos.cardMembers(user, klados);
  }

  @Get('card/member/:memberId')
  @RequireCapability('meloi:read')
  @ApiOperation({ summary: 'Καρτέλα Ατομικής Προόδου μέλους' })
  card(@CurrentUser() user: RequestUser, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.proodos.card(user, memberId);
  }

  @Post('card/member/:memberId/entry')
  @RequireCapability('proodos:write')
  @ApiOperation({ summary: 'Προσθήκη εγγραφής προόδου' })
  addEntry(
    @CurrentUser() user: RequestUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: ProodosEntryDto,
  ) {
    return this.proodos.addEntry(user, memberId, dto);
  }

  @Put('card/entry/:entryId')
  @RequireCapability('proodos:write')
  @ApiOperation({ summary: 'Επεξεργασία εγγραφής προόδου' })
  updateEntry(
    @CurrentUser() user: RequestUser,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.proodos.updateEntry(user, entryId, dto);
  }

  @Delete('card/entry/:entryId')
  @RequireCapability('proodos:write')
  @ApiOperation({ summary: 'Διαγραφή εγγραφής προόδου' })
  deleteEntry(@CurrentUser() user: RequestUser, @Param('entryId', ParseUUIDPipe) entryId: string) {
    return this.proodos.deleteEntry(user, entryId);
  }
}
