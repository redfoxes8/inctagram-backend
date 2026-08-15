import { ICheckoutSessionRepository } from '../../domain/interfaces/checkout-session.repository.interface';
import { IProductRepository } from '../../domain/interfaces/product.repository.interface';
import { IProductProviderRepository } from '../../domain/interfaces/product-provider.repository.interface';
import { IProviderCustomerRepository } from '../../domain/interfaces/provider-customer.repository.interface';
import { IProviderWebhookEventRepository } from '../../domain/interfaces/provider-webhook-event.repository.interface';
import { ITargetPaymentTransactionRepository } from '../../domain/interfaces/target-payment-transaction.repository.interface';
import { ITargetSubscriptionRepository } from '../../domain/interfaces/target-subscription.repository.interface';
import { IPaymentOutboxWriter } from './payment-outbox-writer.port';

export type PaymentUnitOfWorkContext = Readonly<{
  products: IProductRepository;
  productProviders: IProductProviderRepository;
  providerCustomers: IProviderCustomerRepository;
  checkoutSessions: ICheckoutSessionRepository;
  paymentTransactions: ITargetPaymentTransactionRepository;
  subscriptions: ITargetSubscriptionRepository;
  providerWebhookEvents: IProviderWebhookEventRepository;
  outbox: IPaymentOutboxWriter;
  lockUser(userId: string): Promise<void>;
}>;

export type PaymentUnitOfWorkCallback<TResult> = (
  context: PaymentUnitOfWorkContext,
) => Promise<TResult>;

export abstract class IPaymentUnitOfWork {
  abstract execute<TResult>(work: PaymentUnitOfWorkCallback<TResult>): Promise<TResult>;
}
