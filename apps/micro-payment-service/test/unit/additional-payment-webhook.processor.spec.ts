import { ProcessWebhookEventHandler } from '../../src/modules/payment/application/commands/process-webhook-event.command';
import { AdditionalPaymentWebhookProcessor } from '../../src/modules/payment/application/services/additional-payment-webhook.processor';
import { StagePaidAccessNotificationService } from '../../src/modules/payment/application/services/stage-paid-access-notification.service';
import { StageSubscriptionRemindersService } from '../../src/modules/payment/application/services/stage-subscription-reminders.service';
import { PaymentProviderResolver } from '../../src/modules/payment/application/ports/payment-provider-resolver.port';
import { PaymentProviderStrategy } from '../../src/modules/payment/application/ports/payment-provider.strategy';
import { PaymentWebhookProcessor } from '../../src/modules/payment/application/ports/payment-webhook-processor.port';
import { StripePaymentProviderStrategy } from '../../src/modules/payment/infrastructure/providers/stripe-payment-provider.strategy';
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
  function stripeStrategyClient(input: { currentScheduleStatus: string }) {
    const subscriptionsUpdate = jest.fn().mockResolvedValue(undefined);
    const schedulesCancel = jest.fn().mockResolvedValue(undefined);
    const schedulesCreate = jest.fn().mockResolvedValue({
      id: 'sub_sched_new',
      livemode: false,
      status: 'not_started',
    });
    return {
      client: {
        paymentIntents: {
          retrieve: jest.fn().mockResolvedValue({
            livemode: false,
            status: 'succeeded',
            setup_future_usage: 'off_session',
            customer: 'cus_test',
            payment_method: 'pm_test',
          }),
        },
        customers: { update: jest.fn().mockResolvedValue(undefined) },
        subscriptions: { update: subscriptionsUpdate },
        subscriptionSchedules: {
          retrieve: jest.fn().mockResolvedValue({ status: input.currentScheduleStatus }),
          cancel: schedulesCancel,
          create: schedulesCreate,
        },
      },
      subscriptionsUpdate,
      schedulesCancel,
      schedulesCreate,
    };
  }

  function synchronizeCommand(input: { currentProviderSubscriptionId: string | null }) {
    return {
      userId: USER_ID,
      subscriptionId: ACTIVE_ID,
      provider: PROVIDER,
      providerCustomerId: 'cus_test',
      currentProviderSubscriptionId: input.currentProviderSubscriptionId,
      currentProviderRenewalId: 'sub_sched_canceled',
      providerBillingId: 'price_month',
      confirmedProviderTransactionId: 'pi_test_additional',
      billingInterval: BillingInterval.MONTH,
      billingIntervalCount: 1,
      finalLocalEndsAt: '2026-10-08T00:00:00.000Z',
      providerIdempotencyKey: 'align-test',
    };
  }

  it('skips subscription update and does not recancel a canceled schedule for prepaid ACTIVE', async () => {
    const { client, schedulesCancel, schedulesCreate, subscriptionsUpdate } = stripeStrategyClient({
      currentScheduleStatus: 'canceled',
    });
    const strategy = new StripePaymentProviderStrategy(client as never, {
      environment: 'test',
      webhookSecret: 'test',
    });

    const result = await strategy.synchronizeNextBilling(
      synchronizeCommand({ currentProviderSubscriptionId: null }),
    );

    expect(subscriptionsUpdate).not.toHaveBeenCalled();
    expect(schedulesCancel).not.toHaveBeenCalled();
    expect(schedulesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: 1_791_417_600 }),
      expect.anything(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        providerSubscriptionId: null,
        providerRenewalId: 'sub_sched_new',
      }),
    );
  });

  it('preserves subscription update and replacement of a not-started schedule when the ID exists', async () => {
    const { client, schedulesCancel, schedulesCreate, subscriptionsUpdate } = stripeStrategyClient({
      currentScheduleStatus: 'not_started',
    });
    const strategy = new StripePaymentProviderStrategy(client as never, {
      environment: 'test',
      webhookSecret: 'test',
    });

    await strategy.synchronizeNextBilling(
      synchronizeCommand({ currentProviderSubscriptionId: 'sub_current' }),
    );

    expect(subscriptionsUpdate).toHaveBeenCalledWith(
      'sub_current',
      { cancel_at_period_end: true },
      { idempotencyKey: 'align-test-subscription' },
    );
    expect(schedulesCancel).toHaveBeenCalledWith('sub_sched_canceled');
    expect(schedulesCreate).toHaveBeenCalledTimes(1);
  });

  it('creates a new queued period after prepaid ACTIVE and a canceled queued tail', async () => {
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
      providerSubscriptionId: null,
      providerScheduleId: null,
      providerStatus: null,
      sequence: 1,
      period: BillingPeriod.fromBoundaries({
        startsAt: new Date('2026-09-01T00:00:00.000Z'),
        endsAt: new Date('2026-09-08T00:00:00.000Z'),
      }),
    });
    active.disableAutoRenew({ providerStatus: null });
    const tail = SubscriptionEntity.createPaidQueued({
      id: '77777777-7777-4777-8777-777777777777',
      userId: USER_ID,
      productId: PRODUCT_ID,
      provider: PROVIDER,
      providerSubscriptionId: null,
      providerScheduleId: 'sub_sched_canceled',
      providerStatus: 'canceled',
      sequence: 2,
      period: BillingPeriod.fromBoundaries({
        startsAt: active.getEndsAt(),
        endsAt: new Date('2026-10-08T00:00:00.000Z'),
      }),
    });
    tail.disableAutoRenew({ providerStatus: 'canceled' });
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
    const queue: SubscriptionEntity[] = [active, tail];
    const synchronizeNextBilling = jest.fn().mockResolvedValue({
      provider: PROVIDER,
      providerCustomerId: 'cus_test',
      providerSubscriptionId: null,
      providerRenewalId: 'sched_additional',
      providerStatus: 'not_started',
      autoRenewEnabled: true,
      nextBillingAt: '2026-11-08T00:00:00.000Z',
    });
    const context = {
      databaseNow: jest.fn().mockResolvedValue(PAID_AT),
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
      subscriptionReminders: {},
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
    const stageBatch = jest.fn().mockResolvedValue({
      created: 2,
      updated: 0,
      suppressed: 0,
      pastDueSkipped: 0,
    });
    const stageReminders = {
      stageBatch,
    } as unknown as StageSubscriptionRemindersService;
    const processor = new AdditionalPaymentWebhookProcessor(
      unitOfWork,
      resolver,
      stageNotification,
      stageReminders,
      schedulerTransport as never,
    );

    await processor.processSuccess(successEvent());

    const queued = queue[2];
    expect(transaction.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
    expect(checkout.getStatus()).toBe(CheckoutStatus.COMPLETED);
    expect(tail.getAutoRenew()).toBe(false);
    expect(queued.getStatus()).toBe(SubscriptionStatus.QUEUED);
    expect(queued.getAutoRenew()).toBe(true);
    expect(queued.getProviderScheduleId()).toBe('sched_additional');
    expect(queued.getStartsAt()).toEqual(tail.getEndsAt());
    expect(synchronizeNextBilling).toHaveBeenCalledTimes(1);
    expect(synchronizeNextBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProviderSubscriptionId: null,
        currentProviderRenewalId: 'sub_sched_canceled',
        providerIdempotencyKey: `align-${CHECKOUT_ID}`,
      }),
    );
    expect(stageBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        periods: [
          expect.objectContaining({ subscription: tail, immediateSuccessor: queued }),
          expect.objectContaining({ subscription: queued, immediateSuccessor: null }),
        ],
      }),
      context.subscriptionReminders,
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
