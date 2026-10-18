import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SymvouliaController } from './symvoulia.controller';
import { SymvouliaPollsService } from './symvoulia-polls.service';
import { SymvouliaService } from './symvoulia.service';
import { SymvoulioAccess } from './symvoulio-access';
import { SymvoulioCollab } from './symvoulio-collab';
import { DrasiAccessService } from '../draseis/drasi-access.service';

@Module({
  imports: [FilesModule],
  controllers: [SymvouliaController],
  // `DrasiAccessService`: τα συμβούλια μιας δράσης ακολουθούν τους ρόλους της.
  providers: [SymvouliaService, SymvouliaPollsService, SymvoulioCollab, SymvoulioAccess, DrasiAccessService],
  exports: [SymvouliaService],
})
export class SymvouliaModule {}
