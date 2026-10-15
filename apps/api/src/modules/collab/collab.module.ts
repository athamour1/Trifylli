import { Global, Module } from '@nestjs/common';
import { CollabAuthService } from './collab-auth.service';
import { CollabService } from './collab.service';

/**
 * Συνεργασία σε πραγματικό χρόνο (βλ. docs/synergasia.md). Global: κάθε module
 * δηλώνει τα δικά του είδη εγγράφων στο `CollabService.registry` και του λέει
 * πότε να σώσει, να κλείσει ή να σβήσει ένα έγγραφο.
 */
@Global()
@Module({
  providers: [CollabAuthService, CollabService],
  exports: [CollabService],
})
export class CollabModule {}
