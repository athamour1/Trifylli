import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthentikClient } from './authentik.client';
import { EseoAuth } from './eseo.auth';
import { EseoClient } from './eseo.client';
import { EseoSyncService } from './eseo-sync.service';
import { IntegrationsController } from './integrations.controller';
import { OuchtrackerClient } from './ouchtracker.client';

@Module({
  imports: [HttpModule],
  controllers: [IntegrationsController],
  providers: [AuthentikClient, EseoAuth, EseoClient, EseoSyncService, OuchtrackerClient],
  exports: [AuthentikClient, EseoAuth, EseoClient, EseoSyncService, OuchtrackerClient],
})
export class IntegrationsModule {}
