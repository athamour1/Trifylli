import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisPlanService } from './draseis-plan.service';
import { CreateDrasiSymvoulioDto, ExternalYlikoDto, PurchaseShoppingItemDto, ShoppingItemDto } from './dto/drasi-plan.dto';

/** Πρόγραμμα, συμβούλια και υλικό μιας δράσης. */
@ApiTags('Δράσεις — πρόγραμμα & υλικό')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('draseis/:id')
export class DraseisPlanController {
  constructor(
    private readonly plan: DraseisPlanService,
    private readonly audit: AuditService,
  ) {}

  // ── Πρόγραμμα ──

  @Get('days')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Οι ημέρες της δράσης (μία συγκέντρωση η καθεμία)' })
  days(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.days(user, id);
  }

  @Post('days')
  @RequireCapability('syggentrwsh:write')
  @ApiOperation({ summary: 'Δημιουργία μίας ημέρας για κάθε ημερομηνία που λείπει' })
  createDays(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.createDays(user, id);
  }

  // ── Συμβούλια ──

  @Get('symvoulia')
  @RequireCapability('calendar:read')
  symvoulia(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.symvoulia(user, id);
  }

  @Post('symvoulia')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Νέο συμβούλιο προετοιμασίας για τη δράση' })
  createSymvoulio(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateDrasiSymvoulioDto) {
    return this.plan.createSymvoulio(user, id, dto);
  }

  // ── Υλικό ──

  @Get('yliko/loading-list')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Λίστα φόρτωσης: αγορές + αποθήκες + ξένο υλικό' })
  loadingList(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.loadingList(user, id);
  }

  @Post('yliko/shopping')
  @RequireCapability('drasi:write')
  addShopping(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShoppingItemDto) {
    return this.plan.addShopping(user, id, dto);
  }

  @Patch('yliko/shopping/:itemId')
  @RequireCapability('drasi:write')
  updateShopping(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ShoppingItemDto,
  ) {
    return this.plan.updateShopping(user, id, itemId, dto);
  }

  @Post('yliko/shopping/:itemId/purchase')
  @RequireCapability('drasi:write')
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

  @Delete('yliko/shopping/:itemId')
  @RequireCapability('drasi:write')
  removeShopping(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plan.removeShopping(user, id, itemId);
  }

  @Post('yliko/external')
  @RequireCapability('drasi:write')
  addExternal(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExternalYlikoDto) {
    return this.plan.addExternal(user, id, dto);
  }

  @Patch('yliko/external/:itemId/returned')
  @RequireCapability('drasi:write')
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
  @RequireCapability('drasi:write')
  removeExternal(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plan.removeExternal(user, id, itemId);
  }
}
