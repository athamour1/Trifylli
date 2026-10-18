import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global ώστε κάθε module (έντυπα, αξιολόγηση) να μπορεί να το ενέσει. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
