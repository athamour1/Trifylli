import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { YlikoModule } from '../yliko/yliko.module';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisController } from './draseis.controller';
import { DraseisDossierService } from './draseis-dossier.service';
import { DraseisExportService } from './draseis-export.service';
import { DraseisFinanceController } from './draseis-finance.controller';
import { DraseisFinanceService } from './draseis-finance.service';
import { DraseisFormsController, PublicFormsController } from './draseis-forms.controller';
import { DraseisFormsService } from './draseis-forms.service';
import { DraseisGroupsController } from './draseis-groups.controller';
import { DraseisGroupsService } from './draseis-groups.service';
import { DraseisMythosController } from './draseis-mythos.controller';
import { DraseisMythosService } from './draseis-mythos.service';
import { DraseisPharmacyService } from './draseis-pharmacy.service';
import { DraseisPlanController } from './draseis-plan.controller';
import { DraseisPlanService } from './draseis-plan.service';
import { DraseisReviewController, PublicReviewController } from './draseis-review.controller';
import { DraseisReviewService } from './draseis-review.service';
import { DraseisService } from './draseis.service';

@Module({
  // IntegrationsModule: το e-SEO δίνει το όνομα φιλοξενούμενου Τοπικού από τον κωδικό του.
  // FilesModule: αποδείξεις του ταμείου δράσης.
  imports: [YlikoModule, IntegrationsModule, FilesModule],
  controllers: [
    DraseisController,
    DraseisFinanceController,
    DraseisGroupsController,
    DraseisFormsController,
    PublicFormsController,
    DraseisPlanController,
    DraseisMythosController,
    DraseisReviewController,
    PublicReviewController,
  ],
  providers: [
    DrasiAccessService,
    DraseisService,
    DraseisFinanceService,
    DraseisExportService,
    DraseisGroupsService,
    DraseisFormsService,
    DraseisPharmacyService,
    DraseisPlanService,
    DraseisMythosService,
    DraseisReviewService,
    DraseisDossierService,
  ],
  exports: [DraseisService],
})
export class DraseisModule {}
