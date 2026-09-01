import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PaymentConfig } from './payment.config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PaymentConfig],
  exports: [PaymentConfig],
})
export class PaymentConfigModule {}
