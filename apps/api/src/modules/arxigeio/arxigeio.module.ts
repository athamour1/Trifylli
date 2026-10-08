import { Module } from '@nestjs/common';
import { ArxigeioController } from './arxigeio.controller';
import { ArxigeioService } from './arxigeio.service';

@Module({
  controllers: [ArxigeioController],
  providers: [ArxigeioService],
})
export class ArxigeioModule {}
