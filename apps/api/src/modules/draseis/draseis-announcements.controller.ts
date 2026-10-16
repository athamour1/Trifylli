import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { QuietChange } from '../collab/live-changes';
import { DraseisAnnouncementsService } from './draseis-announcements.service';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CreateAnnouncementDto, SeenAnnouncementsDto } from './dto/drasi-announcements.dto';

/** Ανακοινώσεις προς τα στελέχη μιας δράσης — με «το είδαν», χωρίς απαντήσεις. */
@ApiTags('Δράσεις — ανακοινώσεις')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisAnnouncementsController {
  constructor(private readonly announcements: DraseisAnnouncementsService) {}

  @Get('announcements')
  @RequireDrasi('episkopisi')
  @ApiOperation({ summary: 'Οι ανακοινώσεις της δράσης, νεότερη πρώτη, με το ποιος τις είδε' })
  list(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.list(user, id);
  }

  @Post('announcements')
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Νέα ανακοίνωση — ο Αρχηγός της δράσης και όποιος έχει τις Ρυθμίσεις' })
  create(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(user, id, dto.body, dto.roles ?? []);
  }

  @Post('announcements/seen')
  @RequireDrasi('episkopisi')
  @QuietChange()
  @ApiOperation({ summary: '«Τις είδα»' })
  async seen(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SeenAnnouncementsDto) {
    await this.announcements.seen(user, id, dto.ids);
    return { ok: true };
  }

  @Delete('announcements/:announcementId')
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Διαγραφή ανακοίνωσης' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
  ) {
    await this.announcements.remove(user, id, announcementId);
    return { ok: true };
  }
}
