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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { DrasiPermGuard } from './drasi-perm.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DraseisExportService } from './draseis-export.service';
import { DraseisFinanceService } from './draseis-finance.service';
import {
  CreateDrasiPaymentDto,
  CreateDrasiTreasuryEntryDto,
  CreateLedgerEntryDto,
  HandoverDto,
  SetBudgetDto,
  SettleLedgerDto,
  UpdateDrasiPaymentHandlingDto,
  UpdateParticipantFeesDto,
} from './dto/drasi-finance.dto';

/** Τα οικονομικά μιας δράσης: ταμείο, προϋπολογισμός, κόστη/εισπράξεις, λογαριασμοί, Excel. */
@ApiTags('Δράσεις — οικονομικά')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id')
export class DraseisFinanceController {
  constructor(
    private readonly finance: DraseisFinanceService,
    private readonly exporter: DraseisExportService,
    private readonly audit: AuditService,
  ) {}

  // ── Ταμείο ──

  @Get('treasury')
  @RequireDrasi('tamio')
  @ApiOperation({ summary: 'Κινήσεις του ταμείου της δράσης' })
  entries(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.entries(user, id);
  }

  @Get('treasury/summary')
  @RequireDrasi('tamio')
  @ApiOperation({ summary: 'Σύνοψη: έσοδα/έξοδα, ανά κατηγορία vs προϋπολογισμός, εισπράξεις' })
  summary(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.summary(user, id);
  }

  @Post('treasury')
  @RequireDrasi('tamio', 'edit')
  @ApiOperation({ summary: 'Νέα κίνηση (μία απόδειξη = μία γραμμή)' })
  async createEntry(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDrasiTreasuryEntryDto,
  ) {
    const entry = await this.finance.createEntry(user, id, dto);
    await this.audit.record(user, 'drasi.treasury.create', 'treasury_entry', entry.id, {
      drasiId: id,
      kind: dto.kind,
      category: dto.category,
      amount: dto.amount,
    });
    return entry;
  }

  @Delete('treasury/:entryId')
  @RequireDrasi('tamio', 'edit')
  async removeEntry(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    const result = await this.finance.removeEntry(user, id, entryId);
    await this.audit.record(user, 'drasi.treasury.delete', 'treasury_entry', entryId, { drasiId: id });
    return result;
  }

  @Get('budget')
  @RequireDrasi('tamio')
  budget(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.budget(user, id);
  }

  @Put('budget')
  @RequireDrasi('tamio', 'edit')
  @ApiOperation({ summary: 'Προϋπολογισμός ανά κατηγορία (αντικατάσταση)' })
  setBudget(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetBudgetDto) {
    return this.finance.setBudget(user, id, dto);
  }

  @Get('export.xlsx')
  @RequireDrasi('tamio')
  @ApiOperation({ summary: 'Το ταμείο της δράσης σε Excel (δομή υποδείγματος)' })
  async exportXlsx(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { filename, buffer } = await this.exporter.workbook(user, id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  // ── Συμμετέχοντες: κόστη & πληρωμές ──

  @Get('participants')
  @RequireDrasi('participants')
  @ApiOperation({ summary: 'Συμμετέχοντες με κόστη, πληρωμές και υπεύθυνο είσπραξης' })
  participants(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.participants(user, id);
  }

  @Get('collectors')
  @RequireDrasi('participants')
  @ApiOperation({ summary: 'Ανά υπεύθυνο στέλεχος: πόσα παιδιά, πόσα εισέπραξε, πόσα κρατά' })
  collectors(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.collectors(user, id);
  }

  @Patch('participants/:memberId/fees')
  @RequireDrasi('payments', 'edit')
  @ApiOperation({ summary: 'Κόστος συμμετοχής, μεταφορικά, υπεύθυνος είσπραξης' })
  updateFees(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateParticipantFeesDto,
  ) {
    return this.finance.updateFees(user, id, memberId, dto);
  }

  @Post('participants/:memberId/payments')
  @RequireDrasi('payments', 'edit')
  @ApiOperation({ summary: 'Καταγραφή πληρωμής συμμετοχής' })
  async addPayment(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: CreateDrasiPaymentDto,
  ) {
    const payment = await this.finance.addPayment(user, id, memberId, dto);
    await this.audit.record(user, 'drasi.payment.add', 'drasi_payment', payment.id, {
      drasiId: id,
      memberId,
      amount: dto.amount,
    });
    return payment;
  }

  @Delete('payments/:paymentId')
  @RequireDrasi('payments', 'edit')
  async deletePayment(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    const result = await this.finance.deletePayment(user, id, paymentId);
    await this.audit.record(user, 'drasi.payment.delete', 'drasi_payment', paymentId, { drasiId: id });
    return result;
  }

  @Put('payments/:paymentId/handling')
  @RequireDrasi('handover', 'edit')
  @ApiOperation({ summary: 'Στάδιο μετρητών: εισπράχθηκε → παραδόθηκε → κατατέθηκε → τακτοποιήθηκε' })
  async updateHandling(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdateDrasiPaymentHandlingDto,
  ) {
    const result = await this.finance.updateHandling(user, id, paymentId, dto.handlingStatus);
    await this.audit.record(user, 'drasi.payment.handling', 'drasi_payment', paymentId, { status: dto.handlingStatus });
    return result;
  }

  @Post('payments/handover')
  @RequireDrasi('handover', 'edit')
  @ApiOperation({ summary: 'Μαζική παράδοση: όλα τα μετρητά ενός στελέχους περνούν σε «παραδόθηκε»' })
  async handover(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HandoverDto) {
    const result = await this.finance.handover(user, id, dto.collectorId);
    await this.audit.record(user, 'drasi.payment.handover', 'drasi', id, { collectorId: dto.collectorId, ...result });
    return result;
  }

  // ── Λογαριασμοί στελεχών ──

  @Get('ledger')
  @RequireDrasi('tamio')
  @ApiOperation({ summary: 'Προκαταβολές, επιστροφές, αποδόσεις — ανά στέλεχος' })
  ledger(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.ledger(user, id);
  }

  @Post('ledger')
  @RequireDrasi('tamio', 'edit')
  async addLedger(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLedgerEntryDto,
  ) {
    const entry = await this.finance.addLedger(user, id, dto);
    await this.audit.record(user, 'drasi.ledger.add', 'drasi_ledger_entry', entry.id, {
      drasiId: id,
      kind: dto.kind,
      amount: dto.amount,
    });
    return entry;
  }

  @Delete('ledger/:entryId')
  @RequireDrasi('tamio', 'edit')
  async removeLedger(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    const result = await this.finance.removeLedger(user, id, entryId);
    await this.audit.record(user, 'drasi.ledger.delete', 'drasi_ledger_entry', entryId, { drasiId: id });
    return result;
  }

  @Post('ledger/settle')
  @RequireDrasi('tamio', 'edit')
  @ApiOperation({ summary: 'Κλείσιμο λογαριασμού στελέχους' })
  settle(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleLedgerDto) {
    return this.finance.settleLedger(user, id, dto.userId);
  }
}
