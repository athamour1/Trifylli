import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PharmaciesController } from './pharmacies.controller';
import { PharmaciesService } from './pharmacies.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [PharmaciesController],
  providers: [PharmaciesService],
})
export class PharmaciesModule {}
