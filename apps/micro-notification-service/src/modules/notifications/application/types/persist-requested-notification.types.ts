import type {
  PaymentNotificationRequestedV1,
  PaymentNotificationType,
} from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';

export type PersistRequestedNotificationInput = Readonly<{
  eventId: PaymentNotificationRequestedV1['eventId'];
  eventType: PaymentNotificationRequestedV1['eventType'];
  occurredAt: Date;
  type: PaymentNotificationType;
  userId: string;
  businessKey: string;
  subscriptionId: string | null;
  providerInvoiceId: string | null;
  effectiveAt: Date;
  subscriptionEndsAt: Date | null;
  reasonCode: string | null;
}>;

export const PersistRequestedNotificationOutcome = {
  APPLIED: 'APPLIED',
  DUPLICATE_EVENT: 'DUPLICATE_EVENT',
  DUPLICATE_BUSINESS_KEY: 'DUPLICATE_BUSINESS_KEY',
} as const;

export type PersistRequestedNotificationOutcome =
  (typeof PersistRequestedNotificationOutcome)[keyof typeof PersistRequestedNotificationOutcome];

export type PersistRequestedNotificationResult = Readonly<{
  outcome: PersistRequestedNotificationOutcome;
  notificationId: string;
  outboxEventId: string | null;
}>;
