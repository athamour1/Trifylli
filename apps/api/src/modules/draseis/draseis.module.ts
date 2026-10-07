import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { YlikoModule } from '../yliko/yliko.module';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisController } from './draseis.controller';
import { DraseisExportService } from './draseis-export.service';
import { DraseisFinanceController } from './draseis-finance.controller';
import { DraseisFinanceService } from './draseis-finance.service';
import { DraseisFormsController, PublicFormsController } from './draseis-forms.controller';
import { DraseisFormsService } from './draseis-forms.service';
import { DraseisGroupsController } from './draseis-groups.controller';
import { DraseisGroupsService } from './draseis-groups.service';
import { DraseisPharmacyService } from './draseis-pharmacy.service';
import { DraseisService } from './draseis.service';

@Module({
  // IntegrationsModule: το e-SEO δίνει το όνομα φιλοξενούμενου Τοπικού από τον κωδικό του.
  // FilesModule: αποδείξεις του ταμείου δράσης.
  imports: [YlikoModule, IntegrationsModule, FilesModule],
  controllers: [DraseisController, DraseisFinanceController, DraseisGroupsController, DraseisFormsController, PublicFormsController],
  providers: [
    DrasiAccessService,
    DraseisService,
    DraseisFinanceService,
    DraseisExportService,
    DraseisGroupsService,
    DraseisFormsService,
    DraseisPharmacyService,
  ],
  exports: [DraseisService],
})
export class DraseisModule {}
