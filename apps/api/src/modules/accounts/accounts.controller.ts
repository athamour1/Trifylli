import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, SuperAdminOnly } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

/**
 * Όλο το module είναι κλειδωμένο στον υπερδιαχειριστή: είναι το σημείο όπου
 * δίνεται πρόσβαση, οπότε δεν υπάρχει ενέργεια εδώ που να επιτρέπεται σε
 * διαχειριστή κλάδου.
 */
@ApiTags('Λογαριασμοί')
@ApiBearerAuth()
@UseGuards(CapabilityGuard)
@SuperAdminOnly()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'Οι λογαριασμοί του Τοπικού',
    description: 'Μαζί με τους κλάδους που δεν έχουν ακόμη διαχειριστή.',
  })
  list(@CurrentUser() user: RequestUser) {
    return this.accounts.list(user);
  }

  @Get('kladoi')
  @ApiOperation({ summary: 'Κλάδοι προς ανάθεση, με τον τρέχοντα διαχειριστή τους' })
  kladoi(@CurrentUser() user: RequestUser) {
    return this.accounts.assignableKladoi(user);
  }

  @Post()
  @ApiOperation({ summary: 'Δημιουργία λογαριασμού' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Αλλαγή στοιχείων, ρόλου ή κλάδου' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Ανάκληση πρόσβασης',
    description: 'Το άτομο παραμένει στο μητρώο με το ιστορικό του· χάνει μόνο τη δυνατότητα εισόδου.',
  })
  revoke(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.revoke(user, id);
  }
}
