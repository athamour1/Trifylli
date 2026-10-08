import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { KladosType } from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AccountsService } from '../accounts/accounts.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability, SuperAdminOnly } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { UpdateKladosDto, UpdateMembershipDto } from './dto/topiko.dto';
import { TopikoService } from './topiko.service';

@ApiTags('Τοπικό & Κλάδοι')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller()
export class TopikoController {
  constructor(
    private readonly topiko: TopikoService,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Προφίλ συνδεδεμένου χρήστη',
    description: 'Ρόλος, κλάδοι, τρέχουσα περίοδος και λεξικά ετικετών σε ένα request.',
  })
  me(@CurrentUser() user: RequestUser) {
    return this.topiko.me(user);
  }

  @Post('me/password-link')
  // Στέλνει email: αυστηρό όριο, όπως και η πρόσκληση από τον υπερδιαχειριστή.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Σύνδεσμος αλλαγής κωδικού στο email μου',
    description:
      'Το Trifylli δεν βλέπει ποτέ κωδικό: το Authentik στέλνει σύνδεσμο ορισμού νέου κωδικού ' +
      'στο email του συνδεδεμένου λογαριασμού. Για όποιον δεν θυμάται τον τρέχοντα.',
  })
  async passwordLink(@CurrentUser() user: RequestUser) {
    const result = await this.accounts.inviteSelf(user);
    await this.audit.record(user, 'account.password_link', 'user', user.id);
    return result;
  }

  @Get('kladoi')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Οι κλάδοι με πλήθη μελών και υποομάδες' })
  kladoi(@CurrentUser() user: RequestUser) {
    return this.topiko.kladoi(user);
  }

  @Patch('kladoi/:klados')
  @RequireCapability('meloi:manage')
  @ApiParam({ name: 'klados', enum: KladosType })
  updateKlados(
    @CurrentUser() user: RequestUser,
    @Param('klados') klados: KladosType,
    @Body() dto: UpdateKladosDto,
  ) {
    return this.topiko.updateKlados(user, klados, dto);
  }

  @Put('meloi/:memberId/membership')
  @RequireCapability('meloi:manage')
  @ApiOperation({ summary: 'Τοποθέτηση μέλους σε κλάδο και υποομάδα' })
  setMembership(
    @CurrentUser() user: RequestUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.topiko.setMembership(user, memberId, dto);
  }

  @Get('setup-check')
  @SuperAdminOnly()
  @ApiOperation({
    summary: 'Διαγνωστικό ρυθμίσεων',
    description: 'Τι λείπει για να λειτουργήσει το Τοπικό: λογαριασμοί, περίοδος, κλάδοι, στόχοι.',
  })
  setupCheck(@CurrentUser() user: RequestUser) {
    return this.topiko.setupCheck(user);
  }
}
