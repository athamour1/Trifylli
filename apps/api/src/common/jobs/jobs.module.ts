import { Global, Module } from '@nestjs/common';
import { AppConfigToken } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { JobMonitor } from './job-monitor';

/** Global: κάθε cron παίρνει τον `JobMonitor` χωρίς να εισάγει module. */
@Global()
@Module({
  providers: [
    {
      provide: JobMonitor,
      inject: [AppConfigToken],
      useFactory: (config: AppConfig) =>
        new JobMonitor({
          'eseo-sync': config.HEARTBEAT_ESEO_SYNC_URL,
          'health-purge': config.HEARTBEAT_HEALTH_PURGE_URL,
          'image-sweep': config.HEARTBEAT_IMAGE_SWEEP_URL,
          'pharmacy-returns': config.HEARTBEAT_PHARMACY_RETURNS_URL,
          'pharmacy-access': config.HEARTBEAT_PHARMACY_ACCESS_URL,
        }),
    },
  ],
  exports: [JobMonitor],
})
export class JobsModule {}
