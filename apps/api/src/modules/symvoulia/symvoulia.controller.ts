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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KladosType, SymvoulioType, TOPIKO_SYMVOULIA, can } from '@trifylli/shared';
import { accessProfileOf } from '../../common/util/klados-scope';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { OpenPollDto, PollVoteDto } from './dto/symvoulio-poll.dto';
import { CreateSymvoulioDto, UpdateSymvoulioDto } from './dto/symvoulio.dto';
import { SymvouliaPollsService } from './symvoulia-polls.service';
import { SymvouliaService } from './symvoulia.service';

/**
 * Ένας controller για τα δύο επίπεδα συμβουλίων — και τα συμβούλια των δράσεων.
 *
 * Η διάκριση δικαιωμάτων γίνεται ανά συμβούλιο: της δράσης ακολουθεί τους
 * ρόλους της δράσης, του Τοπικού/Στελεχών απαιτεί `symvoulio:topiko:write`,
 * του κλάδου `symvoulio:klados:write`. Για τα υπάρχοντα (`:id`) ο έλεγχος είναι
 * μόνο στο service (`SymvoulioAccess`): ένα guard ικανότητας θα έκοβε το
 * εξωτερικό στέλεχος με ρόλο στη δράση. Για τη δημιουργία, όπου ο τύπος έρχεται
 * από το body, στο `assertWriteCapability`.
 */
@ApiTags('Συμβούλια')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('symvoulia')
export class SymvouliaController {
  constructor(
    private readonly symvoulia: SymvouliaService,
    private readonly polls: SymvouliaPollsService,
  ) {}

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
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSymvoulioDto,
  ) {
    return this.symvoulia.update(user, id, dto);
  }

  @Get(':id/stelexi')
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
  @ApiOperation({ summary: 'Αρχειοθέτηση συμβουλίου' })
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.symvoulia.archive(user, id);
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Οριστικοποίηση πρακτικών (κλείδωμα)' })
  finalize(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.symvoulia.finalize(user, id);
  }

  // ── Ψηφοφορίες ──

  @Get(':id/polls')
  @ApiOperation({ summary: 'Οι ψηφοφορίες του συμβουλίου, με τα αποτελέσματα' })
  listPolls(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.polls.list(user, id);
  }

  @Post(':id/polls')
  @ApiOperation({ summary: 'Νέα ψηφοφορία — όποιος γράφει το συμβούλιο' })
  openPoll(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OpenPollDto) {
    return this.polls.open(user, id, dto);
  }

  @Put(':id/polls/:pollId/vote')
  @ApiOperation({ summary: 'Η ψήφος ενός συμμετέχοντα' })
  async vote(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: PollVoteDto,
  ) {
    await this.polls.vote(user, id, pollId, dto.choice);
    return { ok: true };
  }

  @Post(':id/polls/:pollId/close')
  @ApiOperation({ summary: 'Κλείσιμο — το αποτέλεσμα μπαίνει στα πρακτικά' })
  async closePoll(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('pollId', ParseUUIDPipe) pollId: string) {
    await this.polls.close(user, id, pollId);
    return { ok: true };
  }

  @Delete(':id/polls/:pollId')
  @ApiOperation({ summary: 'Διαγραφή ψηφοφορίας' })
  async removePoll(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('pollId', ParseUUIDPipe) pollId: string) {
    await this.polls.remove(user, id, pollId);
    return { ok: true };
  }
}

function assertWriteCapability(user: RequestUser, type: SymvoulioType): void {
  if (!(TOPIKO_SYMVOULIA as readonly string[]).includes(type)) return;
  if (!can(accessProfileOf(user), 'symvoulio:topiko:write')) {
    throw new ForbiddenException('Τα συμβούλια Τοπικού τα διαχειρίζεται ο υπερδιαχειριστής.');
  }
}
