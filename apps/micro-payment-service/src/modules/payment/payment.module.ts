import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PaymentConfig } from '../../core/payment.config';
import { PaymentGrpcController } from './api/grpc/payment-grpc.controller';
import { CreateCheckoutSessionHandler } from './application/commands/create-checkout-session.command';
import { ProcessWebhookEventHandler } from './application/commands/process-webhook-event.command';
import { ToggleAutoRenewHandler } from './application/commands/toggle-auto-renew.command';
import { GetCheckoutSessionStatusHandler } from './application/queries/get-checkout-session-status.query';
import { GetPaymentHistoryHandler } from './application/queries/get-payment-history.query';
import { GetSubscriptionsHandler } from './application/queries/get-subscriptions.query';
import { GetAvailableProductsHandler } from './application/queries/get-available-products.query';
import {
  ICheckoutStatusQueryPort,
  IPaymentHistoryQueryPort,
  ISubscriptionQueryPort,
} from './application/ports/payment-query.port';
import { IPaymentUnitOfWork } from './application/ports/payment-unit-of-work.port';
import { PaymentProviderResolver } from './application/ports/payment-provider-resolver.port';
import { PaymentProviderStrategy } from './application/ports/payment-provider.strategy';
import { PaymentWebhookProcessor } from './application/ports/payment-webhook-processor.port';
import {
  PAYMENT_PROVIDER_STRATEGIES,
  PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS,
} from './application/ports/payment-provider.tokens';
import { ICheckoutSessionRepository } from './domain/interfaces/checkout-session.repository.interface';
import { IPaymentTransactionRepository } from './domain/interfaces/payment-transaction.repository.interface';
import { IProductRepository } from './domain/interfaces/product.repository.interface';
import { IProductProviderRepository } from './domain/interfaces/product-provider.repository.interface';
import { IProviderCustomerRepository } from './domain/interfaces/provider-customer.repository.interface';
import { IProviderWebhookEventRepository } from './domain/interfaces/provider-webhook-event.repository.interface';
import { ISubscriptionRepository } from './domain/interfaces/subscription.repository.interface';
import { CheckoutSessionRepository } from './infrastructure/repositories/checkout-session.repository';
import { PaymentQueryRepository } from './infrastructure/repositories/payment-query.repository';
import { PaymentTransactionRepository } from './infrastructure/repositories/payment-transaction.repository';
import { PaymentUnitOfWork } from './infrastructure/repositories/payment-unit-of-work';
import { ProductRepository } from './infrastructure/repositories/product.repository';
import { ProductProviderRepository } from './infrastructure/repositories/product-provider.repository';
import { ProviderCustomerRepository } from './infrastructure/repositories/provider-customer.repository';
import { ProviderWebhookEventRepository } from './infrastructure/repositories/provider-webhook-event.repository';
import { SubscriptionRepository } from './infrastructure/repositories/subscription.repository';
import { PaymentProviderResolverService } from './infrastructure/providers/payment-provider.resolver';
import { PayPalPaymentProviderStrategy } from './infrastructure/providers/paypal-payment-provider.strategy';
import {
  stripeClientProvider,
  stripeStrategyConfigurationProvider,
} from './infrastructure/providers/stripe-client.provider';
import { StripePaymentProviderStrategy } from './infrastructure/providers/stripe-payment-provider.strategy';
import { InitialPaymentWebhookProcessor } from './application/services/initial-payment-webhook.processor';
import { AdditionalPaymentWebhookProcessor } from './application/services/additional-payment-webhook.processor';
import {
  IPaymentOutboxPublisher,
  IPaymentOutboxRelayRepository,
} from './application/ports/payment-outbox-relay.port';
import { PaymentOutboxRelayRepository } from './infrastructure/repositories/payment-outbox-relay.repository';
import { PaymentOutboxPublisher } from './infrastructure/messaging/payment-outbox.publisher';
import { PaymentOutboxRelayService } from './infrastructure/messaging/payment-outbox-relay.service';
import { SubscriptionLifecycleService } from './application/services/subscription-lifecycle.service';
import { SubscriptionLifecycleScheduler } from './infrastructure/schedulers/subscription-lifecycle.scheduler';
import { RecurringPaymentWebhookProcessor } from './application/services/recurring-payment-webhook.processor';
import { PaymentNotificationEventFactory } from './domain/payment-notification-event.factory';
import { StagePaidAccessNotificationService } from './application/services/stage-paid-access-notification.service';
import { ProcessDuePaymentNotificationScheduleService } from './application/services/process-due-payment-notification-schedule.service';
import { PaymentNotificationSchedulerTransport } from './infrastructure/messaging/payment-notification-scheduler.transport';
import { PaymentNotificationRecoveryService } from './application/services/payment-notification-recovery.service';
import { PaymentNotificationRecoveryScheduler } from './infrastructure/schedulers/payment-notification-recovery.scheduler';
import { IPaymentNotificationRecoveryRepository } from './domain/interfaces/payment-notification-schedule.repository.interface';
import { PaymentNotificationRecoveryRepository } from './infrastructure/repositories/payment-notification-schedule.repository';

const repositories = [
  { provide: IProductRepository, useClass: ProductRepository },
  { provide: IProductProviderRepository, useClass: ProductProviderRepository },
  { provide: IProviderCustomerRepository, useClass: ProviderCustomerRepository },
  { provide: ICheckoutSessionRepository, useClass: CheckoutSessionRepository },
  { provide: IPaymentTransactionRepository, useClass: PaymentTransactionRepository },
  { provide: ISubscriptionRepository, useClass: SubscriptionRepository },
  { provide: IProviderWebhookEventRepository, useClass: ProviderWebhookEventRepository },
  { provide: IPaymentUnitOfWork, useClass: PaymentUnitOfWork },
];

const queries = [
  PaymentQueryRepository,
  { provide: ISubscriptionQueryPort, useExisting: PaymentQueryRepository },
  { provide: IPaymentHistoryQueryPort, useExisting: PaymentQueryRepository },
  { provide: ICheckoutStatusQueryPort, useExisting: PaymentQueryRepository },
];

const providerStrategies = [
  stripeClientProvider,
  stripeStrategyConfigurationProvider,
  StripePaymentProviderStrategy,
  PayPalPaymentProviderStrategy,
  {
    provide: PAYMENT_PROVIDER_STRATEGIES,
    inject: [StripePaymentProviderStrategy, PayPalPaymentProviderStrategy],
    useFactory: (...strategies: PaymentProviderStrategy[]): readonly PaymentProviderStrategy[] =>
      Object.freeze(strategies),
  },
  PaymentProviderResolverService,
  { provide: PaymentProviderResolver, useExisting: PaymentProviderResolverService },
];

const grpcHandlers = [
  GetAvailableProductsHandler,
  CreateCheckoutSessionHandler,
  ProcessWebhookEventHandler,
  ToggleAutoRenewHandler,
  GetSubscriptionsHandler,
  GetPaymentHistoryHandler,
  GetCheckoutSessionStatusHandler,
];

const webhookProcessor = [
  {
    provide: PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS,
    inject: [PaymentConfig],
    useFactory: (config: PaymentConfig): number => config.webhookProcessingTimeoutSeconds,
  },
  InitialPaymentWebhookProcessor,
  AdditionalPaymentWebhookProcessor,
  RecurringPaymentWebhookProcessor,
  { provide: PaymentWebhookProcessor, useExisting: InitialPaymentWebhookProcessor },
];

const outboxRelay = [
  PaymentOutboxRelayRepository,
  { provide: IPaymentOutboxRelayRepository, useExisting: PaymentOutboxRelayRepository },
  PaymentOutboxPublisher,
  { provide: IPaymentOutboxPublisher, useExisting: PaymentOutboxPublisher },
  PaymentOutboxRelayService,
];

const subscriptionLifecycle = [SubscriptionLifecycleService, SubscriptionLifecycleScheduler];

const notificationFoundation = [
  PaymentNotificationEventFactory,
  StagePaidAccessNotificationService,
  ProcessDuePaymentNotificationScheduleService,
  PaymentNotificationSchedulerTransport,
  PaymentNotificationRecoveryService,
  PaymentNotificationRecoveryScheduler,
  PaymentNotificationRecoveryRepository,
  {
    provide: IPaymentNotificationRecoveryRepository,
    useExisting: PaymentNotificationRecoveryRepository,
  },
];

@Module({
  imports: [CqrsModule],
  providers: [
    ...repositories,
    ...queries,
    ...providerStrategies,
    ...webhookProcessor,
    ...grpcHandlers,
    ...outboxRelay,
    ...subscriptionLifecycle,
    ...notificationFoundation,
  ],
  controllers: [PaymentGrpcController],
  exports: [
    IProductRepository,
    IProductProviderRepository,
    IProviderCustomerRepository,
    ICheckoutSessionRepository,
    IPaymentTransactionRepository,
    ISubscriptionRepository,
    IProviderWebhookEventRepository,
    IPaymentUnitOfWork,
    ISubscriptionQueryPort,
    IPaymentHistoryQueryPort,
    ICheckoutStatusQueryPort,
    PaymentProviderResolver,
  ],
})
export class PaymentModule {}
