import { Module } from '@nestjs/common';
import { ParousiologioController } from './parousiologio.controller';
import { ParousiologioService } from './parousiologio.service';

@Module({
  controllers: [ParousiologioController],
  providers: [ParousiologioService],
  exports: [ParousiologioService],
})
export class ParousiologioModule {}
