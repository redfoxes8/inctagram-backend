import { NotificationType, type Timestamp } from '../../../../../../libs/contracts/src';
import type {
  GetNotificationsResponse,
  MarkNotificationsSeenResponse,
} from '../../../../../../libs/contracts/src';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  GetNotificationsResponseDto,
  MarkNotificationsSeenResponseDto,
  NotificationItemResponseDto,
  UnseenNotificationCountResponseDto,
} from './dto/notification-response.dto';

export class NotificationResponseMapper {
  public static history(response: GetNotificationsResponse): GetNotificationsResponseDto {
    return {
      items: (response.items ?? []).map((item) => ({
        id: item.id,
        type: this.type(item.type),
        subscriptionId: this.optionalString(item.subscriptionId),
        providerInvoiceId: this.optionalString(item.providerInvoiceId),
        effectiveAt: this.timestamp(item.effectiveAt),
        subscriptionEndsAt: item.subscriptionEndsAt
          ? this.timestamp(item.subscriptionEndsAt)
          : undefined,
        reasonCode: this.optionalString(item.reasonCode),
        createdAt: this.timestamp(item.createdAt),
        seenAt: item.seenAt ? this.timestamp(item.seenAt) : undefined,
      })),
      nextCursor: this.optionalString(response.nextCursor),
    };
  }

  public static unseenCount(unseenCount: number): UnseenNotificationCountResponseDto {
    return { unseenCount };
  }

  public static markSeen(
    response: MarkNotificationsSeenResponse,
  ): MarkNotificationsSeenResponseDto {
    return { unseenCount: response.unseenCount, seenThrough: this.timestamp(response.seenThrough) };
  }

  private static optionalString(value: string | undefined): string | undefined {
    return value && value.length > 0 ? value : undefined;
  }

  private static timestamp(value: Timestamp | undefined): string {
    if (!value) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Notification service returned an incomplete response',
      });
    }
    return new Date(value.seconds * 1_000 + Math.floor(value.nanos / 1_000_000)).toISOString();
  }

  private static type(value: NotificationType): NotificationItemResponseDto['type'] {
    const types: Readonly<Partial<Record<NotificationType, NotificationItemResponseDto['type']>>> =
      {
        [NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_ACTIVATED]: 'SUBSCRIPTION_ACTIVATED',
        [NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_EXTENDED]: 'SUBSCRIPTION_EXTENDED',
        [NotificationType.NOTIFICATION_TYPE_UPCOMING_PAYMENT]: 'UPCOMING_PAYMENT',
        [NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_EXPIRING]: 'SUBSCRIPTION_EXPIRING',
        [NotificationType.NOTIFICATION_TYPE_PAYMENT_FAILED]: 'PAYMENT_FAILED',
        [NotificationType.NOTIFICATION_TYPE_PAYMENT_RECOVERED]: 'PAYMENT_RECOVERED',
        [NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_CANCELLED]: 'SUBSCRIPTION_CANCELLED',
      };
    const type = types[value];
    if (!type) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Notification service returned an invalid notification type',
      });
    }
    return type;
  }
}
