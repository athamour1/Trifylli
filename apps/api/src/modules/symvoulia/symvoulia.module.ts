import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SymvouliaController } from './symvoulia.controller';
import { SymvouliaService } from './symvoulia.service';

@Module({
  imports: [FilesModule],
  controllers: [SymvouliaController],
  providers: [SymvouliaService],
  exports: [SymvouliaService],
})
export class SymvouliaModule {}
