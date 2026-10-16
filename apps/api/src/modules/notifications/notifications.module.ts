import { Global, Module } from '@nestjs/common';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { NotificationsController } from './notifications.controller';
import { NotificationsService, PUSH_SENDER, WebPushSender } from './notifications.service';

/**
 * Ειδοποιήσεις (συνεργασία, Φ8). Global: όποιο module θέλει να ειδοποιήσει
 * κάποιον καλεί `NotificationsService.notify` — το πώς φτάνει (καμπανάκι,
 * ζωντανά, push) είναι υπόθεση αυτού του module.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: PUSH_SENDER, inject: [AppConfigToken], useFactory: (config: AppConfig) => new WebPushSender(config) },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
