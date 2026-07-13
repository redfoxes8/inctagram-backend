import { Module } from '@nestjs/common';

import { PaymentGrpcClientModule } from './infrastructure/payment-grpc-client.module';
import { PaymentGrpcAdapter } from './infrastructure/payment-grpc.adapter';
import { PaymentController } from './api/payment.controller';
import { GetPaymentHistoryHandler } from './application/queries/get-payment-history.query';

@Module({
  imports: [PaymentGrpcClientModule],
  controllers: [PaymentController],
  providers: [PaymentGrpcAdapter, GetPaymentHistoryHandler],
  exports: [PaymentGrpcAdapter],
})
export class PaymentsModule {}
