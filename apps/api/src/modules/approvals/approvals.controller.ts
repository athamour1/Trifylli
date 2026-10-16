import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { COLLAB_CLIENT_HEADER } from '@trifylli/shared';
import { CurrentUser } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { clientOrigin } from '../collab/live-changes';
import { ApprovalDocumentDto, ApprovalReturnDto, ApprovalSummaryQueryDto } from './dto/approvals.dto';
import { ApprovalsService } from './approvals.service';

/** Έγκριση προγραμματικών και γευμάτων: Πρόχειρο → Για έλεγχο → Εγκρίθηκε, ή «Επιστροφή». */
@ApiTags('Εγκρίσεις')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'Οι εγκρίσεις μιας δράσης (Επισκόπηση, ωρολόγιο)' })
  summary(@CurrentUser() user: RequestUser, @Query() query: ApprovalSummaryQueryDto) {
    return this.approvals.summary(user, query.drasi);
  }

  @Get('state')
  @ApiOperation({ summary: 'Η έγκριση ενός εγγράφου, και τι μπορεί ο χρήστης' })
  state(@CurrentUser() user: RequestUser, @Query() query: ApprovalDocumentDto) {
    return this.approvals.state(user, query.document);
  }

  @Get('compare')
  @ApiOperation({ summary: 'Η εγκεκριμένη μορφή δίπλα στην τωρινή' })
  compare(@CurrentUser() user: RequestUser, @Query() query: ApprovalDocumentDto) {
    return this.approvals.compare(user, query.document);
  }

  @Post('request')
  @ApiOperation({ summary: '«Για έλεγχο»' })
  async request(@CurrentUser() user: RequestUser, @Body() dto: ApprovalDocumentDto, @Headers(COLLAB_CLIENT_HEADER) client?: string) {
    await this.approvals.request(user, dto.document, clientOrigin(client));
    return { ok: true };
  }

  @Post('approve')
  @ApiOperation({ summary: '«Εγκρίθηκε»' })
  async approve(@CurrentUser() user: RequestUser, @Body() dto: ApprovalDocumentDto, @Headers(COLLAB_CLIENT_HEADER) client?: string) {
    await this.approvals.approve(user, dto.document, clientOrigin(client));
    return { ok: true };
  }

  @Post('return')
  @ApiOperation({ summary: '«Επιστροφή» με σχόλιο' })
  async giveBack(@CurrentUser() user: RequestUser, @Body() dto: ApprovalReturnDto, @Headers(COLLAB_CLIENT_HEADER) client?: string) {
    await this.approvals.giveBack(user, dto.document, dto.note, clientOrigin(client));
    return { ok: true };
  }
}
