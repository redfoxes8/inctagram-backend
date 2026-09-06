import type { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';

export type NotificationHistoryCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

export type NotificationHistoryItem = Readonly<{
  id: string;
  type: PaymentNotificationType;
  subscriptionId: string | null;
  providerInvoiceId: string | null;
  effectiveAt: Date;
  subscriptionEndsAt: Date | null;
  reasonCode: string | null;
  createdAt: Date;
  seenAt: Date | null;
}>;

export type NotificationHistoryPage = Readonly<{
  items: NotificationHistoryItem[];
}>;

export abstract class INotificationHistoryPort {
  abstract findPage(input: {
    userId: string;
    monthStartUtc: Date;
    nextMonthStartUtc: Date;
    cursor: NotificationHistoryCursor | null;
    take: number;
  }): Promise<NotificationHistoryPage>;

  abstract countUnseen(userId: string): Promise<number>;

  abstract markSeenAndCount(input: { userId: string; seenThrough: Date }): Promise<number>;
}
