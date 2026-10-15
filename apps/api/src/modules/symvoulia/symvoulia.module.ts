import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SymvouliaController } from './symvoulia.controller';
import { SymvouliaService } from './symvoulia.service';
import { SymvoulioCollab } from './symvoulio-collab';

@Module({
  imports: [FilesModule],
  controllers: [SymvouliaController],
  providers: [SymvouliaService, SymvoulioCollab],
  exports: [SymvouliaService],
})
export class SymvouliaModule {}
