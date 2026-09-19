import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, RequireCapability } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { QueryMeloiDto } from './dto/meloi.dto';
import { MeloiService } from './meloi.service';

@ApiTags('Μέλη')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@Controller('meloi')
export class MeloiController {
  constructor(private readonly meloi: MeloiService) {}

  @Get()
  @RequireCapability('meloi:read')
  @ApiOperation({
    summary: 'Μητρώο μελών με φίλτρα',
    description: 'Τα φίλτρα τέμνονται πάντα με την εμβέλεια κλάδων του χρήστη.',
  })
  list(@CurrentUser() user: RequestUser, @Query() query: QueryMeloiDto) {
    return this.meloi.list(user, query);
  }

  @Get('stats')
  @RequireCapability('meloi:read')
  @ApiOperation({ summary: 'Κατανομή μελών ανά κλάδο' })
  stats(@CurrentUser() user: RequestUser) {
    return this.meloi.stats(user);
  }

  @Get(':id')
  @RequireCapability('meloi:read')
  @ApiOperation({ summary: 'Καρτέλα μέλους' })
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meloi.findOne(user, id);
  }
}
