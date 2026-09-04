import { ProcessWebhookEventHandler } from '../../src/modules/payment/application/commands/process-webhook-event.command';
import { AdditionalPaymentWebhookProcessor } from '../../src/modules/payment/application/services/additional-payment-webhook.processor';
import { StagePaidAccessNotificationService } from '../../src/modules/payment/application/services/stage-paid-access-notification.service';
import { PaymentProviderResolver } from '../../src/modules/payment/application/ports/payment-provider-resolver.port';
import { PaymentProviderStrategy } from '../../src/modules/payment/application/ports/payment-provider.strategy';
import { PaymentWebhookProcessor } from '../../src/modules/payment/application/ports/payment-webhook-processor.port';
import { CheckoutPaymentSucceededProviderEvent } from '../../src/modules/payment/application/ports/payment-provider.types';
import { IPaymentUnitOfWork } from '../../src/modules/payment/application/ports/payment-unit-of-work.port';
import { CheckoutSessionEntity } from '../../src/modules/payment/domain/entities/checkout-session.entity';
import { PaymentTransactionEntity } from '../../src/modules/payment/domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../src/modules/payment/domain/entities/product.entity';
import { ProviderWebhookEventEntity } from '../../src/modules/payment/domain/entities/provider-webhook-event.entity';
import { SubscriptionEntity } from '../../src/modules/payment/domain/entities/subscription.entity';
import { IProviderWebhookEventRepository } from '../../src/modules/payment/domain/interfaces/provider-webhook-event.repository.interface';
import { BillingInterval } from '../../src/modules/payment/domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../src/modules/payment/domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../src/modules/payment/domain/enums/checkout-status.enum';
import { PaymentTransactionStatus } from '../../src/modules/payment/domain/enums/payment-transaction-status.enum';
import { SubscriptionStatus } from '../../src/modules/payment/domain/enums/subscription-status.enum';
import { BillingPeriod } from '../../src/modules/payment/domain/value-objects/billing-period.value-object';
import { Currency } from '../../src/modules/payment/domain/value-objects/currency.value-object';
import { IdempotencyKey } from '../../src/modules/payment/domain/value-objects/idempotency-key.value-object';
import { Money } from '../../src/modules/payment/domain/value-objects/money.value-object';
import { ProviderCode } from '../../src/modules/payment/domain/value-objects/provider-code.value-object';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_ID = '33333333-3333-4333-8333-333333333333';
const CHECKOUT_ID = '44444444-4444-4444-8444-444444444444';
const TRANSACTION_ID = '55555555-5555-4555-8555-555555555555';
const JOURNAL_ID = '66666666-6666-4666-8666-666666666666';
const PROVIDER = new ProviderCode('STRIPE');
const PAID_AT = new Date('2026-09-04T12:00:00.000Z');

function successEvent(): CheckoutPaymentSucceededProviderEvent {
  return {
    kind: 'CHECKOUT_PAYMENT_SUCCEEDED',
    provider: PROVIDER,
    providerEventId: 'evt_additional',
    providerEventType: 'checkout.session.completed',
    occurredAt: PAID_AT.toISOString(),
    providerCustomerId: 'cus_test',
    providerCheckoutId: 'cs_test_additional',
    localCheckoutSessionId: CHECKOUT_ID,
    providerSubscriptionId: null,
    providerRenewalId: null,
    providerTransactionId: 'pi_test_additional',
    providerInvoiceId: 'in_test_additional',
    amountMinor: 1_200,
    currency: 'USD',
    checkoutPurpose: CheckoutPurpose.ADDITIONAL_SUBSCRIPTION,
    productId: PRODUCT_ID,
  };
}

describe('Additional payment webhook lifecycle', () => {
  it('keeps disabled ACTIVE ownership and creates one auto-renewing QUEUED period with a stable schedule key', async () => {
    const product = new ProductEntity({
      id: PRODUCT_ID,
      code: 'MONTH',
      name: 'Month subscription',
      billingInterval: BillingInterval.MONTH,
      billingIntervalCount: 1,
      price: new Money({ amountMinor: 1_200, currency: new Currency('USD') }),
    });
    const active = SubscriptionEntity.createPaidActive({
      id: ACTIVE_ID,
      userId: USER_ID,
      productId: PRODUCT_ID,
      provider: PROVIDER,
      providerSubscriptionId: 'sub_current',
      providerScheduleId: null,
      providerStatus: 'active',
      sequence: 1,
      period: BillingPeriod.fromBoundaries({
        startsAt: new Date('2026-09-01T00:00:00.000Z'),
        endsAt: new Date('2026-09-08T00:00:00.000Z'),
      }),
    });
    active.disableAutoRenew({ providerStatus: 'active' });
    const checkout = CheckoutSessionEntity.create({
      id: CHECKOUT_ID,
      userId: USER_ID,
      productId: PRODUCT_ID,
      provider: PROVIDER,
      purpose: CheckoutPurpose.ADDITIONAL_SUBSCRIPTION,
      idempotencyKey: new IdempotencyKey('11111111-1111-4111-8111-111111111111'),
    });
    checkout.attachProviderCheckout({ providerCheckoutId: 'cs_test_additional', expiresAt: null });
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
      id: JOURNAL_ID,
      provider: PROVIDER,
      providerEventId: 'evt_additional',
      eventType: 'checkout.session.completed',
      payload: {},
      receivedAt: PAID_AT,
    });
    journal.startProcessing(10);
    const queue: SubscriptionEntity[] = [active];
    const synchronizeNextBilling = jest.fn().mockResolvedValue({
      provider: PROVIDER,
      providerCustomerId: 'cus_test',
      providerSubscriptionId: 'sub_current',
      providerRenewalId: 'sched_additional',
      providerStatus: 'not_started',
      autoRenewEnabled: true,
      nextBillingAt: '2026-10-08T00:00:00.000Z',
    });
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
      productProviders: {
        findActiveByProduct: jest.fn().mockResolvedValue({ providerBillingId: 'price_month' }),
      },
      providerCustomers: {
        findByUserAndProvider: jest.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
      },
      providerWebhookEvents: {
        findByProviderEventId: jest.fn().mockResolvedValue(journal),
        save: jest.fn().mockResolvedValue(undefined),
      },
      subscriptions: {
        findOrderedUnfinishedByUserId: jest.fn().mockImplementation(() => Promise.resolve(queue)),
        save: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockImplementation((subscription: SubscriptionEntity) => {
          queue.push(subscription);
          return Promise.resolve();
        }),
      },
      outbox: { write: jest.fn().mockResolvedValue(undefined) },
      notificationSchedules: {},
    };
    const unitOfWork = {
      execute: jest.fn().mockImplementation((work) => work(context)),
    } as unknown as IPaymentUnitOfWork;
    const resolver = {
      resolve: jest.fn().mockReturnValue({ synchronizeNextBilling }),
    } as unknown as PaymentProviderResolver;
    const stageNotification = {
      stage: jest.fn().mockResolvedValue({
        outcome: 'CREATED',
        schedule: { id: '77777777-7777-4777-8777-777777777777' },
      }),
    } as unknown as StagePaidAccessNotificationService;
    const schedulerTransport = { wake: jest.fn().mockResolvedValue(undefined) };
    const processor = new AdditionalPaymentWebhookProcessor(
      unitOfWork,
      resolver,
      stageNotification,
      schedulerTransport as never,
    );

    await processor.processSuccess(successEvent());

    const queued = queue[1];
    expect(transaction.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
    expect(checkout.getStatus()).toBe(CheckoutStatus.COMPLETED);
    expect(active.getAutoRenew()).toBe(false);
    expect(queued.getStatus()).toBe(SubscriptionStatus.QUEUED);
    expect(queued.getAutoRenew()).toBe(true);
    expect(queued.getProviderScheduleId()).toBe('sched_additional');
    expect(queued.getStartsAt()).toEqual(active.getEndsAt());
    expect(synchronizeNextBilling).toHaveBeenCalledTimes(1);
    expect(synchronizeNextBilling).toHaveBeenCalledWith(
      expect.objectContaining({ providerIdempotencyKey: `align-${CHECKOUT_ID}` }),
    );
  });

  it('acknowledges a terminal duplicate webhook without invoking the provider processing path again', async () => {
    const terminal = ProviderWebhookEventEntity.createReceived({
      id: JOURNAL_ID,
      provider: PROVIDER,
      providerEventId: 'evt_additional',
      eventType: 'checkout.session.completed',
      payload: {},
      receivedAt: PAID_AT,
    });
    terminal.startProcessing(10);
    terminal.markProcessed(PAID_AT);
    const strategy = {
      verifyAndParseWebhook: jest.fn().mockResolvedValue(successEvent()),
    } as unknown as PaymentProviderStrategy;
    const resolver = {
      resolve: jest.fn().mockReturnValue(strategy),
    } as unknown as PaymentProviderResolver;
    const webhookEvents = {
      insertOrGet: jest.fn().mockResolvedValue({ event: terminal, inserted: false }),
    } as unknown as IProviderWebhookEventRepository;
    const execute = jest.fn();
    const process = jest.fn();
    const unitOfWork = { execute } as unknown as IPaymentUnitOfWork;
    const processor = { process } as unknown as PaymentWebhookProcessor;
    const handler = new ProcessWebhookEventHandler(
      resolver,
      webhookEvents,
      unitOfWork,
      processor,
      300,
    );

    const result = await handler.execute({
      input: {
        provider: 'STRIPE',
        rawBody: new Uint8Array(),
        signatureHeaders: [],
        receivedAt: PAID_AT,
      },
    });

    expect(result).toEqual({ accepted: true, duplicate: true, status: 'PROCESSED' });
    expect(process).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
