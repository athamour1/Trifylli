import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { YlikoModule } from '../yliko/yliko.module';
import { DraseisController } from './draseis.controller';
import { DraseisService } from './draseis.service';

@Module({
  // IntegrationsModule: το e-SEO δίνει το όνομα φιλοξενούμενου Τοπικού από τον κωδικό του.
  imports: [YlikoModule, IntegrationsModule],
  controllers: [DraseisController],
  providers: [DraseisService],
  exports: [DraseisService],
})
export class DraseisModule {}
