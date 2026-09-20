import { Module } from '@nestjs/common';
import { ProodosController } from './proodos.controller';
import { ProodosService } from './proodos.service';

@Module({
  controllers: [ProodosController],
  providers: [ProodosService],
  exports: [ProodosService],
})
export class ProodosModule {}
