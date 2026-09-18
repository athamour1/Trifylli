import { Module } from '@nestjs/common';
import { TopikoController } from './topiko.controller';
import { TopikoService } from './topiko.service';

@Module({
  controllers: [TopikoController],
  providers: [TopikoService],
  exports: [TopikoService],
})
export class TopikoModule {}
