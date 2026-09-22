import { Module } from '@nestjs/common';
import { SyndromesController } from './syndromes.controller';
import { SyndromesService } from './syndromes.service';

@Module({
  controllers: [SyndromesController],
  providers: [SyndromesService],
  exports: [SyndromesService],
})
export class SyndromesModule {}
