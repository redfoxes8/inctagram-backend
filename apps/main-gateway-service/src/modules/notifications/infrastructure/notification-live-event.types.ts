import type { NotificationCreatedV1 } from '../../../../../../libs/contracts/src';
import {
  GATEWAY_NOTIFICATION_LIVE_EVENT_VERSION,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
} from './notification-live-event.constants';

export type GatewayNotificationUnseenCountChangedV1 = Readonly<{
  eventId: string;
  version: typeof GATEWAY_NOTIFICATION_LIVE_EVENT_VERSION;
  eventType: typeof GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE;
  occurredAt: string;
  aggregateType: 'USER_NOTIFICATION_STATE';
  aggregateId: string;
  routingKey: typeof GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY;
  payload: Readonly<{
    userId: string;
    unseenCount: number;
    seenThrough: string;
  }>;
}>;

export type GatewayNotificationLiveEvent =
  | NotificationCreatedV1
  | GatewayNotificationUnseenCountChangedV1;
