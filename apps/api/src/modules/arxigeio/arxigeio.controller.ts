import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KladosType } from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { ArxigeioService } from './arxigeio.service';
import { SetDutiesDto } from './dto/arxigeio.dto';

/** Το αρχηγείο κλάδου: στελέχη με βαθμό και υπευθυνότητες. */
@ApiTags('Αρχηγείο')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('kladoi/:klados/arxigeio')
export class ArxigeioController {
  constructor(
    private readonly arxigeio: ArxigeioService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireCapability('meloi:read')
  @ApiOperation({ summary: 'Τα στελέχη του κλάδου: βαθμός από το e-SEO, υπευθυνότητες' })
  view(@CurrentUser() user: RequestUser, @Param('klados', new ParseEnumPipe(KladosType)) klados: KladosType) {
    return this.arxigeio.view(user, klados);
  }

  @Put(':userId')
  @RequireCapability('meloi:manage')
  @ApiOperation({ summary: 'Οι υπευθυνότητες ενός στελέχους (αντικατάσταση)' })
  async setDuties(
    @CurrentUser() user: RequestUser,
    @Param('klados', new ParseEnumPipe(KladosType)) klados: KladosType,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetDutiesDto,
  ) {
    const member = await this.arxigeio.setDuties(user, klados, userId, dto.duties);
    await this.audit.record(user, 'arxigeio.duties', 'user', userId, { klados, duties: member.duties });
    return member;
  }
}
