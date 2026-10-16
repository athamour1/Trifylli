import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SyggentrwseisController } from './syggentrwseis.controller';
import { SyggentrwseisService } from './syggentrwseis.service';
import { SyggentrwshCollab } from './syggentrwsh-collab';

@Module({
  imports: [FilesModule],
  controllers: [SyggentrwseisController],
  providers: [SyggentrwseisService, SyggentrwshCollab],
  exports: [SyggentrwseisService],
})
export class SyggentrwseisModule {}
