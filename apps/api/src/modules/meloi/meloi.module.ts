import { Module } from '@nestjs/common';
import { MeloiController } from './meloi.controller';
import { MeloiService } from './meloi.service';

@Module({
  controllers: [MeloiController],
  providers: [MeloiService],
  exports: [MeloiService],
})
export class MeloiModule {}
