import { RecurringPaymentWebhookProcessor } from '../../src/modules/payment/application/services/recurring-payment-webhook.processor';
import {
  RenewalFailedProviderEvent,
  RenewalSucceededProviderEvent,
} from '../../src/modules/payment/application/ports/payment-provider.types';
import { IPaymentUnitOfWork } from '../../src/modules/payment/application/ports/payment-unit-of-work.port';
import { PaymentTransactionEntity } from '../../src/modules/payment/domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../src/modules/payment/domain/entities/product.entity';
import { ProviderWebhookEventEntity } from '../../src/modules/payment/domain/entities/provider-webhook-event.entity';
import { SubscriptionEntity } from '../../src/modules/payment/domain/entities/subscription.entity';
import { BillingInterval } from '../../src/modules/payment/domain/enums/billing-interval.enum';
import { PaymentTransactionStatus } from '../../src/modules/payment/domain/enums/payment-transaction-status.enum';
import { SubscriptionStatus } from '../../src/modules/payment/domain/enums/subscription-status.enum';
import { BillingPeriod } from '../../src/modules/payment/domain/value-objects/billing-period.value-object';
import { Currency } from '../../src/modules/payment/domain/value-objects/currency.value-object';
import { Money } from '../../src/modules/payment/domain/value-objects/money.value-object';
import { ProviderCode } from '../../src/modules/payment/domain/value-objects/provider-code.value-object';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_ID = '33333333-3333-4333-8333-333333333333';
const PROVIDER = new ProviderCode('STRIPE');
const INVOICE_ID = 'in_test_renewal';
const PERIOD_END = new Date('2026-08-08T00:00:00.000Z');
const NOW = new Date('2026-08-07T12:00:00.000Z');

function providerEvent(
  kind: 'RENEWAL_FAILED' | 'RENEWAL_SUCCEEDED',
  providerEventId: string,
): RenewalFailedProviderEvent | RenewalSucceededProviderEvent {
  const common = {
    provider: PROVIDER,
    providerEventId,
    providerEventType: kind === 'RENEWAL_FAILED' ? 'invoice.payment_failed' : 'invoice.paid',
    occurredAt: NOW.toISOString(),
    providerCustomerId: 'cus_test',
    providerCheckoutId: null,
    localCheckoutSessionId: null,
    providerSubscriptionId: 'sub_test',
    providerRenewalId: 'sched_test',
    providerTransactionId: kind === 'RENEWAL_SUCCEEDED' ? 'pi_test' : null,
    providerInvoiceId: INVOICE_ID,
    amountMinor: 800,
    currency: 'USD',
    billingReason: 'subscription_cycle' as const,
    providerProductId: 'prod_test',
    providerBillingId: 'price_test',
    paymentEvidenceValid: kind === 'RENEWAL_SUCCEEDED',
    supportedInvoiceShape: true,
    checkoutPurpose: null,
  };
  return kind === 'RENEWAL_FAILED'
    ? { ...common, kind, failureCode: 'CARD_DECLINED' }
    : { ...common, kind };
}

function journal(id: string, providerEventId: string): ProviderWebhookEventEntity {
  const event = ProviderWebhookEventEntity.createReceived({
    id,
    provider: PROVIDER,
    providerEventId,
    eventType: 'invoice.test',
    payload: {},
    receivedAt: NOW,
  });
  event.startProcessing(10);
  return event;
}

describe('Recurring payment webhook lifecycle', () => {
  it('keeps paid access after failure, recovers once, and ignores a late failure', async () => {
    const product = new ProductEntity({
      id: PRODUCT_ID,
      code: 'WEEK',
      name: 'Week subscription',
      billingInterval: BillingInterval.WEEK,
      billingIntervalCount: 1,
      price: new Money({ amountMinor: 800, currency: new Currency('USD') }),
    });
    const active = SubscriptionEntity.createPaidActive({
      id: ACTIVE_ID,
      userId: USER_ID,
      productId: PRODUCT_ID,
      provider: PROVIDER,
      providerSubscriptionId: 'sub_test',
      providerScheduleId: 'sched_test',
      providerStatus: 'active',
      sequence: 1,
      period: BillingPeriod.fromBoundaries({
        startsAt: new Date('2026-08-01T00:00:00.000Z'),
        endsAt: PERIOD_END,
      }),
    });
    const journals = new Map<string, ProviderWebhookEventEntity>([
      ['evt_failure', journal('44444444-4444-4444-8444-444444444444', 'evt_failure')],
      ['evt_success', journal('55555555-5555-4555-8555-555555555555', 'evt_success')],
      ['evt_late_failure', journal('66666666-6666-4666-8666-666666666666', 'evt_late_failure')],
    ]);
    let transaction: PaymentTransactionEntity | null = null;
    const insertedSubscriptions: SubscriptionEntity[] = [];
    const outboxEvents: unknown[] = [];
    const paymentTransactions = {
      findByProviderInvoiceId: jest.fn().mockImplementation(() => Promise.resolve(transaction)),
      insertOrGetByProviderInvoiceId: jest
        .fn()
        .mockImplementation((candidate: PaymentTransactionEntity) => {
          if (transaction) return Promise.resolve({ transaction, inserted: false });
          transaction = candidate;
          return Promise.resolve({ transaction, inserted: true });
        }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const subscriptions = {
      findByProviderSubscriptionId: jest.fn().mockResolvedValue(active),
      findLatestByUserId: jest.fn().mockResolvedValue(active),
      findActiveByUserId: jest.fn().mockResolvedValue(active),
      save: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockImplementation((value: SubscriptionEntity) => {
        insertedSubscriptions.push(value);
        return Promise.resolve();
      }),
    };
    const context = {
      databaseNow: jest.fn().mockResolvedValue(NOW),
      lockUser: jest.fn().mockResolvedValue(undefined),
      subscriptions,
      products: { findById: jest.fn().mockResolvedValue(product) },
      productProviders: {
        findActiveByProduct: jest.fn().mockResolvedValue({
          providerProductId: 'prod_test',
          providerBillingId: 'price_test',
        }),
      },
      providerCustomers: {
        findByUserAndProvider: jest.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
      },
      providerWebhookEvents: {
        findByProviderEventId: jest
          .fn()
          .mockImplementation(({ providerEventId }: { providerEventId: string }) =>
            Promise.resolve(journals.get(providerEventId)),
          ),
        save: jest.fn().mockResolvedValue(undefined),
      },
      paymentTransactions,
      outbox: {
        write: jest.fn().mockImplementation((event: unknown) => {
          outboxEvents.push(event);
          return Promise.resolve();
        }),
      },
    };
    const unitOfWork = {
      execute: jest.fn().mockImplementation((work) => work(context)),
    } as unknown as IPaymentUnitOfWork;
    const processor = new RecurringPaymentWebhookProcessor(unitOfWork);

    await processor.processFailure(
      providerEvent('RENEWAL_FAILED', 'evt_failure') as RenewalFailedProviderEvent,
    );
    expect(transaction?.getStatus()).toBe(PaymentTransactionStatus.FAILED);
    expect(active.getStatus()).toBe(SubscriptionStatus.ACTIVE);
    expect(active.getEndsAt()).toEqual(PERIOD_END);
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]).toEqual(expect.objectContaining({ eventType: 'payment.failed.v1' }));

    await processor.processSuccess(
      providerEvent('RENEWAL_SUCCEEDED', 'evt_success') as RenewalSucceededProviderEvent,
    );
    expect(transaction?.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
    expect(insertedSubscriptions).toHaveLength(1);
    expect(insertedSubscriptions[0].getStatus()).toBe(SubscriptionStatus.QUEUED);
    expect(insertedSubscriptions[0].getStartsAt()).toEqual(PERIOD_END);
    expect(active.getStatus()).toBe(SubscriptionStatus.ACTIVE);
    expect(active.getAutoRenew()).toBe(false);
    expect(outboxEvents).toHaveLength(2);
    expect(outboxEvents[1]).toEqual(expect.objectContaining({ eventType: 'payment.succeeded.v1' }));

    await processor.processFailure(
      providerEvent('RENEWAL_FAILED', 'evt_late_failure') as RenewalFailedProviderEvent,
    );
    expect(transaction?.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
    expect(insertedSubscriptions).toHaveLength(1);
    expect(outboxEvents).toHaveLength(2);
  });
});
