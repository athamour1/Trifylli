import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DateRangeDto } from '../../common/dto/date-range.dto';
import { CheckoutService } from './checkout.service';
import {
  CreateCheckoutDto,
  CreateMaintenanceDto,
  CreateStoragePointDto,
  CreateYlikoDto,
  QueryStoragePointDto,
  QueryYlikoDto,
  ReturnCheckoutDto,
  UpdateStoragePointDto,
  UpdateYlikoDto,
} from './dto/yliko.dto';
import { YlikoService } from './yliko.service';

@ApiTags('Υλικό')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('yliko')
export class YlikoController {
  constructor(
    private readonly yliko: YlikoService,
    private readonly checkouts: CheckoutService,
  ) {}

  @Get()
  @RequireCapability('yliko:read')
  @ApiOperation({
    summary: 'Λίστα υλικού',
    description: 'Με `from`/`to` επιστρέφει διαθεσιμότητα για το διάστημα (μέγιστη ταυτόχρονη δέσμευση).',
  })
  list(@CurrentUser() user: RequestUser, @Query() query: QueryYlikoDto) {
    return this.yliko.list(user, query);
  }

  @Get('summary')
  @RequireCapability('yliko:read')
  @ApiOperation({ summary: 'Συγκεντρωτικά ανά κατηγορία και κλάδο' })
  summary(@CurrentUser() user: RequestUser) {
    return this.yliko.summary(user);
  }

  @Get('alerts')
  @RequireCapability('yliko:read')
  @ApiOperation({ summary: 'Χαμηλό απόθεμα και επικείμενες λήξεις' })
  alerts(@CurrentUser() user: RequestUser) {
    return this.yliko.alerts(user);
  }

  // ───────────────────────── Σημεία αποθήκευσης ─────────────────────────

  @Get('storage-points')
  @RequireCapability('yliko:read')
  @ApiOperation({ summary: 'Σημεία αποθήκευσης (ανά κλάδο + κεντρικά)' })
  listStoragePoints(@CurrentUser() user: RequestUser, @Query() query: QueryStoragePointDto) {
    return this.yliko.listStoragePoints(user, query.klados);
  }

  @Post('storage-points')
  @RequireCapability('yliko:manage')
  @ApiOperation({ summary: 'Νέο σημείο αποθήκευσης' })
  createStoragePoint(@CurrentUser() user: RequestUser, @Body() dto: CreateStoragePointDto) {
    return this.yliko.createStoragePoint(user, dto);
  }

  @Patch('storage-points/:id')
  @RequireCapability('yliko:manage')
  @ApiOperation({ summary: 'Μετονομασία σημείου αποθήκευσης' })
  updateStoragePoint(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoragePointDto,
  ) {
    return this.yliko.updateStoragePoint(user, id, dto);
  }

  @Delete('storage-points/:id')
  @RequireCapability('yliko:manage')
  @ApiOperation({ summary: 'Αρχειοθέτηση σημείου αποθήκευσης' })
  archiveStoragePoint(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.yliko.archiveStoragePoint(user, id);
  }

  @Get(':id')
  @RequireCapability('yliko:read')
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() range: DateRangeDto,
  ) {
    const window = range.from && range.to ? { from: range.from, to: range.to } : undefined;
    return this.yliko.findOne(user, id, window);
  }

  @Post()
  @RequireCapability('yliko:manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateYlikoDto) {
    return this.yliko.create(user, dto);
  }

  @Patch(':id')
  @RequireCapability('yliko:manage')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateYlikoDto,
  ) {
    return this.yliko.update(user, id, dto);
  }

  @Delete(':id')
  @RequireCapability('yliko:manage')
  @ApiOperation({ summary: 'Αρχειοθέτηση υλικού (soft delete)' })
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.yliko.archive(user, id);
  }

  // ──────────────────── Βλάβες & επιδιορθώσεις ────────────────────

  @Post(':id/maintenance')
  @RequireCapability('yliko:manage')
  @ApiOperation({ summary: 'Σημείωση βλάβης ή επιδιόρθωσης' })
  addMaintenance(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.yliko.addMaintenance(user, id, dto);
  }

  @Delete('maintenance/:id')
  @RequireCapability('yliko:manage')
  @ApiOperation({ summary: 'Διαγραφή σημείωσης συντήρησης' })
  deleteMaintenance(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.yliko.deleteMaintenance(user, id);
  }

  // ───────────────────────── Δεσμεύσεις ─────────────────────────

  @Post('checkouts')
  @RequireCapability('yliko:checkout')
  @ApiOperation({
    summary: 'Δέσμευση υλικού',
    description: 'Επιστρέφει 409 με ανάλυση των δεσμεύσεων που εμποδίζουν, όταν δεν επαρκεί το απόθεμα.',
  })
  createCheckout(@CurrentUser() user: RequestUser, @Body() dto: CreateCheckoutDto) {
    return this.checkouts.create(user, dto);
  }

  @Patch('checkouts/:id/pickup')
  @RequireCapability('yliko:checkout')
  @ApiOperation({ summary: 'Παραλαβή δεσμευμένου υλικού' })
  pickUp(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkouts.pickUp(user, id);
  }

  @Patch('checkouts/:id/return')
  @RequireCapability('yliko:checkout')
  @ApiOperation({ summary: 'Επιστροφή υλικού — διαφορά ποσότητας μειώνει το απόθεμα' })
  returnItem(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnCheckoutDto,
  ) {
    return this.checkouts.returnItem(user, id, dto);
  }

  @Delete('checkouts/:id')
  @RequireCapability('yliko:checkout')
  @ApiOperation({ summary: 'Ακύρωση δέσμευσης' })
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkouts.cancel(user, id);
  }
}
