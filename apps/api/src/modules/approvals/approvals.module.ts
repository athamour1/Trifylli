import { Module } from '@nestjs/common';
import { CommentsModule } from '../comments/comments.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

/**
 * Έγκριση κοινών εγγράφων (συνεργασία, Φ11). Ποια εγκρίνονται και ποιος
 * εγκρίνει το λένε τα είδη τους (`CollabDocumentType.approval`).
 */
@Module({
  imports: [CommentsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
