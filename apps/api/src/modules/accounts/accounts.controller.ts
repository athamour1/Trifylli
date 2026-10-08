import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../../common/audit/audit.service';
import { CapabilityGuard } from '../../common/auth/capability.guard';
import { CurrentUser, SuperAdminOnly } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { AccountsService } from './accounts.service';
import { ActivateStelexiDto, CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

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
  constructor(
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Οι λογαριασμοί του Τοπικού',
    description: 'Μαζί με τους κλάδους που δεν έχουν ακόμη διαχειριστή.',
  })
  list(@CurrentUser() user: RequestUser) {
    return this.accounts.list(user);
  }

  @Get('stelexi')
  @ApiOperation({ summary: 'Τα στελέχη των κλάδων, με την κατάσταση πρόσβασής τους' })
  stelexi(@CurrentUser() user: RequestUser) {
    return this.accounts.stelexi(user);
  }

  @Post('stelexi/activate')
  // Ένα αίτημα, πολλά email: το όριο μετρά αιτήματα, το μέγεθος το κόβει το DTO.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Μαζική ενεργοποίηση στελεχών (λογαριασμός + email ορισμού κωδικού)' })
  async activateStelexi(@CurrentUser() user: RequestUser, @Body() dto: ActivateStelexiDto) {
    const result = await this.accounts.activateStelexi(user, dto.userIds);
    for (const r of result.results) {
      if (r.ok) await this.audit.record(user, 'account.activate', 'user', r.userId, { role: 'STELEXOS' });
    }
    return result;
  }

  @Get('kladoi')
  @ApiOperation({ summary: 'Κλάδοι προς ανάθεση, με τον τρέχοντα διαχειριστή τους' })
  kladoi(@CurrentUser() user: RequestUser) {
    return this.accounts.assignableKladoi(user);
  }

  @Post()
  @ApiOperation({
    summary: 'Δημιουργία λογαριασμού',
    description:
      'Στέλνει και email με σύνδεσμο ορισμού κωδικού (Authentik). Αν η αποστολή αποτύχει, ο ' +
      'λογαριασμός δημιουργείται ούτως ή άλλως και η απάντηση το λέει στο `inviteError`.',
  })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateAccountDto) {
    const result = await this.accounts.create(user, dto);
    await this.audit.record(user, 'account.create', 'user', result.account.id, {
      role: dto.role,
      adminKlados: dto.adminKlados ?? null,
      invited: result.invited,
    });
    return result;
  }

  @Post(':id/invite')
  // Κάθε κλήση στέλνει email σε τρίτο: αυστηρό όριο, πέρα από το καθολικό.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Αποστολή συνδέσμου ορισμού κωδικού',
    description:
      'Για πρόσκληση που χάθηκε ή για επαναφορά κωδικού. Το Trifylli δεν βλέπει ποτέ τον ' +
      'κωδικό: τον ορίζει ο ίδιος ο χρήστης μέσα από το Authentik.',
  })
  async invite(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.accounts.invite(user, id);
    await this.audit.record(user, 'account.invite', 'user', id);
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Αλλαγή στοιχείων, ρόλου ή κλάδου' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    const result = await this.accounts.update(user, id, dto);
    await this.audit.record(user, 'account.update', 'user', id, { ...dto });
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Ανάκληση πρόσβασης',
    description: 'Το άτομο παραμένει στο μητρώο με το ιστορικό του· χάνει μόνο τη δυνατότητα εισόδου.',
  })
  async revoke(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.accounts.revoke(user, id);
    await this.audit.record(user, 'account.revoke', 'user', id);
    return result;
  }
}
