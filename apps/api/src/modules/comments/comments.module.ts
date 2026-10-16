import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

/**
 * Σχόλια + @αναφορές στα κοινά έγγραφα (συνεργασία, Φ9). Ποια έγγραφα
 * σχολιάζονται, τι είναι και ποιος αναφέρεται το λένε τα είδη τους
 * (`CollabDocumentType.about` / `people`) — εδώ ζουν μόνο τα νήματα.
 */
@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
