import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Global ώστε κάθε module (files, treasury) να μπορεί να το ενέσει. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
