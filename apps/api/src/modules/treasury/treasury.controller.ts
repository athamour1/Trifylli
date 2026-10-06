import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { CreateTreasuryEntryDto, QueryTreasuryDto } from './dto/treasury.dto';
import { TreasuryService } from './treasury.service';

@ApiTags('Ταμείο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(
    private readonly treasury: TreasuryService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  @RequireCapability('treasury:read')
  @ApiOperation({ summary: 'Υπόλοιπα όλων των ταμείων (Τοπικό + κλάδοι) — υπερδιαχειριστής' })
  overview(@CurrentUser() user: RequestUser) {
    return this.treasury.overview(user);
  }

  @Get('summary')
  @RequireCapability('treasury:read')
  @ApiOperation({ summary: 'Σύνοψη ταμείου μιας εμβέλειας (κλάδος ή Τοπικό)' })
  summary(@CurrentUser() user: RequestUser, @Query() query: QueryTreasuryDto) {
    return this.treasury.summary(user, query.klados);
  }

  @Get()
  @RequireCapability('treasury:read')
  @ApiOperation({ summary: 'Κινήσεις ταμείου μιας εμβέλειας' })
  list(@CurrentUser() user: RequestUser, @Query() query: QueryTreasuryDto) {
    return this.treasury.list(user, query);
  }

  @Post()
  @RequireCapability('treasury:manage')
  @ApiOperation({ summary: 'Νέα κίνηση (έσοδο ή έξοδο, με προαιρετική απόδειξη)' })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateTreasuryEntryDto) {
    const entry = await this.treasury.create(user, dto);
    await this.audit.record(user, 'treasury.create', 'treasury_entry', entry.id, {
      kind: dto.kind,
      amount: dto.amount,
      category: dto.category,
      klados: dto.kladosType ?? null,
    });
    return entry;
  }

  @Delete(':id')
  @RequireCapability('treasury:manage')
  @ApiOperation({ summary: 'Διαγραφή κίνησης (και της απόδειξής της)' })
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.treasury.remove(user, id);
    await this.audit.record(user, 'treasury.delete', 'treasury_entry', id);
    return result;
  }
}
