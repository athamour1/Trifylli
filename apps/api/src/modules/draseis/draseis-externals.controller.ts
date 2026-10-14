import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireDrasi } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DrasiPermGuard } from './drasi-perm.guard';
import { DraseisExternalsService } from './draseis-externals.service';
import { CreateDrasiExternalDto, GrantDrasiExternalAccessDto } from './dto/drasi-externals.dto';

/** Εξωτερικά στελέχη μιας δράσης — τα διαχειρίζεται όποιος αλλάζει το αρχηγείο. */
@ApiTags('Δράσεις — εξωτερικά στελέχη')
@ApiBearerAuth()
@UseGuards(CapabilityGuard, DrasiPermGuard)
@Controller('draseis/:id/externals')
export class DraseisExternalsController {
  constructor(
    private readonly externals: DraseisExternalsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireDrasi('arxigeio')
  list(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.externals.list(user, id);
  }

  @Post()
  @RequireDrasi('arxigeio', 'edit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Νέο εξωτερικό στέλεχος: λογαριασμός για τη δράση + email ορισμού κωδικού' })
  async create(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateDrasiExternalDto) {
    const result = await this.externals.create(user, id, dto);
    await this.audit.record(user, 'drasi.external.add', 'user', result.external.userId, { drasiId: id, invited: result.invited });
    return result;
  }

  @Post(':userId/access')
  @RequireDrasi('arxigeio', 'edit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Φιλοξενούμενο στέλεχος χωρίς email → λογαριασμός για τη δράση + email ορισμού κωδικού' })
  async grantAccess(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: GrantDrasiExternalAccessDto,
  ) {
    const result = await this.externals.grantAccess(user, id, userId, dto.email);
    await this.audit.record(user, 'drasi.external.access', 'user', userId, { drasiId: id, invited: result.invited });
    return result;
  }

  @Post(':userId/invite')
  @RequireDrasi('arxigeio', 'edit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async invite(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    const result = await this.externals.invite(user, id, userId);
    await this.audit.record(user, 'drasi.external.invite', 'user', userId, { drasiId: id });
    return result;
  }

  @Delete(':userId')
  @RequireDrasi('arxigeio', 'edit')
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    const result = await this.externals.remove(user, id, userId);
    await this.audit.record(user, 'drasi.external.remove', 'user', userId, { drasiId: id });
    return result;
  }
}
