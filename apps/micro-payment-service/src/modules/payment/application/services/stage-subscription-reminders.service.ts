import { Injectable } from '@nestjs/common';

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
  billingInterval: BillingInterval;
  immediateSuccessor: SubscriptionEntity | null;
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
    if (
      !this.isReminderEligibleStatus(input.subscription) ||
      this.isSuppressingSuccessor(input.subscription, input.immediateSuccessor)
    ) {
      const suppressed = await reminders.suppressPendingForSubscription({
        subscriptionId: input.subscription.id,
        suppressedAt: input.now,
      });
      return { created: 0, updated: 0, suppressed, pastDueSkipped: 0 };
    }

    const desiredSlots = this.desiredSlots(input);
    const slotsToCreate = desiredSlots.filter((slot) => slot.dueAt.getTime() > input.now.getTime());
    const reconciled = await reminders.reconcile({ desiredSlots, slotsToCreate });
    return {
      created: reconciled.created,
      updated: reconciled.updated,
      suppressed: 0,
      pastDueSkipped: desiredSlots.length - slotsToCreate.length,
    };
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
