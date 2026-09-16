export const NOTIFICATION_EVENT_VERSION = 1 as const;

export const PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE =
  'payment.notification.requested.v1' as const;
export const PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY = 'payment.notification.requested' as const;
export const NOTIFICATION_CREATED_EVENT_TYPE = 'notification.created.v1' as const;
export const NOTIFICATION_CREATED_ROUTING_KEY = 'notification.created' as const;

export const PaymentNotificationType = {
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_EXTENDED: 'SUBSCRIPTION_EXTENDED',
  UPCOMING_PAYMENT: 'UPCOMING_PAYMENT',
  SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_RECOVERED: 'PAYMENT_RECOVERED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
} as const;

export type PaymentNotificationType =
  (typeof PaymentNotificationType)[keyof typeof PaymentNotificationType];

// Notification MS assigns id, createdAt and seenAt. All date strings are UTC ISO instants.
export type NotificationItemV1 = Readonly<{
  id: string;
  type: PaymentNotificationType;
  subscriptionId: string | null;
  providerInvoiceId: string | null;
  effectiveAt: string;
  subscriptionEndsAt: string | null;
  reasonCode: string | null;
  createdAt: string;
  seenAt: string | null;
}>;

// Payment MS owns businessKey and the source payment/subscription facts. businessKey is
// intentionally opaque to consumers and is the canonical business-deduplication key.
export type PaymentNotificationRequestedV1 = Readonly<{
  eventId: string;
  version: typeof NOTIFICATION_EVENT_VERSION;
  eventType: typeof PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE;
  occurredAt: string;
  aggregateType: 'PAYMENT_TRANSACTION' | 'SUBSCRIPTION';
  aggregateId: string;
  routingKey: typeof PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY;
  payload: Readonly<{
    type: PaymentNotificationType;
    userId: string;
    businessKey: string;
    subscriptionId: string | null;
    providerInvoiceId: string | null;
    effectiveAt: string;
    subscriptionEndsAt: string | null;
    reasonCode: string | null;
  }>;
}>;

// Notification MS owns notification, unseenCount and occurredAt. Gateway uses userId only
// for routing to authenticated connections and must not expose it in public payloads.
export type NotificationCreatedV1 = Readonly<{
  eventId: string;
  version: typeof NOTIFICATION_EVENT_VERSION;
  eventType: typeof NOTIFICATION_CREATED_EVENT_TYPE;
  occurredAt: string;
  aggregateType: 'NOTIFICATION';
  aggregateId: string;
  routingKey: typeof NOTIFICATION_CREATED_ROUTING_KEY;
  payload: Readonly<{
    userId: string;
    notification: NotificationItemV1;
    unseenCount: number;
  }>;
}>;

export const NOTIFICATION_WEBSOCKET_EVENT = {
  CREATED: 'notification.created',
  UNSEEN_COUNT: 'notifications.unseen-count',
} as const;

export type NotificationCreatedWebSocketPayload = Readonly<{
  notification: NotificationItemV1;
  unseenCount: number;
}>;

export type NotificationsUnseenCountWebSocketPayload = Readonly<{
  unseenCount: number;
  seenThrough?: string;
}>;
