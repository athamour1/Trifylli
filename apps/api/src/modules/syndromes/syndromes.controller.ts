import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { KladosType } from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { CreatePaymentDto, CreatePeriodDto, SetSyndromiDto, UpdateHandlingDto } from './dto/syndromes.dto';
import { SyndromesService } from './syndromes.service';

@ApiTags('Συνδρομές')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('syndromes')
export class SyndromesController {
  constructor(
    private readonly syndromes: SyndromesService,
    private readonly audit: AuditService,
  ) {}

  @Get('periods')
  @RequireCapability('syndromes:read')
  periods(@CurrentUser() user: RequestUser) {
    return this.syndromes.periods(user);
  }

  @Post('periods')
  @RequireCapability('syndromes:manage')
  @ApiOperation({ summary: 'Νέα οδηγική χρονιά', description: 'Προαιρετικά δημιουργεί συνδρομές για όλα τα ενεργά μέλη.' })
  async createPeriod(@CurrentUser() user: RequestUser, @Body() dto: CreatePeriodDto) {
    const period = await this.syndromes.createPeriod(user, dto);
    await this.audit.record(user, 'syndromes.period.create', 'period', (period as { id?: string }).id, { ...dto });
    return period;
  }

  @Get('report')
  @RequireCapability('syndromes:read')
  @ApiQuery({ name: 'periodId', required: false })
  @ApiOperation({ summary: 'Οικονομική εικόνα ανά κλάδο' })
  report(
    @CurrentUser() user: RequestUser,
    @Query('periodId') periodId?: string,
    @Query('klados') klados?: KladosType,
  ) {
    return this.syndromes.report(user, periodId, klados);
  }

  @Get('debtors')
  @RequireCapability('syndromes:read')
  @ApiQuery({ name: 'periodId', required: false })
  @ApiOperation({ summary: 'Οφειλέτες με υπόλοιπο, φθίνουσα σειρά' })
  debtors(
    @CurrentUser() user: RequestUser,
    @Query('periodId') periodId?: string,
    @Query('klados') klados?: KladosType,
  ) {
    return this.syndromes.debtors(user, periodId, klados);
  }

  @Get('members')
  @RequireCapability('syndromes:read')
  @ApiQuery({ name: 'periodId', required: false })
  @ApiOperation({ summary: 'Όλες οι συνδρομές της περιόδου (οθόνη εισπράξεων)' })
  members(
    @CurrentUser() user: RequestUser,
    @Query('periodId') periodId?: string,
    @Query('klados') klados?: KladosType,
  ) {
    return this.syndromes.members(user, periodId, klados);
  }

  @Put('member/:memberId')
  @RequireCapability('syndromes:manage')
  @ApiOperation({ summary: 'Ορισμός οφειλόμενου ποσού ή απαλλαγής' })
  async setSyndromi(
    @CurrentUser() user: RequestUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: SetSyndromiDto,
  ) {
    const result = await this.syndromes.setSyndromi(user, memberId, dto);
    await this.audit.record(user, 'syndromes.set', 'user', memberId, { ...dto });
    return result;
  }

  @Post(':syndromiId/payments')
  @RequireCapability('syndromes:manage')
  @ApiOperation({
    summary: 'Καταγραφή πληρωμής',
    description: 'Το σύνολο ξαναϋπολογίζεται από τις εγγραφές πληρωμών.',
  })
  async addPayment(
    @CurrentUser() user: RequestUser,
    @Param('syndromiId', ParseUUIDPipe) syndromiId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    const result = await this.syndromes.addPayment(user, syndromiId, dto);
    await this.audit.record(user, 'syndromes.payment.add', 'syndromi', syndromiId, { ...dto });
    return result;
  }

  @Delete('payments/:paymentId')
  @RequireCapability('syndromes:manage')
  @ApiOperation({ summary: 'Διαγραφή πληρωμής (επανυπολογισμός συνόλου)' })
  async deletePayment(@CurrentUser() user: RequestUser, @Param('paymentId', ParseUUIDPipe) paymentId: string) {
    const result = await this.syndromes.deletePayment(user, paymentId);
    await this.audit.record(user, 'syndromes.payment.delete', 'payment', paymentId);
    return result;
  }

  @Get('cash')
  @RequireCapability('syndromes:read')
  @ApiQuery({ name: 'periodId', required: false })
  @ApiOperation({ summary: 'Πορεία μετρητών ανά στάδιο (είσπραξη → … → τακτοποίηση)' })
  cashFlow(
    @CurrentUser() user: RequestUser,
    @Query('periodId') periodId?: string,
    @Query('klados') klados?: KladosType,
  ) {
    return this.syndromes.cashFlow(user, periodId, klados);
  }

  @Put('payments/:paymentId/handling')
  @RequireCapability('syndromes:manage')
  @ApiOperation({ summary: 'Αλλαγή σταδίου διαχείρισης μετρητών' })
  async updateHandling(
    @CurrentUser() user: RequestUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdateHandlingDto,
  ) {
    const result = await this.syndromes.updateHandling(user, paymentId, dto.handlingStatus);
    await this.audit.record(user, 'syndromes.payment.handling', 'payment', paymentId, { status: dto.handlingStatus });
    return result;
  }
}
