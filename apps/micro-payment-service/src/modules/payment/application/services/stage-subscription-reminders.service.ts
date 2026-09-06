import { Injectable } from '@nestjs/common';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { SubscriptionReminderNotificationType } from '../../domain/enums/subscription-reminder-notification-type.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import {
  ISubscriptionReminderRepository,
  SubscriptionReminderSlot,
} from '../../domain/interfaces/subscription-reminder.repository.interface';

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export type StageSubscriptionRemindersInput = Readonly<{
  subscription: SubscriptionEntity;
  billingInterval?: BillingInterval;
  immediateSuccessor: SubscriptionEntity | null;
  now: Date;
}>;

export type StageSubscriptionRemindersBatchInput = Readonly<{
  periods: Omit<StageSubscriptionRemindersInput, 'now'>[];
  now: Date;
}>;

export type StageSubscriptionRemindersResult = Readonly<{
  created: number;
  updated: number;
  suppressed: number;
  pastDueSkipped: number;
}>;

@Injectable()
export class StageSubscriptionRemindersService {
  public async stage(
    input: StageSubscriptionRemindersInput,
    reminders: ISubscriptionReminderRepository,
  ): Promise<StageSubscriptionRemindersResult> {
    return this.stageBatch({ periods: [input], now: input.now }, reminders);
  }

  public async stageBatch(
    input: StageSubscriptionRemindersBatchInput,
    reminders: ISubscriptionReminderRepository,
  ): Promise<StageSubscriptionRemindersResult> {
    const subscriptionIdsToSuppress = new Set<string>();
    const desiredSlots: SubscriptionReminderSlot[] = [];

    for (const period of input.periods) {
      if (
        !this.isReminderEligibleStatus(period.subscription) ||
        this.isSuppressingSuccessor(period.subscription, period.immediateSuccessor)
      ) {
        subscriptionIdsToSuppress.add(period.subscription.id);
        continue;
      }
      const billingInterval = period.billingInterval;
      if (!billingInterval) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'Reminder materialization requires billing interval',
        });
      }
      desiredSlots.push(...this.desiredSlots({ ...period, billingInterval, now: input.now }));
    }

    const slotsToCreate = desiredSlots.filter((slot) => slot.dueAt.getTime() > input.now.getTime());
    const reconciled =
      desiredSlots.length === 0
        ? { created: 0, updated: 0 }
        : await reminders.reconcile({ desiredSlots, slotsToCreate });
    const suppressed = await reminders.suppressPendingForSubscriptions({
      subscriptionIds: [...subscriptionIdsToSuppress],
      suppressedAt: input.now,
    });
    return {
      created: reconciled.created,
      updated: reconciled.updated,
      suppressed,
      pastDueSkipped: desiredSlots.length - slotsToCreate.length,
    };
  }

  public async reconcileAutoRenew(
    input: Readonly<{ subscription: SubscriptionEntity }>,
    reminders: ISubscriptionReminderRepository,
  ): Promise<StageSubscriptionRemindersResult> {
    const notificationType = input.subscription.getAutoRenew()
      ? SubscriptionReminderNotificationType.UPCOMING_PAYMENT
      : SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING;
    const updated = await reminders.updatePendingForSubscription({
      subscriptionId: input.subscription.id,
      notificationType,
      expectedAutoRenew: input.subscription.getAutoRenew(),
    });
    return { created: 0, updated, suppressed: 0, pastDueSkipped: 0 };
  }

  private desiredSlots(input: StageSubscriptionRemindersInput): SubscriptionReminderSlot[] {
    const leadDays = input.billingInterval === BillingInterval.WEEK ? [1] : [7, 1];
    const notificationType = input.subscription.getAutoRenew()
      ? SubscriptionReminderNotificationType.UPCOMING_PAYMENT
      : SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING;
    return leadDays.map((leadDay) => ({
      subscriptionId: input.subscription.id,
      userId: input.subscription.getUserId(),
      notificationType,
      leadDays: leadDay as 1 | 7,
      dueAt: new Date(input.subscription.getEndsAt().getTime() - leadDay * DAY_MILLISECONDS),
      subscriptionEndsAt: input.subscription.getEndsAt(),
      expectedAutoRenew: input.subscription.getAutoRenew(),
    }));
  }

  private isReminderEligibleStatus(subscription: SubscriptionEntity): boolean {
    return [SubscriptionStatus.ACTIVE, SubscriptionStatus.QUEUED].includes(
      subscription.getStatus(),
    );
  }

  private isSuppressingSuccessor(
    current: SubscriptionEntity,
    successor: SubscriptionEntity | null,
  ): boolean {
    return (
      successor !== null &&
      successor.getUserId() === current.getUserId() &&
      successor.getStatus() === SubscriptionStatus.QUEUED &&
      successor.getSequence() === current.getSequence() + 1 &&
      successor.getStartsAt().getTime() === current.getEndsAt().getTime() &&
      successor.getEndsAt().getTime() > successor.getStartsAt().getTime()
    );
  }
}
