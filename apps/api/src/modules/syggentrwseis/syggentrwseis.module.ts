import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SyggentrwseisController } from './syggentrwseis.controller';
import { SyggentrwseisService } from './syggentrwseis.service';

@Module({
  imports: [FilesModule],
  controllers: [SyggentrwseisController],
  providers: [SyggentrwseisService],
  exports: [SyggentrwseisService],
})
export class SyggentrwseisModule {}
