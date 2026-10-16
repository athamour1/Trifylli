import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisPlanService } from './draseis-plan.service';
import {
  AddDelayDto,
  ClaimShoppingDto,
  CopyDayDto,
  CreateDrasiSymvoulioDto,
  CreateScheduleItemDto,
  DayStartDto,
  ExternalYlikoDto,
  LoadedDto,
  MoveScheduleItemDto,
  ReorderScheduleDto,
  PurchaseShoppingItemDto,
  ShoppingItemDto,
  UpdateScheduleItemDto,
} from './dto/drasi-plan.dto';

/** Πρόγραμμα, συμβούλια και υλικό μιας δράσης. */
@ApiTags('Δράσεις — πρόγραμμα & υλικό')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisPlanController {
  constructor(
    private readonly plan: DraseisPlanService,
    private readonly audit: AuditService,
  ) {}

  // ── Ωρολόγιο & προγραμματικό ──

  @Get('schedule')
  @RequireDrasi('programma')
  @ApiOperation({ summary: 'Το ωρολόγιο ανά ημέρα — ώρες υπολογισμένες από την έναρξη και τις διάρκειες' })
  schedule(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.scheduleView(user, id);
  }

  @Put('schedule/reorder')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Νέα σειρά στοιχείων μιας ημέρας' })
  reorder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderScheduleDto) {
    return this.plan.reorder(user, id, dto);
  }

  @Post('schedule/:itemId/move')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Μετακίνηση στοιχείου μέσα στην ημέρα του (μετά από άλλο)' })
  move(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: MoveScheduleItemDto,
  ) {
    return this.plan.moveScheduleItem(user, id, itemId, dto.afterId ?? null);
  }

  @Post('schedule/delays')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: '«Καθυστερούμε N΄ από εδώ και πέρα» — οι επόμενες ώρες μετακινούνται για όλους' })
  addDelay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddDelayDto) {
    return this.plan.addDelay(user, id, dto.itemId, dto.minutes);
  }

  @Delete('schedule/delays/:delayId')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Αναίρεση μιας καθυστέρησης' })
  async removeDelay(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('delayId', ParseUUIDPipe) delayId: string,
  ) {
    await this.plan.removeDelay(user, id, delayId);
    return { ok: true };
  }

  @Patch('schedule/day-start')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Ώρα έναρξης μιας ημέρας (όχι της πρώτης — αυτή έρχεται από το Στήσιμο)' })
  dayStart(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DayStartDto) {
    return this.plan.setDayStart(user, id, dto);
  }

  @Post('schedule')
  @RequireDrasi('programma', 'edit')
  addScheduleItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateScheduleItemDto) {
    return this.plan.addScheduleItem(user, id, dto);
  }

  // Μόνο «βλέπει»: οι υπεύθυνοι του στοιχείου γράφουν το προγραμματικό του χωρίς
  // ρόλο Προγράμματος — πόσο αλλάζει ο καθένας το κρίνει το service.
  @Patch('schedule/:itemId')
  @RequireDrasi('programma')
  @ApiOperation({ summary: 'Αλλαγή πλαισίου ή/και προγραμματικού ενός στοιχείου (οι υπεύθυνοί του: μόνο το προγραμματικό)' })
  updateScheduleItem(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateScheduleItemDto,
  ) {
    return this.plan.updateScheduleItem(user, id, itemId, dto);
  }

  @Delete('schedule/:itemId')
  @RequireDrasi('programma', 'edit')
  removeScheduleItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plan.removeScheduleItem(user, id, itemId);
  }

  @Post('schedule/copy-day')
  @RequireDrasi('programma', 'edit')
  @ApiOperation({ summary: 'Αντιγραφή του ωρολογίου μιας ημέρας σε άλλη' })
  copyDay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CopyDayDto) {
    return this.plan.copyDay(user, id, dto);
  }

  // ── Συμβούλια ──

  @Get('symvoulia')
  @RequireDrasi('symvoulia')
  symvoulia(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.symvoulia(user, id);
  }

  @Post('symvoulia')
  @RequireDrasi('symvoulia', 'edit')
  @ApiOperation({ summary: 'Νέο συμβούλιο προετοιμασίας για τη δράση' })
  createSymvoulio(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateDrasiSymvoulioDto) {
    return this.plan.createSymvoulio(user, id, dto);
  }

  // ── Υλικό ──

  @Get('yliko/loading-list')
  @RequireDrasi('yliko')
  @ApiOperation({ summary: 'Λίστα φόρτωσης: αγορές + αποθήκες + ξένο υλικό' })
  loadingList(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.loadingList(user, id);
  }

  @Post('yliko/shopping')
  @RequireDrasi('yliko', 'edit')
  addShopping(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShoppingItemDto) {
    return this.plan.addShopping(user, id, dto);
  }

  @Patch('yliko/shopping/:itemId')
  @RequireDrasi('yliko', 'edit')
  updateShopping(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ShoppingItemDto,
  ) {
    return this.plan.updateShopping(user, id, itemId, dto);
  }

  @Post('yliko/shopping/:itemId/purchase')
  @RequireDrasi('yliko', 'edit')
  @ApiOperation({ summary: 'Αγοράστηκε: έξοδο στο ταμείο της δράσης, προαιρετικά και είδος αποθήκης' })
  async purchase(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: PurchaseShoppingItemDto,
  ) {
    const result = await this.plan.purchase(user, id, itemId, dto);
    await this.audit.record(user, 'drasi.treasury.create', 'treasury_entry', result.treasuryEntryId, {
      drasiId: id,
      kind: 'EXPENSE',
      amount: dto.amount,
      shoppingItemId: itemId,
    });
    return result;
  }

  @Post('yliko/shopping/:itemId/claim')
  @RequireDrasi('yliko')
  @ApiOperation({ summary: '«Το παίρνω εγώ» — ή «δεν το παίρνω»' })
  async claimShopping(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ClaimShoppingDto,
  ) {
    await this.plan.claimShopping(user, id, itemId, dto.claim);
    return { ok: true };
  }

  @Post('yliko/checkouts/:checkoutId/loaded')
  @RequireDrasi('yliko')
  @ApiOperation({ summary: '«Μπήκε» στη φόρτωση — υλικό από τις αποθήκες' })
  async checkoutLoaded(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
    @Body() dto: LoadedDto,
  ) {
    await this.plan.setLoaded(user, id, 'checkout', checkoutId, dto.loaded);
    return { ok: true };
  }

  @Post('yliko/external/:itemId/loaded')
  @RequireDrasi('yliko')
  @ApiOperation({ summary: '«Μπήκε» στη φόρτωση — υλικό που φέρνουν άλλοι' })
  async externalLoaded(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: LoadedDto,
  ) {
    await this.plan.setLoaded(user, id, 'external', itemId, dto.loaded);
    return { ok: true };
  }

  @Delete('yliko/shopping/:itemId')
  @RequireDrasi('yliko', 'edit')
  removeShopping(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plan.removeShopping(user, id, itemId);
  }

  @Post('yliko/external')
  @RequireDrasi('yliko', 'edit')
  addExternal(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExternalYlikoDto) {
    return this.plan.addExternal(user, id, dto);
  }

  @Patch('yliko/external/:itemId/returned')
  @RequireDrasi('yliko', 'edit')
  @ApiOperation({ summary: 'Επιστράφηκε στον κάτοχό του (ή αναίρεση)' })
  toggleReturned(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { returned?: boolean },
  ) {
    return this.plan.toggleReturned(user, id, itemId, body.returned !== false);
  }

  @Delete('yliko/external/:itemId')
  @RequireDrasi('yliko', 'edit')
  removeExternal(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plan.removeExternal(user, id, itemId);
  }
}
