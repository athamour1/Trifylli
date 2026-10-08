import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TopikoController } from './topiko.controller';
import { TopikoService } from './topiko.service';

@Module({
  // Για το `POST /me/password-link`: ο σύνδεσμος αλλαγής κωδικού φεύγει από την
  // ίδια ροή με την πρόσκληση (AccountsService → Authentik).
  imports: [AccountsModule],
  controllers: [TopikoController],
  providers: [TopikoService],
  exports: [TopikoService],
})
export class TopikoModule {}
