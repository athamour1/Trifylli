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
import { CheckoutService } from '../yliko/checkout.service';
import { DraseisService } from './draseis.service';
import {
  AddParticipantsDto,
  CreateDrasiDto,
  QueryDraseisDto,
  UpdateDrasiDto,
  UpdateParticipantDto,
} from './dto/drasi.dto';

@ApiTags('Δράσεις')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('draseis')
export class DraseisController {
  constructor(
    private readonly draseis: DraseisService,
    private readonly checkouts: CheckoutService,
  ) {}

  @Get()
  @RequireCapability('calendar:read')
  list(@CurrentUser() user: RequestUser, @Query() query: QueryDraseisDto) {
    return this.draseis.list(user, query);
  }

  @Get('kataskinoseis')
  @RequireCapability('calendar:read')
  @ApiOperation({ summary: 'Συγκεντρωτικά όλων των κατασκηνώσεων' })
  kataskinoseis(@CurrentUser() user: RequestUser) {
    return this.draseis.kataskinoseis(user);
  }

  @Get(':id')
  @RequireCapability('calendar:read')
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.findOne(user, id);
  }

  @Get(':id/stats')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Στοιχεία ανά κλάδο',
    description: 'Στελέχη, κατασκηνωτές και δεσμευμένο υλικό ανά κλάδο — το φύλλο πριν την αναχώρηση.',
  })
  stats(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.kataskinosiStats(user, id);
  }

  @Get(':id/yliko')
  @RequireCapability('yliko:read')
  @ApiOperation({ summary: 'Τι υλικό έχει δεσμευτεί για τη δράση' })
  yliko(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkouts.listForDrasi(user, id);
  }

  @Post()
  @RequireCapability('drasi:write')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDrasiDto) {
    return this.draseis.create(user, dto);
  }

  @Patch(':id')
  @RequireCapability('drasi:write')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDrasiDto,
  ) {
    return this.draseis.update(user, id, dto);
  }

  @Delete(':id')
  @RequireCapability('drasi:write')
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.draseis.archive(user, id);
  }

  @Post(':id/participants')
  @RequireCapability('drasi:write')
  @ApiOperation({ summary: 'Προσθήκη συμμετεχόντων (idempotent)' })
  addParticipants(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.draseis.addParticipants(user, id, dto);
  }

  @Patch(':id/participants/:memberId')
  @RequireCapability('drasi:write')
  updateParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.draseis.updateParticipant(user, id, memberId, dto);
  }

  @Delete(':id/participants/:memberId')
  @RequireCapability('drasi:write')
  removeParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.draseis.removeParticipant(user, id, memberId);
  }
}
