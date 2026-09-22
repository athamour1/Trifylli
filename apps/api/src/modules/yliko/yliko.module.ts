import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { YlikoController } from './yliko.controller';
import { YlikoService } from './yliko.service';

@Module({
  controllers: [YlikoController],
  providers: [YlikoService, CheckoutService],
  exports: [YlikoService, CheckoutService],
})
export class YlikoModule {}
