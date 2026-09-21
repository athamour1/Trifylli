import { Module } from '@nestjs/common';
import { YlikoModule } from '../yliko/yliko.module';
import { DraseisController } from './draseis.controller';
import { DraseisService } from './draseis.service';

@Module({
  imports: [YlikoModule],
  controllers: [DraseisController],
  providers: [DraseisService],
  exports: [DraseisService],
})
export class DraseisModule {}
