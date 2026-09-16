import { randomUUID } from 'crypto';

import {
  NOTIFICATION_EVENT_VERSION,
  PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE,
  PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
  PaymentNotificationRequestedV1,
} from '../../../../../../libs/contracts/src/events/notification-events-v1.event';

export type CreatePaymentNotificationRequestedEventInput = Readonly<{
  occurredAt: Date;
  aggregateType: PaymentNotificationRequestedV1['aggregateType'];
  aggregateId: string;
  payload: PaymentNotificationRequestedV1['payload'];
}>;

export class PaymentNotificationEventFactory {
  public create(
    input: CreatePaymentNotificationRequestedEventInput,
  ): PaymentNotificationRequestedV1 {
    return {
      eventId: randomUUID(),
      version: NOTIFICATION_EVENT_VERSION,
      eventType: PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE,
      occurredAt: input.occurredAt.toISOString(),
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      routingKey: PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
      payload: input.payload,
    };
  }
}
