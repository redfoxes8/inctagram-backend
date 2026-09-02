import { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { PaymentNotificationScheduleStatus } from '../enums/payment-notification-schedule-status.enum';

export type PendingPaymentNotificationSchedule = Readonly<{
  id: string;
  userId: string;
  notificationType: PaymentNotificationType;
  businessKey: string;
  sourceSubscriptionId: string | null;
  effectiveAt: Date;
  subscriptionEndsAt: Date | null;
  dueAt: Date;
  status: PaymentNotificationScheduleStatus;
}>;

export type CreatePaymentNotificationScheduleInput = Readonly<{
  userId: string;
  notificationType: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_EXTENDED';
  businessKey: string;
  sourceTransactionId: string;
  sourceSubscriptionId: string;
  effectiveAt: Date;
  subscriptionEndsAt: Date;
  dueAt: Date;
}>;

export class PaymentNotificationScheduleDuplicateConstraintError extends Error {
  constructor(public readonly constraint: 'BUSINESS_KEY' | 'SOURCE_TRANSACTION') {
    super(`Payment notification schedule unique constraint: ${constraint}`);
  }
}

export abstract class IPaymentNotificationScheduleRepository {
  abstract findBySourceTransactionId(
    sourceTransactionId: string,
  ): Promise<PendingPaymentNotificationSchedule | null>;
  abstract findPendingByUserAndType(
    userId: string,
    notificationType: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_EXTENDED',
  ): Promise<PendingPaymentNotificationSchedule | null>;
  abstract create(
    input: CreatePaymentNotificationScheduleInput,
  ): Promise<PendingPaymentNotificationSchedule>;
  abstract mergePaidHorizon(input: {
    scheduleId: string;
    sourceTransactionId: string;
    subscriptionEndsAt: Date;
  }): Promise<PendingPaymentNotificationSchedule>;
  abstract findById(id: string): Promise<PendingPaymentNotificationSchedule | null>;
  abstract claim(id: string, now: Date): Promise<boolean>;
  abstract complete(id: string, subscriptionEndsAt: Date): Promise<void>;
  abstract cancel(id: string): Promise<void>;
}

export abstract class IPaymentNotificationRecoveryRepository {
  abstract findDueIds(input: { now: Date; limit: number }): Promise<string[]>;
}
