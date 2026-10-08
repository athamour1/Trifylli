import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisGroupsService } from './draseis-groups.service';
import { CreateGroupDto, CreateGuestDto, SetGroupMembersDto, UpdateGroupDto } from './dto/drasi-groups.dto';

/** Φιλοξενούμενοι και ομάδες μιας δράσης. */
@ApiTags('Δράσεις — ομάδες')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisGroupsController {
  constructor(
    private readonly groups: DraseisGroupsService,
    private readonly audit: AuditService,
  ) {}

  @Post('guests')
  @RequireDrasi('participants', 'edit')
  @ApiOperation({ summary: 'Νέος φιλοξενούμενος από άλλο Τοπικό — μπαίνει κατευθείαν στη δράση' })
  async createGuest(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGuestDto) {
    const guest = await this.groups.createGuest(user, id, dto);
    await this.audit.record(user, 'drasi.guest.create', 'user', guest.id, { drasiId: id, topikoCode: dto.topikoCode });
    return guest;
  }

  @Get('groups')
  @RequireDrasi('omades')
  @ApiOperation({ summary: 'Ομάδες (πεντάδες/φωλιές/ενωμοτίες/σκηνές) με τα μέλη τους' })
  list(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.groups(user, id);
  }

  @Post('groups')
  @RequireDrasi('omades', 'edit')
  create(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGroupDto) {
    return this.groups.createGroup(user, id, dto);
  }

  @Patch('groups/:groupId')
  @RequireDrasi('omades', 'edit')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.updateGroup(user, id, groupId, dto);
  }

  @Delete('groups/:groupId')
  @RequireDrasi('omades', 'edit')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.deleteGroup(user, id, groupId);
  }

  @Put('groups/:groupId/members')
  @RequireDrasi('omades', 'edit')
  @ApiOperation({ summary: 'Τα μέλη της ομάδας (αντικατάσταση)· μεταφέρει όποιον ήταν σε άλλη του ίδιου είδους' })
  setMembers(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: SetGroupMembersDto,
  ) {
    return this.groups.setMembers(user, id, groupId, dto);
  }
}
