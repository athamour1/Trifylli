import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  constructor(private readonly treasury: TreasuryService) {}

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
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTreasuryEntryDto) {
    return this.treasury.create(user, dto);
  }

  @Delete(':id')
  @RequireCapability('treasury:manage')
  @ApiOperation({ summary: 'Διαγραφή κίνησης (και της απόδειξής της)' })
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.treasury.remove(user, id);
  }
}
