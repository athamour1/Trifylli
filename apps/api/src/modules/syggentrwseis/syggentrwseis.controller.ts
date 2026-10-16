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
    summary: 'Αποθήκευση σχεδιασμού — καταργήθηκε',
    description: 'Ο σχεδιασμός γράφεται πια μαζί, ως κοινό έγγραφο `syggentrwsh:<id>` (WebSocket `/api/collab`). Απαντά 409.',
  })
  replacePlan(@Param('id', ParseUUIDPipe) _id: string, @Body() _dto: ReplacePlanDto) {
    // Παλιός client: ο σχεδιασμός γράφεται πια μέσω της συνεργασίας.
    return this.syggentrwseis.replacePlan();
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
