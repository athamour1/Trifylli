import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CollabAuthService } from './collab-auth.service';
import { CollabService } from './collab.service';
import { LiveChangesInterceptor } from './live-changes';

/**
 * Συνεργασία σε πραγματικό χρόνο (βλ. docs/synergasia.md). Global: κάθε module
 * δηλώνει τα δικά του είδη εγγράφων στο `CollabService.registry` και του λέει
 * πότε να σώσει, να κλείσει ή να σβήσει ένα έγγραφο. Κάθε αλλαγή μέσω API
 * ειδοποιεί μόνη της το δωμάτιό της (`LiveChangesInterceptor`).
 */
@Global()
@Module({
  providers: [CollabAuthService, CollabService, { provide: APP_INTERCEPTOR, useClass: LiveChangesInterceptor }],
  exports: [CollabService],
})
export class CollabModule {}
