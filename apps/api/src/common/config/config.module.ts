import { Global, Module } from '@nestjs/common';
import { loadConfig, type AppConfig } from './configuration';

/** Token για injection του επικυρωμένου config. */
export const AppConfigToken = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: AppConfigToken,
      useFactory: (): AppConfig => loadConfig(),
    },
  ],
  exports: [AppConfigToken],
})
export class AppConfigModule {}
