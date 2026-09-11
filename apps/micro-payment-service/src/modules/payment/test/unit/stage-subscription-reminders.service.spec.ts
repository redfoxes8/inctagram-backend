import { StageSubscriptionRemindersService } from '../../application/services/stage-subscription-reminders.service';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { SubscriptionReminderNotificationType } from '../../domain/enums/subscription-reminder-notification-type.enum';
import { SubscriptionReminderStatus } from '../../domain/enums/subscription-reminder-status.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import {
  ISubscriptionReminderRepository,
  ReconcileSubscriptionReminderSlotsInput,
  SubscriptionReminderReconciliationResult,
  SubscriptionReminderSlot,
  UpdatePendingSubscriptionRemindersInput,
} from '../../domain/interfaces/subscription-reminder.repository.interface';
import { BillingPeriod } from '../../domain/value-objects/billing-period.value-object';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

type StoredSlot = SubscriptionReminderSlot & {
  status: SubscriptionReminderStatus;
};

class InMemorySubscriptionReminderRepository extends ISubscriptionReminderRepository {
  public readonly slots: StoredSlot[] = [];

  public reconcile(
    input: ReconcileSubscriptionReminderSlotsInput,
  ): Promise<SubscriptionReminderReconciliationResult> {
    let created = 0;
    let updated = 0;
    for (const slot of input.slotsToCreate) {
      if (this.find(slot)) continue;
      this.slots.push({ ...slot, status: SubscriptionReminderStatus.PENDING });
      created += 1;
    }
    for (const desired of input.desiredSlots) {
      const existing = this.find(desired);
      if (
        !existing ||
        existing.status !== SubscriptionReminderStatus.PENDING ||
        (existing.notificationType === desired.notificationType &&
          existing.expectedAutoRenew === desired.expectedAutoRenew)
      ) {
        continue;
      }
      existing.notificationType = desired.notificationType;
      existing.expectedAutoRenew = desired.expectedAutoRenew;
      updated += 1;
    }
    return Promise.resolve({ created, updated });
  }

  public suppressPendingForSubscriptions(input: {
    subscriptionIds: string[];
    suppressedAt: Date;
  }): Promise<number> {
    void input.suppressedAt;
    let suppressed = 0;
    for (const slot of this.slots) {
      if (
        input.subscriptionIds.includes(slot.subscriptionId) &&
        slot.status === SubscriptionReminderStatus.PENDING
      ) {
        slot.status = SubscriptionReminderStatus.SUPPRESSED;
        suppressed += 1;
      }
    }
    return Promise.resolve(suppressed);
  }

  public updatePendingForSubscription(
    input: UpdatePendingSubscriptionRemindersInput,
  ): Promise<number> {
    let updated = 0;
    for (const slot of this.slots) {
      if (
        slot.subscriptionId !== input.subscriptionId ||
        slot.status !== SubscriptionReminderStatus.PENDING ||
        (slot.notificationType === input.notificationType &&
          slot.expectedAutoRenew === input.expectedAutoRenew)
      ) {
        continue;
      }
      slot.notificationType = input.notificationType;
      slot.expectedAutoRenew = input.expectedAutoRenew;
      updated += 1;
    }
    return Promise.resolve(updated);
  }

  private find(slot: SubscriptionReminderSlot): StoredSlot | undefined {
    return this.slots.find(
      (candidate) =>
        candidate.subscriptionId === slot.subscriptionId &&
        candidate.subscriptionEndsAt.getTime() === slot.subscriptionEndsAt.getTime() &&
        candidate.leadDays === slot.leadDays,
    );
  }
}

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PERIOD_START = new Date('2026-10-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-11-01T00:00:00.000Z');
const BEFORE_DUE = new Date('2026-10-20T00:00:00.000Z');

function subscription(input: {
  id: string;
  sequence: number;
  status: SubscriptionStatus;
  autoRenew: boolean;
  startsAt?: Date;
  endsAt?: Date;
}): SubscriptionEntity {
  const period = BillingPeriod.fromBoundaries({
    startsAt: input.startsAt ?? PERIOD_START,
    endsAt: input.endsAt ?? PERIOD_END,
  });
  return new SubscriptionEntity({
    id: input.id,
    userId: USER_ID,
    productId: '00000000-0000-4000-8000-000000000010',
    provider: new ProviderCode('STRIPE'),
    sequence: input.sequence,
    period,
    status: input.status,
    autoRenew: input.autoRenew,
    nextBillingAt: input.autoRenew ? period.getEndsAt() : null,
  });
}

describe('StageSubscriptionRemindersService', () => {
  const service = new StageSubscriptionRemindersService();

  it.each([
    {
      label: 'WEEK auto-renew enabled',
      billingInterval: BillingInterval.WEEK,
      autoRenew: true,
      expectedLeads: [1],
      expectedType: SubscriptionReminderNotificationType.UPCOMING_PAYMENT,
    },
    {
      label: 'WEEK auto-renew disabled',
      billingInterval: BillingInterval.WEEK,
      autoRenew: false,
      expectedLeads: [1],
      expectedType: SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING,
    },
    {
      label: 'MONTH auto-renew enabled',
      billingInterval: BillingInterval.MONTH,
      autoRenew: true,
      expectedLeads: [7, 1],
      expectedType: SubscriptionReminderNotificationType.UPCOMING_PAYMENT,
    },
    {
      label: 'MONTH auto-renew disabled',
      billingInterval: BillingInterval.MONTH,
      autoRenew: false,
      expectedLeads: [7, 1],
      expectedType: SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING,
    },
  ])('materializes $label slots', async (testCase) => {
    const reminders = new InMemorySubscriptionReminderRepository();
    const current = subscription({
      id: '00000000-0000-4000-8000-000000000020',
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      autoRenew: testCase.autoRenew,
    });

    const result = await service.stage(
      {
        subscription: current,
        billingInterval: testCase.billingInterval,
        immediateSuccessor: null,
        now: BEFORE_DUE,
      },
      reminders,
    );

    expect(result).toEqual({
      created: testCase.expectedLeads.length,
      updated: 0,
      suppressed: 0,
      pastDueSkipped: 0,
    });
    expect(reminders.slots.map((slot) => slot.leadDays)).toEqual(testCase.expectedLeads);
    expect(reminders.slots.map((slot) => slot.notificationType)).toEqual(
      testCase.expectedLeads.map(() => testCase.expectedType),
    );
  });

  it('reconciles pending slots without duplicates, suppresses a contiguous predecessor, and skips new past-due slots', async () => {
    const reminders = new InMemorySubscriptionReminderRepository();
    const predecessor = subscription({
      id: '00000000-0000-4000-8000-000000000021',
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      autoRenew: true,
    });
    const successor = subscription({
      id: '00000000-0000-4000-8000-000000000022',
      sequence: 2,
      status: SubscriptionStatus.QUEUED,
      autoRenew: true,
      startsAt: PERIOD_END,
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
    });

    await service.stage(
      {
        subscription: predecessor,
        billingInterval: BillingInterval.MONTH,
        immediateSuccessor: null,
        now: BEFORE_DUE,
      },
      reminders,
    );
    const disabledPredecessor = subscription({
      id: predecessor.id,
      sequence: 1,
      status: SubscriptionStatus.ACTIVE,
      autoRenew: false,
    });
    await expect(
      service.stage(
        {
          subscription: disabledPredecessor,
          billingInterval: BillingInterval.MONTH,
          immediateSuccessor: null,
          now: BEFORE_DUE,
        },
        reminders,
      ),
    ).resolves.toMatchObject({ created: 0, updated: 2 });

    reminders.slots[0].status = SubscriptionReminderStatus.COMPLETED;
    await service.stage(
      {
        subscription: predecessor,
        billingInterval: BillingInterval.MONTH,
        immediateSuccessor: null,
        now: BEFORE_DUE,
      },
      reminders,
    );
    expect(reminders.slots[0].notificationType).toBe(
      SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING,
    );

    await expect(
      service.stage(
        {
          subscription: predecessor,
          billingInterval: BillingInterval.MONTH,
          immediateSuccessor: successor,
          now: BEFORE_DUE,
        },
        reminders,
      ),
    ).resolves.toMatchObject({ suppressed: 1 });
    expect(reminders.slots.map((slot) => slot.status)).toEqual([
      SubscriptionReminderStatus.COMPLETED,
      SubscriptionReminderStatus.SUPPRESSED,
    ]);
    await service.stage(
      {
        subscription: disabledPredecessor,
        billingInterval: BillingInterval.MONTH,
        immediateSuccessor: null,
        now: BEFORE_DUE,
      },
      reminders,
    );
    expect(reminders.slots.map((slot) => slot.notificationType)).toEqual([
      SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING,
      SubscriptionReminderNotificationType.UPCOMING_PAYMENT,
    ]);

    await expect(
      service.stage(
        {
          subscription: successor,
          billingInterval: BillingInterval.MONTH,
          immediateSuccessor: null,
          now: BEFORE_DUE,
        },
        reminders,
      ),
    ).resolves.toMatchObject({ created: 2 });
    await expect(
      service.stage(
        {
          subscription: successor,
          billingInterval: BillingInterval.MONTH,
          immediateSuccessor: null,
          now: BEFORE_DUE,
        },
        reminders,
      ),
    ).resolves.toMatchObject({ created: 0, updated: 0 });

    const pastDue = subscription({
      id: '00000000-0000-4000-8000-000000000023',
      sequence: 3,
      status: SubscriptionStatus.QUEUED,
      autoRenew: true,
    });
    await expect(
      service.stage(
        {
          subscription: pastDue,
          billingInterval: BillingInterval.WEEK,
          immediateSuccessor: null,
          now: new Date('2026-10-31T00:00:00.000Z'),
        },
        reminders,
      ),
    ).resolves.toEqual({ created: 0, updated: 0, suppressed: 0, pastDueSkipped: 1 });
  });
});
