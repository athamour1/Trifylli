import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  // Για τον `AuthentikClient`: η δημιουργία λογαριασμού στέλνει σύνδεσμο
  // ορισμού κωδικού, αλλιώς ο νέος διαχειριστής δεν έχει τρόπο να μπει.
  imports: [IntegrationsModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
