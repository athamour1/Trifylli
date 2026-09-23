import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { EseoAuth } from './eseo.auth';
import { EseoClient } from './eseo.client';
import { EseoSyncService } from './eseo-sync.service';
import { IntegrationsController } from './integrations.controller';
import { OuchtrackerClient } from './ouchtracker.client';

@Module({
  imports: [HttpModule],
  controllers: [IntegrationsController],
  providers: [EseoAuth, EseoClient, EseoSyncService, OuchtrackerClient],
  exports: [EseoAuth, EseoClient, EseoSyncService, OuchtrackerClient],
})
export class IntegrationsModule {}
