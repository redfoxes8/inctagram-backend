import { PaymentConfig } from '../../src/core/payment.config';
import { SubscriptionLifecycleService } from '../../src/modules/payment/application/services/subscription-lifecycle.service';
import { IPaymentUnitOfWork } from '../../src/modules/payment/application/ports/payment-unit-of-work.port';
import { SubscriptionEntity } from '../../src/modules/payment/domain/entities/subscription.entity';
import { SubscriptionStatus } from '../../src/modules/payment/domain/enums/subscription-status.enum';
import { BillingPeriod } from '../../src/modules/payment/domain/value-objects/billing-period.value-object';
import { ProviderCode } from '../../src/modules/payment/domain/value-objects/provider-code.value-object';
import { SubscriptionLifecycleScheduler } from '../../src/modules/payment/infrastructure/schedulers/subscription-lifecycle.scheduler';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_ID = '33333333-3333-4333-8333-333333333333';
const QUEUED_ID = '44444444-4444-4444-8444-444444444444';
const STARTS_AT = new Date('2026-08-01T00:00:00.000Z');
const ENDS_AT = new Date('2026-08-08T00:00:00.000Z');
const NEXT_ENDS_AT = new Date('2026-08-15T00:00:00.000Z');

type LifecycleContext = {
  databaseNow: jest.Mock;
  lockUser: jest.Mock;
  subscriptions: {
    claimDueActive: jest.Mock;
    findOrderedUnfinishedByUserId: jest.Mock;
    save: jest.Mock;
  };
  outbox: { write: jest.Mock };
};

function subscription(input: {
  id: string;
  sequence: number;
  status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
  startsAt: Date;
  endsAt: Date;
}): SubscriptionEntity {
  const props = {
    id: input.id,
    userId: USER_ID,
    productId: PRODUCT_ID,
    provider: new ProviderCode('STRIPE'),
    providerSubscriptionId: 'sub_test',
    providerScheduleId: 'sub_sched_test',
    providerStatus: 'active',
    sequence: input.sequence,
    period: BillingPeriod.fromBoundaries({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    }),
  };
  return input.status === SubscriptionStatus.ACTIVE
    ? SubscriptionEntity.createPaidActive(props)
    : SubscriptionEntity.createPaidQueued(props);
}

function harness(input: {
  now: Date;
  claimed: SubscriptionEntity[];
  queue: SubscriptionEntity[];
}): {
  service: SubscriptionLifecycleService;
  context: LifecycleContext;
  execute: jest.Mock;
} {
  const context: LifecycleContext = {
    databaseNow: jest.fn().mockResolvedValue(input.now),
    lockUser: jest.fn().mockResolvedValue(undefined),
    subscriptions: {
      claimDueActive: jest.fn().mockResolvedValueOnce(input.claimed).mockResolvedValue([]),
      findOrderedUnfinishedByUserId: jest.fn().mockResolvedValue(input.queue),
      save: jest.fn().mockResolvedValue(undefined),
    },
    outbox: { write: jest.fn().mockResolvedValue(undefined) },
  };
  const execute = jest.fn().mockImplementation((work) => work(context));
  const unitOfWork = { execute } as unknown as IPaymentUnitOfWork;
  return { service: new SubscriptionLifecycleService(unitOfWork), context, execute };
}

describe('Subscription lifecycle', () => {
  it('uses startsAt inclusive and endsAt exclusive boundaries', () => {
    const period = BillingPeriod.fromBoundaries({ startsAt: STARTS_AT, endsAt: ENDS_AT });

    expect(period.contains(STARTS_AT)).toBe(true);
    expect(period.contains(new Date(ENDS_AT.getTime() - 1))).toBe(true);
    expect(period.contains(ENDS_AT)).toBe(false);
  });

  it('expires the final paid period once and emits one deactivation event', async () => {
    const active = subscription({
      id: ACTIVE_ID,
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
    });
    const { service, context } = harness({ now: ENDS_AT, claimed: [active], queue: [active] });

    await expect(service.runBatch(10)).resolves.toBe(1);
    await expect(service.runBatch(10)).resolves.toBe(0);

    expect(active.getStatus()).toBe(SubscriptionStatus.EXPIRED);
    expect(context.subscriptions.claimDueActive).toHaveBeenNthCalledWith(1, {
      dueAt: ENDS_AT,
      limit: 10,
    });
    expect(context.outbox.write).toHaveBeenCalledTimes(1);
    expect(context.outbox.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'subscription.expired.v1',
        payload: expect.objectContaining({ hasActiveReplacement: false }),
      }),
    );
  });

  it('activates a contiguous paid replacement without an entitlement gap', async () => {
    const active = subscription({
      id: ACTIVE_ID,
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
    });
    const queued = subscription({
      id: QUEUED_ID,
      sequence: 2,
      status: SubscriptionStatus.QUEUED,
      startsAt: ENDS_AT,
      endsAt: NEXT_ENDS_AT,
    });
    const { service, context } = harness({
      now: ENDS_AT,
      claimed: [active],
      queue: [active, queued],
    });

    await expect(service.runBatch(5)).resolves.toBe(1);

    expect(active.getStatus()).toBe(SubscriptionStatus.EXPIRED);
    expect(queued.getStatus()).toBe(SubscriptionStatus.ACTIVE);
    expect(queued.getStartsAt()).toEqual(ENDS_AT);
    expect(context.outbox.write).toHaveBeenCalledTimes(2);
    expect(context.outbox.write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: 'subscription.expired.v1',
        payload: expect.objectContaining({
          hasActiveReplacement: true,
          replacementSubscriptionId: QUEUED_ID,
        }),
      }),
    );
    expect(context.outbox.write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ eventType: 'subscription.activated.v1' }),
    );
  });

  it('passes the batch limit and rejects duplicate users in one claim', async () => {
    const first = subscription({
      id: ACTIVE_ID,
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
    });
    const duplicateUser = subscription({
      id: QUEUED_ID,
      sequence: 2,
      status: SubscriptionStatus.ACTIVE,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
    });
    const { service, context } = harness({
      now: ENDS_AT,
      claimed: [first, duplicateUser],
      queue: [first],
    });

    await expect(service.runBatch(2)).rejects.toThrow(
      'Subscription lifecycle claim contains a duplicate user',
    );
    expect(context.subscriptions.claimDueActive).toHaveBeenCalledWith({
      dueAt: ENDS_AT,
      limit: 2,
    });
  });

  it('changes auto-renew without shortening the paid period', () => {
    const active = subscription({
      id: ACTIVE_ID,
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
    });

    active.disableAutoRenew({ providerStatus: 'canceled' });
    active.disableAutoRenew({ providerStatus: 'canceled' });

    expect(active.getAutoRenew()).toBe(false);
    expect(active.getStatus()).toBe(SubscriptionStatus.ACTIVE);
    expect(active.getEndsAt()).toEqual(ENDS_AT);

    active.enableAutoRenew({
      providerSubscriptionId: 'sub_test',
      providerScheduleId: 'sub_sched_test',
      providerStatus: 'not_started',
      nextBillingAt: ENDS_AT,
    });
    expect(active.getAutoRenew()).toBe(true);
    expect(active.getNextBillingAt()).toEqual(ENDS_AT);
  });

  it('prevents overlapping scheduler batches and performs no DB work when disabled', async () => {
    let finish: (() => void) | undefined;
    const runBatch = jest.fn().mockReturnValue(
      new Promise<number>((resolve) => {
        finish = () => resolve(0);
      }),
    );
    const enabledConfig = {
      subscriptionLifecycleEnabled: true,
      subscriptionCheckCron: '* * * * * *',
      subscriptionLifecycleBatchSize: 5,
    } as PaymentConfig;
    const scheduler = new SubscriptionLifecycleScheduler(enabledConfig, { runBatch } as never);

    scheduler.tick();
    scheduler.tick();
    expect(runBatch).toHaveBeenCalledTimes(1);
    finish?.();
    await Promise.resolve();

    const disabledRun = jest.fn();
    const disabled = new SubscriptionLifecycleScheduler(
      { ...enabledConfig, subscriptionLifecycleEnabled: false } as PaymentConfig,
      { runBatch: disabledRun } as never,
    );
    disabled.tick();
    expect(disabledRun).not.toHaveBeenCalled();
  });
});
