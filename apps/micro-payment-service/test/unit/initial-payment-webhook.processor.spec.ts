import { InitialPaymentWebhookProcessor } from '../../src/modules/payment/application/services/initial-payment-webhook.processor';
import { AdditionalPaymentWebhookProcessor } from '../../src/modules/payment/application/services/additional-payment-webhook.processor';
import { RecurringPaymentWebhookProcessor } from '../../src/modules/payment/application/services/recurring-payment-webhook.processor';
import { CheckoutPaymentSucceededProviderEvent } from '../../src/modules/payment/application/ports/payment-provider.types';
import { IPaymentUnitOfWork } from '../../src/modules/payment/application/ports/payment-unit-of-work.port';
import { CheckoutSessionEntity } from '../../src/modules/payment/domain/entities/checkout-session.entity';
import { PaymentTransactionEntity } from '../../src/modules/payment/domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../src/modules/payment/domain/entities/product.entity';
import { ProviderWebhookEventEntity } from '../../src/modules/payment/domain/entities/provider-webhook-event.entity';
import { BillingInterval } from '../../src/modules/payment/domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../src/modules/payment/domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../src/modules/payment/domain/enums/checkout-status.enum';
import { PaymentTransactionStatus } from '../../src/modules/payment/domain/enums/payment-transaction-status.enum';
import { Currency } from '../../src/modules/payment/domain/value-objects/currency.value-object';
import { IdempotencyKey } from '../../src/modules/payment/domain/value-objects/idempotency-key.value-object';
import { Money } from '../../src/modules/payment/domain/value-objects/money.value-object';
import { ProviderCode } from '../../src/modules/payment/domain/value-objects/provider-code.value-object';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const CHECKOUT_ID = '33333333-3333-4333-8333-333333333333';
const TRANSACTION_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER = new ProviderCode('STRIPE');
const PAID_AT = new Date('2026-08-01T00:00:00.000Z');

describe('Initial payment webhook lifecycle', () => {
  it('atomically creates one active paid period and two outbox events', async () => {
    const product = new ProductEntity({
      id: PRODUCT_ID,
      code: 'WEEK',
      name: 'Week subscription',
      billingInterval: BillingInterval.WEEK,
      billingIntervalCount: 1,
      price: new Money({ amountMinor: 800, currency: new Currency('USD') }),
    });
    const checkout = CheckoutSessionEntity.create({
      id: CHECKOUT_ID,
      userId: USER_ID,
      productId: PRODUCT_ID,
      provider: PROVIDER,
      purpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
      idempotencyKey: new IdempotencyKey('11111111-1111-4111-8111-111111111111'),
    });
    checkout.attachProviderCheckout({ providerCheckoutId: 'cs_test', expiresAt: null });
    const transaction = PaymentTransactionEntity.createPendingPurchase({
      id: TRANSACTION_ID,
      userId: USER_ID,
      productId: PRODUCT_ID,
      checkoutSessionId: CHECKOUT_ID,
      provider: PROVIDER,
      money: product.getPrice(),
      idempotencyKey: new IdempotencyKey('22222222-2222-4222-8222-222222222222'),
    });
    const journal = ProviderWebhookEventEntity.createReceived({
      id: '55555555-5555-4555-8555-555555555555',
      provider: PROVIDER,
      providerEventId: 'evt_initial',
      eventType: 'checkout.session.completed',
      payload: {},
      receivedAt: PAID_AT,
    });
    journal.startProcessing(10);
    const insertedSubscriptions: unknown[] = [];
    const outboxEvents: unknown[] = [];
    const context = {
      lockUser: jest.fn().mockResolvedValue(undefined),
      checkoutSessions: {
        findByProviderCheckoutId: jest.fn().mockResolvedValue(checkout),
        findById: jest.fn().mockResolvedValue(checkout),
        save: jest.fn().mockResolvedValue(undefined),
      },
      paymentTransactions: {
        findByCheckoutSessionId: jest.fn().mockResolvedValue([transaction]),
        save: jest.fn().mockResolvedValue(undefined),
      },
      products: { findById: jest.fn().mockResolvedValue(product) },
      providerCustomers: {
        findByUserAndProvider: jest.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
      },
      providerWebhookEvents: {
        findByProviderEventId: jest.fn().mockResolvedValue(journal),
        save: jest.fn().mockResolvedValue(undefined),
      },
      subscriptions: {
        findOrderedUnfinishedByUserId: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockImplementation((value: unknown) => {
          insertedSubscriptions.push(value);
          return Promise.resolve();
        }),
      },
      outbox: {
        write: jest.fn().mockImplementation((value: unknown) => {
          outboxEvents.push(value);
          return Promise.resolve();
        }),
      },
    };
    const unitOfWork = {
      execute: jest.fn().mockImplementation((work) => work(context)),
    } as unknown as IPaymentUnitOfWork;
    const processor = new InitialPaymentWebhookProcessor(
      unitOfWork,
      {} as AdditionalPaymentWebhookProcessor,
      {} as RecurringPaymentWebhookProcessor,
    );
    const event: CheckoutPaymentSucceededProviderEvent = {
      kind: 'CHECKOUT_PAYMENT_SUCCEEDED',
      provider: PROVIDER,
      providerEventId: 'evt_initial',
      providerEventType: 'checkout.session.completed',
      occurredAt: PAID_AT.toISOString(),
      providerCustomerId: 'cus_test',
      providerCheckoutId: 'cs_test',
      localCheckoutSessionId: CHECKOUT_ID,
      providerSubscriptionId: 'sub_test',
      providerRenewalId: 'sched_test',
      providerTransactionId: 'pi_test',
      providerInvoiceId: 'in_test',
      amountMinor: 800,
      currency: 'USD',
      checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
      productId: PRODUCT_ID,
    };

    await processor.process(event);

    expect(transaction.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
    expect(checkout.getStatus()).toBe(CheckoutStatus.COMPLETED);
    expect(insertedSubscriptions).toHaveLength(1);
    expect(outboxEvents).toHaveLength(2);
    expect(outboxEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'payment.succeeded.v1' }),
        expect.objectContaining({ eventType: 'subscription.activated.v1' }),
      ]),
    );
  });
});
