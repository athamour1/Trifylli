import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
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
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, RequireCapability, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { CheckoutService } from '../yliko/checkout.service';
import { DraseisGroupsService } from './draseis-groups.service';
import { DraseisService } from './draseis.service';
import { DrasiActivityService } from './drasi-activity';
import { QueryGuestsDto } from './dto/drasi-groups.dto';
import { DrasiRoleKind } from '@trifylli/shared';
import {
  AddDrasiRoleDto,
  AddParticipantsDto,
  CreateDrasiDto,
  DeleteDrasiDto,
  SetDrasiClosedDto,
  QueryDraseisDto,
  SetDrasiKladoiDto,
  SetDrasiRolesDto,
  SetGuestTopikaDto,
  UpdateDrasiDto,
  UpdateParticipantDto,
} from './dto/drasi.dto';

@ApiTags('Δράσεις')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis')
export class DraseisController {
  constructor(
    private readonly draseis: DraseisService,
    private readonly checkouts: CheckoutService,
    private readonly groups: DraseisGroupsService,
    private readonly audit: AuditService,
    private readonly activity: DrasiActivityService,
  ) {}

  @Get()
  @RequireCapability('calendar:read')
  list(@CurrentUser() user: RequestUser, @Query() query: QueryDraseisDto) {
    return this.draseis.list(user, query);
  }

  // Χωρίς ικανότητα κλάδου: το βλέπει και ο εξωτερικός — φέρνει μόνο τις δικές του.
  @Get('mine')
  @ApiOperation({ summary: 'Οι δράσεις όπου είμαι στέλεχος (για την Αρχική)' })
  mine(@CurrentUser() user: RequestUser) {
    return this.draseis.mine(user);
  }

  // Χωρίς ικανότητα κλάδου, όπως το `mine`: κάθε δράση ελέγχεται μία-μία.
  @Get('presence')
  @ApiOperation({ summary: 'Ποιοι δουλεύουν τώρα σε κάθε δράση (για τις κάρτες της Αρχικής)' })
  presence(@CurrentUser() user: RequestUser, @Query('ids') ids?: string) {
    return this.activity.presence(user, (ids ?? '').split(',').filter(Boolean));
  }

  @Get('kataskinoseis')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Συγκεντρωτικά όλων των κατασκηνώσεων' })
  kataskinoseis(@CurrentUser() user: RequestUser) {
    return this.draseis.kataskinoseis(user);
  }

  // Οι στατικές διαδρομές πριν από το `:id`, αλλιώς το ParseUUIDPipe τις κόβει.

  @Get('guests')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Φιλοξενούμενοι άλλων Τοπικών που έχουν ξανάρθει' })
  guests(@CurrentUser() user: RequestUser, @Query() query: QueryGuestsDto) {
    return this.groups.guests(user, query.q);
  }

  @Get(':id')
  @RequireDrasi('episkopisi')
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.findOne(user, id);
  }

  @Get(':id/activity')
  @RequireDrasi('episkopisi')
  @ApiOperation({ summary: 'Η ροή δραστηριότητας της δράσης και πότε την είδες τελευταία φορά' })
  activityFeed(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activity.feed(user, id);
  }

  @Post(':id/activity/seen')
  @RequireDrasi('episkopisi')
  @ApiOperation({ summary: 'Είδα τη δράση τώρα — για το «τι άλλαξε από την τελευταία σου επίσκεψη»' })
  activitySeen(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activity.seen(user, id);
  }

  @Get(':id/stats')
  @RequireDrasi('episkopisi')
  @ApiOperation({
    summary: 'Στοιχεία ανά κλάδο',
    description: 'Στελέχη, κατασκηνωτές και δεσμευμένο υλικό ανά κλάδο — το φύλλο πριν την αναχώρηση.',
  })
  stats(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.kataskinosiStats(user, id);
  }

  @Get(':id/yliko')
  @RequireDrasi('yliko')
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
  @RequireDrasi('rythmiseis', 'edit')
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

  @Put(':id/closed')
  // Ο έλεγχος γίνεται στο service: το επιτρέπει και ο αρχηγός της δράσης,
  // που ως απλό στέλεχος δεν έχει `drasi:write`.
  @RequireDrasi('close', 'edit')
  @ApiOperation({ summary: 'Κλείσιμο ή άνοιγμα ξανά (αρχηγός δράσης, διαχειριστής κλάδου, υπερδιαχειριστής)' })
  async setClosed(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetDrasiClosedDto) {
    const result = await this.draseis.setClosed(user, id, dto.closed);
    await this.audit.record(user, 'drasi.status', 'drasi', id, { status: result.status });
    return result;
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
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Ποιοι δικοί μας κλάδοι συμμετέχουν (αντικατάσταση συνόλου)' })
  setKladoi(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDrasiKladoiDto,
  ) {
    return this.draseis.setKladoi(user, id, dto);
  }

  @Put(':id/guest-topika')
  @RequireDrasi('rythmiseis', 'edit')
  @ApiOperation({ summary: 'Φιλοξενούμενα Τοπικά (αντικατάσταση συνόλου)' })
  setGuestTopika(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetGuestTopikaDto,
  ) {
    return this.draseis.setGuestTopika(user, id, dto);
  }

  @Post(':id/roles/:kind/:userId')
  @RequireDrasi('arxigeio', 'edit')
  @ApiOperation({ summary: 'Ένας ρόλος σε ένα στέλεχος (χωρίς να σταλεί όλο το αρχηγείο)' })
  addRole(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(DrasiRoleKind)) kind: DrasiRoleKind,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AddDrasiRoleDto,
  ) {
    return this.draseis.addRole(user, id, kind, userId, dto.note);
  }

  @Delete(':id/roles/:kind/:userId')
  @RequireDrasi('arxigeio', 'edit')
  @ApiOperation({ summary: 'Ένας ρόλος φεύγει από ένα στέλεχος' })
  removeRole(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(DrasiRoleKind)) kind: DrasiRoleKind,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.draseis.removeRole(user, id, kind, userId);
  }

  @Put(':id/roles')
  @RequireDrasi('arxigeio', 'edit')
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
  @RequireDrasi('participants', 'edit')
  @ApiOperation({ summary: 'Προσθήκη συμμετεχόντων (idempotent)' })
  addParticipants(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.draseis.addParticipants(user, id, dto);
  }

  @Patch(':id/participants/:memberId')
  @RequireDrasi('participants', 'edit')
  updateParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.draseis.updateParticipant(user, id, memberId, dto);
  }

  @Delete(':id/participants/:memberId')
  @RequireDrasi('participants', 'edit')
  removeParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.draseis.removeParticipant(user, id, memberId);
  }
}
