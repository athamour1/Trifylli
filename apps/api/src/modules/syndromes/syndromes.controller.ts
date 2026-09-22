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
  constructor(private readonly syndromes: SyndromesService) {}

  @Get('periods')
  @RequireCapability('syndromes:read')
  periods(@CurrentUser() user: RequestUser) {
    return this.syndromes.periods(user);
  }

  @Post('periods')
  @RequireCapability('syndromes:manage')
  @ApiOperation({ summary: 'Νέα οδηγική χρονιά', description: 'Προαιρετικά δημιουργεί συνδρομές για όλα τα ενεργά μέλη.' })
  createPeriod(@CurrentUser() user: RequestUser, @Body() dto: CreatePeriodDto) {
    return this.syndromes.createPeriod(user, dto);
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
  setSyndromi(
    @CurrentUser() user: RequestUser,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: SetSyndromiDto,
  ) {
    return this.syndromes.setSyndromi(user, memberId, dto);
  }

  @Post(':syndromiId/payments')
  @RequireCapability('syndromes:manage')
  @ApiOperation({
    summary: 'Καταγραφή πληρωμής',
    description: 'Το σύνολο ξαναϋπολογίζεται από τις εγγραφές πληρωμών.',
  })
  addPayment(
    @CurrentUser() user: RequestUser,
    @Param('syndromiId', ParseUUIDPipe) syndromiId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.syndromes.addPayment(user, syndromiId, dto);
  }

  @Delete('payments/:paymentId')
  @RequireCapability('syndromes:manage')
  @ApiOperation({ summary: 'Διαγραφή πληρωμής (επανυπολογισμός συνόλου)' })
  deletePayment(@CurrentUser() user: RequestUser, @Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.syndromes.deletePayment(user, paymentId);
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
  updateHandling(
    @CurrentUser() user: RequestUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdateHandlingDto,
  ) {
    return this.syndromes.updateHandling(user, paymentId, dto.handlingStatus);
  }
}
