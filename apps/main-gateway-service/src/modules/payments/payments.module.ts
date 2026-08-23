import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PaymentGrpcClientModule } from './infrastructure/payment-grpc-client.module';
import { PaymentGrpcAdapter } from './infrastructure/payment-grpc.adapter';
import { PaymentController } from './api/payment.controller';
import { GetPaymentHistoryHandler } from './application/queries/get-payment-history.query';
import { ProcessWebhookEventHandler } from './application/commands/process-webhook-event.command';
import { CreateCheckoutSessionHandler } from './application/commands/create-checkout-session.command';
import { ToggleAutoRenewHandler } from './application/commands/toggle-auto-renew.command';
import { GetSubscriptionsHandler } from './application/queries/get-subscriptions.query';
import { GetCheckoutSessionStatusHandler } from './application/queries/get-checkout-session-status.query';

const paymentHandlers = [
  CreateCheckoutSessionHandler,
  ProcessWebhookEventHandler,
  ToggleAutoRenewHandler,
  GetSubscriptionsHandler,
  GetPaymentHistoryHandler,
  GetCheckoutSessionStatusHandler,
];

@Module({
  imports: [CqrsModule, PaymentGrpcClientModule],
  controllers: [PaymentController],
  providers: [PaymentGrpcAdapter, ...paymentHandlers],
  exports: [PaymentGrpcAdapter],
})
export class PaymentsModule {}
