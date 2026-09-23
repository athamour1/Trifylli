import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { FarmakeioController } from './farmakeio.controller';
import { FarmakeioService } from './farmakeio.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [FarmakeioController],
  providers: [FarmakeioService],
  exports: [FarmakeioService],
})
export class FarmakeioModule {}
