import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CollabAuthService } from './collab-auth.service';
import { CollabHistoryController } from './collab-history.controller';
import { CollabHistoryService } from './collab-history.service';
import { CollabService } from './collab.service';
import { LiveChangesInterceptor } from './live-changes';

/**
 * Συνεργασία σε πραγματικό χρόνο (βλ. docs/synergasia.md). Global: κάθε module
 * δηλώνει τα δικά του είδη εγγράφων στο `CollabService.registry` και του λέει
 * πότε να σώσει, να κλείσει ή να σβήσει ένα έγγραφο. Κάθε αλλαγή μέσω API
 * ειδοποιεί μόνη της το δωμάτιό της (`LiveChangesInterceptor`). Κρατά και το
 * ιστορικό εκδόσεων (`CollabHistoryService`).
 */
@Global()
@Module({
  controllers: [CollabHistoryController],
  providers: [CollabAuthService, CollabService, CollabHistoryService, { provide: APP_INTERCEPTOR, useClass: LiveChangesInterceptor }],
  exports: [CollabService, CollabHistoryService],
})
export class CollabModule {}
