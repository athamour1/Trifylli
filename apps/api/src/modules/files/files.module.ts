import { Module } from '@nestjs/common';
import { DrasiAccessService } from '../draseis/drasi-access.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  // Η πρόσβαση στη δράση (χωρίς άλλες εξαρτήσεις): απόδειξη ή υπογραφή δράσης
  // τη βλέπει όποιος βλέπει την ενότητά της.
  providers: [FilesService, DrasiAccessService],
  exports: [FilesService],
})
export class FilesModule {}
