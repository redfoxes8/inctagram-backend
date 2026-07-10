import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PaymentConfig } from './payment.config';

@Module({
  imports: [ConfigModule],
  providers: [PaymentConfig],
  exports: [PaymentConfig],
})
export class PaymentConfigModule {}
