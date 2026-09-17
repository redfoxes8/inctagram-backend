import {
  CreateCheckoutSessionCommand,
  CreateCheckoutSessionHandler,
} from '../../src/modules/payment/application/commands/create-checkout-session.command';
import { PaymentProviderResolver } from '../../src/modules/payment/application/ports/payment-provider-resolver.port';
import { PaymentProviderStrategy } from '../../src/modules/payment/application/ports/payment-provider.strategy';
import {
  IPaymentUnitOfWork,
  PaymentUnitOfWorkContext,
} from '../../src/modules/payment/application/ports/payment-unit-of-work.port';
import { CheckoutSessionEntity } from '../../src/modules/payment/domain/entities/checkout-session.entity';
import { PaymentTransactionEntity } from '../../src/modules/payment/domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../src/modules/payment/domain/entities/product.entity';
import { SubscriptionEntity } from '../../src/modules/payment/domain/entities/subscription.entity';
import { BillingInterval } from '../../src/modules/payment/domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../src/modules/payment/domain/enums/checkout-purpose.enum';
import { BillingPeriod } from '../../src/modules/payment/domain/value-objects/billing-period.value-object';
import { Currency } from '../../src/modules/payment/domain/value-objects/currency.value-object';
import { IdempotencyKey } from '../../src/modules/payment/domain/value-objects/idempotency-key.value-object';
import { Money } from '../../src/modules/payment/domain/value-objects/money.value-object';
import { ProviderCode } from '../../src/modules/payment/domain/value-objects/provider-code.value-object';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_ID = '33333333-3333-4333-8333-333333333333';
const QUEUED_ID = '44444444-4444-4444-8444-444444444444';
const CHECKOUT_ID = '55555555-5555-4555-8555-555555555555';
const TRANSACTION_ID = '66666666-6666-4666-8666-666666666666';
const PROVIDER = new ProviderCode('STRIPE');

function product(): ProductEntity {
  return new ProductEntity({
    id: PRODUCT_ID,
    code: 'MONTH',
    name: 'Month subscription',
    billingInterval: BillingInterval.MONTH,
    billingIntervalCount: 1,
    price: new Money({ amountMinor: 1_200, currency: new Currency('USD') }),
  });
}

function activeSubscription(endsAt: Date): SubscriptionEntity {
  return SubscriptionEntity.createPaidActive({
    id: ACTIVE_ID,
    userId: USER_ID,
    productId: PRODUCT_ID,
    provider: PROVIDER,
    providerSubscriptionId: 'sub_active',
    providerScheduleId: null,
    providerStatus: 'active',
    sequence: 1,
    period: BillingPeriod.fromBoundaries({
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt,
    }),
  });
}

function queuedSubscription(endsAt: Date): SubscriptionEntity {
  return SubscriptionEntity.createPaidQueued({
    id: QUEUED_ID,
    userId: USER_ID,
    productId: PRODUCT_ID,
    provider: PROVIDER,
    providerSubscriptionId: null,
    providerScheduleId: 'sched_queued',
    providerStatus: 'not_started',
    sequence: 2,
    period: BillingPeriod.fromBoundaries({
      startsAt: new Date('2026-10-01T00:00:00.000Z'),
      endsAt,
    }),
  });
}

function mockStrategy(): PaymentProviderStrategy {
  return {
    assertOperational: jest.fn(),
    createInitialSubscriptionCheckout: jest.fn().mockResolvedValue({
      providerCheckoutId: 'cs_initial',
      providerCustomerId: 'cus_test',
      checkoutUrl: 'https://checkout.stripe.com/test',
      expiresAt: null,
    }),
    createAdditionalSubscriptionCheckout: jest.fn().mockResolvedValue({
      providerCheckoutId: 'cs_additional',
      providerCustomerId: 'cus_test',
      checkoutUrl: 'https://checkout.stripe.com/test-additional',
      expiresAt: null,
    }),
    retrieveCheckout: jest.fn(),
    verifyAndParseWebhook: jest.fn(),
  } as unknown as PaymentProviderStrategy;
}

function mockContext(
  subscriptions: SubscriptionEntity[],
  existingCheckout?: CheckoutSessionEntity | null,
): PaymentUnitOfWorkContext {
  return {
    lockUser: jest.fn().mockResolvedValue(undefined),
    checkoutSessions: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(existingCheckout ?? null),
      findById: jest.fn().mockResolvedValue(existingCheckout ?? null),
      insert: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    },
    paymentTransactions: {
      findByCheckoutSessionId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      insert: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    },
    products: {
      findById: jest.fn().mockResolvedValue(product()),
    },
    productProviders: {
      findActiveByProduct: jest.fn().mockResolvedValue({
        providerProductId: 'price_month',
        providerBillingId: 'price_month',
      }),
    },
    providerCustomers: {
      findByUserAndProvider: jest.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
      insertIfAbsent: jest.fn().mockResolvedValue({ providerCustomerId: 'cus_test' }),
    },
    subscriptions: {
      findOrderedUnfinishedByUserId: jest.fn().mockResolvedValue(subscriptions),
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
    },
    outbox: { write: jest.fn().mockResolvedValue(undefined) },
    notificationSchedules: {},
    subscriptionReminders: {},
    providerWebhookEvents: {
      findByProviderEventId: jest.fn(),
      insertOrGet: jest.fn(),
      save: jest.fn(),
    },
    databaseNow: jest.fn().mockResolvedValue(new Date()),
  };
}

function mockUnitOfWork(context: PaymentUnitOfWorkContext): IPaymentUnitOfWork {
  return {
    execute: jest.fn().mockImplementation((work) => work(context)),
  } as unknown as IPaymentUnitOfWork;
}

function mockResolver(strategy: PaymentProviderStrategy): PaymentProviderResolver {
  return {
    resolve: jest.fn().mockReturnValue(strategy),
  } as unknown as PaymentProviderResolver;
}

describe('CreateCheckoutSessionHandler', () => {
  describe('ACTIVE + QUEUED chain', () => {
    it('creates additional checkout with providerSubscriptionId from ACTIVE and providerRenewalId from QUEUED tail', async () => {
      const activeEndsAt = new Date('2026-10-01T00:00:00.000Z');
      const queuedEndsAt = new Date('2026-11-01T00:00:00.000Z');
      const active = activeSubscription(activeEndsAt);
      const queued = queuedSubscription(queuedEndsAt);
      const subscriptions = [active, queued];

      const insertedCheckout = CheckoutSessionEntity.create({
        id: CHECKOUT_ID,
        userId: USER_ID,
        productId: PRODUCT_ID,
        provider: PROVIDER,
        purpose: CheckoutPurpose.ADDITIONAL_SUBSCRIPTION,
        idempotencyKey: new IdempotencyKey('test-idempotency-key'),
      });

      const strategy = mockStrategy();
      const context = mockContext(subscriptions);

      let capturedCheckoutId: string | null = null;
      context.checkoutSessions.insert = jest
        .fn()
        .mockImplementation((checkout: CheckoutSessionEntity) => {
          capturedCheckoutId = checkout.id;
          return Promise.resolve(undefined);
        });

      context.checkoutSessions.findById = jest.fn().mockImplementation((id: string) => {
        if (id === capturedCheckoutId) {
          return Promise.resolve(insertedCheckout);
        }
        return Promise.resolve(null);
      });

      const unitOfWork = mockUnitOfWork(context);
      const resolver = mockResolver(strategy);

      const handler = new CreateCheckoutSessionHandler(unitOfWork, resolver);

      const result = await handler.execute(
        new CreateCheckoutSessionCommand({
          userId: USER_ID,
          productId: PRODUCT_ID,
          provider: 'STRIPE',
          autoRenewConsent: true,
          successUrl: 'https://success.test',
          cancelUrl: 'https://cancel.test',
          idempotencyKey: 'test-idempotency-key',
        }),
      );

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/test-additional');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(strategy.createAdditionalSubscriptionCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProviderSubscriptionId: 'sub_active',
          currentProviderRenewalId: 'sched_queued',
          finalLocalEndsAt: queuedEndsAt.toISOString(),
        }),
      );
    });

    it('uses same split correlation for idempotent additional checkout', async () => {
      const activeEndsAt = new Date('2026-10-01T00:00:00.000Z');
      const queuedEndsAt = new Date('2026-11-01T00:00:00.000Z');
      const active = activeSubscription(activeEndsAt);
      const queued = queuedSubscription(queuedEndsAt);
      const subscriptions = [active, queued];

      const existingCheckout = CheckoutSessionEntity.create({
        id: CHECKOUT_ID,
        userId: USER_ID,
        productId: PRODUCT_ID,
        provider: PROVIDER,
        purpose: CheckoutPurpose.ADDITIONAL_SUBSCRIPTION,
        idempotencyKey: new IdempotencyKey('test-idempotency-key'),
      });
      existingCheckout.attachProviderCheckout({
        providerCheckoutId: 'cs_additional',
        expiresAt: null,
      });

      const strategy = {
        assertOperational: jest.fn(),
        createInitialSubscriptionCheckout: jest.fn(),
        createAdditionalSubscriptionCheckout: jest.fn(),
        retrieveCheckout: jest.fn().mockResolvedValue({
          providerCheckoutId: 'cs_additional',
          providerCustomerId: 'cus_test',
          checkoutUrl: 'https://checkout.stripe.com/test-additional',
          expiresAt: null,
        }),
        verifyAndParseWebhook: jest.fn(),
      } as unknown as PaymentProviderStrategy;

      const context = mockContext(subscriptions, existingCheckout);
      context.checkoutSessions.findByIdempotencyKey = jest.fn().mockResolvedValue(existingCheckout);
      context.checkoutSessions.findById = jest.fn().mockResolvedValue(existingCheckout);
      context.paymentTransactions.findByCheckoutSessionId = jest.fn().mockResolvedValue([
        PaymentTransactionEntity.createPendingPurchase({
          id: TRANSACTION_ID,
          userId: USER_ID,
          productId: PRODUCT_ID,
          checkoutSessionId: CHECKOUT_ID,
          provider: PROVIDER,
          money: product().getPrice(),
          idempotencyKey: new IdempotencyKey('transaction-test-idempotency-key'),
        }),
      ]);

      const unitOfWork = mockUnitOfWork(context);
      const resolver = mockResolver(strategy);

      const handler = new CreateCheckoutSessionHandler(unitOfWork, resolver);

      const result = await handler.execute(
        new CreateCheckoutSessionCommand({
          userId: USER_ID,
          productId: PRODUCT_ID,
          provider: 'STRIPE',
          autoRenewConsent: true,
          successUrl: 'https://success.test',
          cancelUrl: 'https://cancel.test',
          idempotencyKey: 'test-idempotency-key',
        }),
      );

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/test-additional');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(strategy.retrieveCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          localCheckoutSessionId: CHECKOUT_ID,
        }),
      );
    });
  });
});
