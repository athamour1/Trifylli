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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { KladosDateRangeDto } from '../../common/dto/klados-range.dto';
import {
  CreateSyggentrwshDto,
  ReplacePlanDto,
  UpdateSyggentrwshDto,
} from './dto/syggentrwsh.dto';
import { SyggentrwseisService } from './syggentrwseis.service';

@ApiTags('Συγκεντρώσεις')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('syggentrwseis')
export class SyggentrwseisController {
  constructor(private readonly syggentrwseis: SyggentrwseisService) {}

  @Get()
  @RequireCapability('calendar:read')
  list(@CurrentUser() user: RequestUser, @Query() query: KladosDateRangeDto) {
    return this.syggentrwseis.list(user, query.klados, query.from, query.to);
  }

  @Get(':id')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Πλήρης σχεδιασμός συγκέντρωσης',
    description: 'Timeline ανά μέρος, διαθεσιμότητα, απαιτούμενο υλικό και δεσμεύσεις σε ένα request.',
  })
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.syggentrwseis.findOne(user, id);
  }

  @Post()
  @RequireCapability('syggentrwsh:write')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSyggentrwshDto) {
    return this.syggentrwseis.create(user, dto);
  }

  @Patch(':id')
  @RequireCapability('syggentrwsh:write')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSyggentrwshDto,
  ) {
    return this.syggentrwseis.update(user, id, dto);
  }

  @Delete(':id')
  @RequireCapability('syggentrwsh:write')
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.syggentrwseis.archive(user, id);
  }

  @Put(':id/plan')
  @RequireCapability('syggentrwsh:write')
  @ApiOperation({
    summary: 'Αποθήκευση σχεδιασμού',
    description:
      'Αντικαθιστά κομμάτια, σημειώσεις ανά μέρος και λίστα υλικού· η σειρά προκύπτει ' +
      'από τη θέση στον πίνακα. Ένα αίτημα, ώστε η οθόνη σχεδιασμού να αποθηκεύει μόνη ' +
      'της χωρίς να μπορεί να μείνει μισοσωσμένη.',
  })
  replacePlan(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacePlanDto,
  ) {
    return this.syggentrwseis.replacePlan(user, id, dto);
  }

  @Get(':id/stelexi')
  @RequireCapability('calendar:read')
  @ApiOperation({
    summary: 'Τα στελέχη του κλάδου',
    description: 'Όσα μπορούν να επιλεγούν, και όσα έχουν ήδη επιλεγεί. Η επιλογή ' +
      'αποθηκεύεται μαζί με τον υπόλοιπο σχεδιασμό, από το `PUT :id/plan`.',
  })
  stelexi(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.syggentrwseis.stelexi(user, id);
  }
}
