import { ICheckoutSessionRepository } from '../../domain/interfaces/checkout-session.repository.interface';
import { IProductRepository } from '../../domain/interfaces/product.repository.interface';
import { IProductProviderRepository } from '../../domain/interfaces/product-provider.repository.interface';
import { IProviderCustomerRepository } from '../../domain/interfaces/provider-customer.repository.interface';
import { IProviderWebhookEventRepository } from '../../domain/interfaces/provider-webhook-event.repository.interface';
import { IPaymentTransactionRepository } from '../../domain/interfaces/payment-transaction.repository.interface';
import { ISubscriptionRepository } from '../../domain/interfaces/subscription.repository.interface';
import { IPaymentOutboxWriter } from './payment-outbox-writer.port';
import { IPaymentNotificationScheduleRepository } from '../../domain/interfaces/payment-notification-schedule.repository.interface';
import { ISubscriptionReminderRepository } from '../../domain/interfaces/subscription-reminder.repository.interface';
import { ISubscriptionReminderBackfillRepository } from '../../domain/interfaces/subscription-reminder-backfill.repository.interface';

export type PaymentUnitOfWorkContext = Readonly<{
  databaseNow: () => Promise<Date>;
  products: IProductRepository;
  productProviders: IProductProviderRepository;
  providerCustomers: IProviderCustomerRepository;
  checkoutSessions: ICheckoutSessionRepository;
  paymentTransactions: IPaymentTransactionRepository;
  subscriptions: ISubscriptionRepository;
  providerWebhookEvents: IProviderWebhookEventRepository;
  notificationSchedules: IPaymentNotificationScheduleRepository;
  subscriptionReminders: ISubscriptionReminderRepository;
  subscriptionReminderBackfill: ISubscriptionReminderBackfillRepository;
  outbox: IPaymentOutboxWriter;
  lockUser(userId: string): Promise<void>;
  lockUsers(userIds: string[]): Promise<void>;
}>;

export type PaymentUnitOfWorkCallback<TResult> = (
  context: PaymentUnitOfWorkContext,
) => Promise<TResult>;

export abstract class IPaymentUnitOfWork {
  abstract execute<TResult>(work: PaymentUnitOfWorkCallback<TResult>): Promise<TResult>;
}
