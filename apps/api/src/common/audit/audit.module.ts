import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Καθολικό, ώστε κάθε module να καταγράφει χωρίς να δηλώνει εξάρτηση. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
