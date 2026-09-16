import {
  NotificationType,
  type GetNotificationsResponse,
  type GetUnseenNotificationCountResponse,
  type MarkNotificationsSeenResponse,
  type NotificationItem,
  type Timestamp,
} from '../../../../../../../libs/contracts/src';
import type { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import type { NotificationHistoryItem } from '../../application/ports/notification-history.port';
import type { GetNotificationsResult } from '../../application/services/get-notifications.service';
import type { MarkNotificationsSeenResult } from '../../application/services/mark-notifications-seen.service';

export class NotificationGrpcResponseMapper {
  public static history(result: GetNotificationsResult): GetNotificationsResponse {
    return {
      items: result.items.map((item) => this.item(item)),
      nextCursor: result.nextCursor ?? undefined,
    };
  }

  public static unseenCount(unseenCount: number): GetUnseenNotificationCountResponse {
    return { unseenCount };
  }

  public static markSeen(result: MarkNotificationsSeenResult): MarkNotificationsSeenResponse {
    return { seenThrough: this.timestamp(result.seenThrough), unseenCount: result.unseenCount };
  }

  private static item(value: NotificationHistoryItem): NotificationItem {
    return {
      id: value.id,
      type: this.type(value.type),
      subscriptionId: value.subscriptionId ?? undefined,
      providerInvoiceId: value.providerInvoiceId ?? undefined,
      effectiveAt: this.timestamp(value.effectiveAt),
      subscriptionEndsAt: value.subscriptionEndsAt
        ? this.timestamp(value.subscriptionEndsAt)
        : undefined,
      reasonCode: value.reasonCode ?? undefined,
      createdAt: this.timestamp(value.createdAt),
      seenAt: value.seenAt ? this.timestamp(value.seenAt) : undefined,
    };
  }

  private static timestamp(value: Date): Timestamp {
    const milliseconds = value.getTime();
    return {
      seconds: Math.floor(milliseconds / 1_000),
      nanos: (milliseconds % 1_000) * 1_000_000,
    };
  }

  private static type(value: PaymentNotificationType): NotificationType {
    const types: Readonly<Record<PaymentNotificationType, NotificationType>> = {
      SUBSCRIPTION_ACTIVATED: NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_ACTIVATED,
      SUBSCRIPTION_EXTENDED: NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_EXTENDED,
      UPCOMING_PAYMENT: NotificationType.NOTIFICATION_TYPE_UPCOMING_PAYMENT,
      SUBSCRIPTION_EXPIRING: NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_EXPIRING,
      PAYMENT_FAILED: NotificationType.NOTIFICATION_TYPE_PAYMENT_FAILED,
      PAYMENT_RECOVERED: NotificationType.NOTIFICATION_TYPE_PAYMENT_RECOVERED,
      SUBSCRIPTION_CANCELLED: NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_CANCELLED,
    };
    return types[value];
  }
}
