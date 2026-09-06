import { SubscriptionReminderNotificationType } from '../enums/subscription-reminder-notification-type.enum';

export type SubscriptionReminderSlot = Readonly<{
  subscriptionId: string;
  userId: string;
  notificationType: SubscriptionReminderNotificationType;
  leadDays: 1 | 7;
  dueAt: Date;
  subscriptionEndsAt: Date;
  expectedAutoRenew: boolean;
}>;

export type ReconcileSubscriptionReminderSlotsInput = Readonly<{
  desiredSlots: SubscriptionReminderSlot[];
  slotsToCreate: SubscriptionReminderSlot[];
}>;

export type SubscriptionReminderReconciliationResult = Readonly<{
  created: number;
  updated: number;
}>;

export type UpdatePendingSubscriptionRemindersInput = Readonly<{
  subscriptionId: string;
  notificationType: SubscriptionReminderNotificationType;
  expectedAutoRenew: boolean;
}>;

export abstract class ISubscriptionReminderRepository {
  abstract reconcile(
    input: ReconcileSubscriptionReminderSlotsInput,
  ): Promise<SubscriptionReminderReconciliationResult>;
  abstract suppressPendingForSubscriptions(input: {
    subscriptionIds: string[];
    suppressedAt: Date;
  }): Promise<number>;
  abstract updatePendingForSubscription(
    input: UpdatePendingSubscriptionRemindersInput,
  ): Promise<number>;
}
