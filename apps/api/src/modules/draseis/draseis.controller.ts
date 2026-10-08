import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { CheckoutService } from '../yliko/checkout.service';
import { DraseisGroupsService } from './draseis-groups.service';
import { DraseisService } from './draseis.service';
import { QueryGuestsDto } from './dto/drasi-groups.dto';
import {
  AddParticipantsDto,
  CreateDrasiDto,
  DeleteDrasiDto,
  QueryDraseisDto,
  RolesTemplateQueryDto,
  SetDrasiKladoiDto,
  SetDrasiRolesDto,
  SetGuestTopikaDto,
  UpdateDrasiDto,
  UpdateParticipantDto,
} from './dto/drasi.dto';

@ApiTags('Δράσεις')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('draseis')
export class DraseisController {
  constructor(
    private readonly draseis: DraseisService,
    private readonly checkouts: CheckoutService,
    private readonly groups: DraseisGroupsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireCapability('calendar:read')
  list(@CurrentUser() user: RequestUser, @Query() query: QueryDraseisDto) {
    return this.draseis.list(user, query);
  }

  @Get('kataskinoseis')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Συγκεντρωτικά όλων των κατασκηνώσεων' })
  kataskinoseis(@CurrentUser() user: RequestUser) {
    return this.draseis.kataskinoseis(user);
  }

  // Οι στατικές διαδρομές πριν από το `:id`, αλλιώς το ParseUUIDPipe τις κόβει.

  @Get('roles-template')
  @RequireCapability('drasi:write')
  @ApiOperation({
    summary: '«Ίδια όπως την προηγούμενη»',
    description: 'Οι ευθύνες (αρχηγείο & υπηρεσίες) της πιο πρόσφατης δράσης του ίδιου φορέα.',
  })
  rolesTemplate(@CurrentUser() user: RequestUser, @Query() query: RolesTemplateQueryDto) {
    return this.draseis.rolesTemplate(user, query);
  }

  @Get('guests')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Φιλοξενούμενοι άλλων Τοπικών που έχουν ξανάρθει' })
  guests(@CurrentUser() user: RequestUser, @Query() query: QueryGuestsDto) {
    return this.groups.guests(user, query.q);
  }

  @Get('eseo-topiko/:code')
  @RequireCapability('drasi:write')
  @ApiOperation({
    summary: 'Τοπικό από το e-SEO με τον κωδικό του',
    description: 'Για φιλοξενούμενα Τοπικά: ο κωδικός (unitId) δίνει το επίσημο όνομα και τον Τομέα.',
  })
  eseoTopiko(@Param('code') code: string) {
    return this.draseis.eseoTopiko(code);
  }

  @Get(':id')
  @RequireCapability('calendar:read')
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.findOne(user, id);
  }

  @Get(':id/stats')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Στοιχεία ανά κλάδο',
    description: 'Στελέχη, κατασκηνωτές και δεσμευμένο υλικό ανά κλάδο — το φύλλο πριν την αναχώρηση.',
  })
  stats(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.kataskinosiStats(user, id);
  }

  @Get(':id/yliko')
  @RequireCapability('yliko:read')
  @ApiOperation({ summary: 'Τι υλικό έχει δεσμευτεί για τη δράση' })
  yliko(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkouts.listForDrasi(user, id);
  }

  @Post()
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Νέα δράση', description: 'Με `draft: true` γεννιέται ως προσχέδιο (βήμα 1 του wizard).' })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateDrasiDto) {
    const drasi = await this.draseis.create(user, dto);
    await this.audit.record(user, 'drasi.create', 'drasi', drasi.id, {
      type: dto.type,
      klados: dto.kladosType ?? null,
      draft: dto.draft ?? false,
    });
    return drasi;
  }

  @Patch(':id')
  @RequireCapability('drasi:write')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDrasiDto,
  ) {
    const drasi = await this.draseis.update(user, id, dto);
    // Η αλλαγή κατάστασης (ενεργοποίηση, κλείσιμο) είναι η μόνη που αξίζει ίχνος.
    if (dto.status) await this.audit.record(user, 'drasi.status', 'drasi', id, { status: dto.status });
    return drasi;
  }

  @Delete(':id')
  @RequireCapability('drasi:write')
  async archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.draseis.archive(user, id);
    await this.audit.record(user, 'drasi.archive', 'drasi', id);
    return result;
  }

  @Get(':id/deletion')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Τι εμποδίζει την οριστική διαγραφή (χρήματα, υλικό που δεν γύρισε)' })
  async deletion(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return { blockers: await this.draseis.deletionBlockers(user, id) };
  }

  @Post(':id/delete')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Οριστική διαγραφή — με τον τίτλο της δράσης ως επιβεβαίωση' })
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteDrasiDto) {
    const removed = await this.draseis.remove(user, id, dto.confirmTitle);
    // Η εγγραφή φεύγει· το ίχνος κρατά τον τίτλο για να ξέρουμε τι ήταν.
    await this.audit.record(user, 'drasi.delete', 'drasi', id, { title: removed.title });
    return { ok: true };
  }

  // ───────────────────────── Wizard ─────────────────────────

  @Put(':id/kladoi')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Ποιοι δικοί μας κλάδοι συμμετέχουν (αντικατάσταση συνόλου)' })
  setKladoi(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDrasiKladoiDto,
  ) {
    return this.draseis.setKladoi(user, id, dto);
  }

  @Put(':id/guest-topika')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Φιλοξενούμενα Τοπικά (αντικατάσταση συνόλου)' })
  setGuestTopika(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetGuestTopikaDto,
  ) {
    return this.draseis.setGuestTopika(user, id, dto);
  }

  @Put(':id/roles')
  @RequireCapability('drasi:write')
  @ApiOperation({
    summary: 'Αρχηγείο & υπηρεσίες (αντικατάσταση συνόλου)',
    description: 'Υπηρεσία που δεν ισχύει = καμία γραμμή της. Περισσότερα από ένα άτομα ανά ευθύνη επιτρέπονται.',
  })
  setRoles(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDrasiRolesDto,
  ) {
    return this.draseis.setRoles(user, id, dto);
  }

  // ───────────────────────── Συμμετέχοντες ─────────────────────────

  @Post(':id/participants')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Προσθήκη συμμετεχόντων (idempotent)' })
  addParticipants(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.draseis.addParticipants(user, id, dto);
  }

  @Patch(':id/participants/:memberId')
  @RequireCapability('drasi:write')
  updateParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.draseis.updateParticipant(user, id, memberId, dto);
  }

  @Delete(':id/participants/:memberId')
  @RequireCapability('drasi:write')
  removeParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.draseis.removeParticipant(user, id, memberId);
  }
}
