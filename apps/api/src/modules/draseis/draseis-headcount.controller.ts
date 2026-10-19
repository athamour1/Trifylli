import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisHeadcountService } from './draseis-headcount.service';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CloseHeadcountDto, HeadcountCheckDto, StartHeadcountDto } from './dto/drasi-headcount.dto';

/** Καταμέτρηση: ο Αρχηγός ξεκινά, κάθε στέλεχος μετρά μια ομάδα, όλοι βλέπουν ζωντανά. */
@ApiTags('Δράσεις — καταμέτρηση')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisHeadcountController {
  constructor(private readonly headcounts: DraseisHeadcountService) {}

  @Get('headcounts')
  @RequireDrasi('episkopisi')
  @ApiOperation({ summary: 'Οι καταμετρήσεις της δράσης, νεότερη πρώτη, με τις ομάδες τους' })
  list(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.headcounts.list(user, id);
  }

  @Post('headcounts')
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Νέα καταμέτρηση — ο Αρχηγός της δράσης' })
  start(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartHeadcountDto) {
    return this.headcounts.start(user, id, dto.title, dto.groupKind);
  }

  @Put('headcounts/:headcountId/groups/:groupId')
  @RequireDrasi('episkopisi')
  @ApiOperation({ summary: 'Μια ομάδα μετρήθηκε — από οποιοδήποτε στέλεχος· κρατιέται η νεότερη' })
  async check(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('headcountId', ParseUUIDPipe) headcountId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: HeadcountCheckDto,
  ) {
    await this.headcounts.check(user, id, headcountId, groupId, dto.absentIds, dto.checkedAt);
    return { ok: true };
  }

  @Post('headcounts/:headcountId/close')
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Τέλος καταμέτρησης — ή ξανά ανοιχτή' })
  async close(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('headcountId', ParseUUIDPipe) headcountId: string,
    @Body() dto: CloseHeadcountDto,
  ) {
    await this.headcounts.close(user, id, headcountId, dto.closed);
    return { ok: true };
  }

  @Delete('headcounts/:headcountId')
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Διαγραφή καταμέτρησης — μαζί με τις μετρήσεις των ομάδων' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('headcountId', ParseUUIDPipe) headcountId: string,
  ) {
    await this.headcounts.remove(user, id, headcountId);
    return { ok: true };
  }
}
