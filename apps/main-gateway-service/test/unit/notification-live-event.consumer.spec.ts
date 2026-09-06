import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import {
  NOTIFICATION_CREATED_EVENT_TYPE,
  NOTIFICATION_CREATED_ROUTING_KEY,
  type NotificationCreatedV1,
} from '../../../../libs/contracts/src';
import { NotificationLiveEventConsumer } from '../../src/modules/notifications/infrastructure/notification-live-event.consumer';
import {
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
} from '../../src/modules/notifications/infrastructure/notification-live-event.constants';
import { NotificationRealtimePublisher } from '../../src/modules/notifications/realtime/notification-realtime.publisher';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const NOTIFICATION_ID = '20000000-0000-4000-8000-000000000001';
const EVENT_ID = '30000000-0000-4000-8000-000000000001';
const NOW = '2026-09-06T12:00:00.000Z';

type Subscriber = (input: unknown) => Promise<void>;

function createdEvent(): NotificationCreatedV1 {
  return {
    eventId: EVENT_ID,
    version: 1,
    eventType: NOTIFICATION_CREATED_EVENT_TYPE,
    occurredAt: NOW,
    aggregateType: 'NOTIFICATION',
    aggregateId: NOTIFICATION_ID,
    routingKey: NOTIFICATION_CREATED_ROUTING_KEY,
    payload: {
      userId: USER_ID,
      unseenCount: 2,
      notification: {
        id: NOTIFICATION_ID,
        type: 'SUBSCRIPTION_EXTENDED',
        subscriptionId: '40000000-0000-4000-8000-000000000001',
        providerInvoiceId: null,
        effectiveAt: NOW,
        subscriptionEndsAt: '2026-10-06T12:00:00.000Z',
        reasonCode: null,
        createdAt: NOW,
        seenAt: null,
      },
    },
  };
}

describe('NotificationLiveEventConsumer', () => {
  it('fans out a valid notification-created event locally and safely discards invalid input', async () => {
    let subscriber: Subscriber | undefined;
    const createSubscriber = jest.fn((handler: Subscriber): Promise<{ consumerTag: string }> => {
      subscriber = handler;
      return Promise.resolve({ consumerTag: 'generated-live-notifications' });
    });
    const publishNotificationCreated = jest.fn();
    const publishUnseenCount = jest.fn();
    const consumer = new NotificationLiveEventConsumer(
      { createSubscriber } as unknown as AmqpConnection,
      {
        publishNotificationCreated,
        publishUnseenCount,
      } as unknown as NotificationRealtimePublisher,
    );

    await consumer.onApplicationBootstrap();
    await consumer.onApplicationBootstrap();

    expect(createSubscriber).toHaveBeenCalledTimes(1);
    expect(createSubscriber).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        exchange: 'common_exchange',
        routingKey: [
          NOTIFICATION_CREATED_ROUTING_KEY,
          GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
        ],
        queueOptions: { durable: false, exclusive: true, autoDelete: true },
      }),
      NotificationLiveEventConsumer.name,
    );

    const eventWithUnknownFields = JSON.parse(JSON.stringify(createdEvent())) as {
      payload: { notification: Record<string, unknown> };
    };
    eventWithUnknownFields.payload.notification.internalUserId = OTHER_USER_ID;
    await subscriber?.(Buffer.from(JSON.stringify(eventWithUnknownFields)));

    expect(publishNotificationCreated).toHaveBeenCalledTimes(1);
    expect(publishNotificationCreated).toHaveBeenCalledWith(USER_ID, {
      notification: createdEvent().payload.notification,
      unseenCount: 2,
    });
    expect(publishUnseenCount).toHaveBeenCalledWith(USER_ID, { unseenCount: 2 });

    await subscriber?.({ eventType: 'notification.created.v2' });
    expect(publishNotificationCreated).toHaveBeenCalledTimes(1);
    expect(publishUnseenCount).toHaveBeenCalledTimes(1);
  });

  it('fans out a brokered seen-count change without a local Gateway RPC', async () => {
    let subscriber: Subscriber | undefined;
    const publishNotificationCreated = jest.fn();
    const publishUnseenCount = jest.fn();
    const consumer = new NotificationLiveEventConsumer(
      {
        createSubscriber: (handler: Subscriber): Promise<{ consumerTag: string }> => {
          subscriber = handler;
          return Promise.resolve({ consumerTag: 'generated-live-notifications' });
        },
      } as unknown as AmqpConnection,
      {
        publishNotificationCreated,
        publishUnseenCount,
      } as unknown as NotificationRealtimePublisher,
    );
    await consumer.onApplicationBootstrap();

    await subscriber?.({
      eventId: EVENT_ID,
      version: 1,
      eventType: GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE,
      occurredAt: NOW,
      aggregateType: 'USER_NOTIFICATION_STATE',
      aggregateId: OTHER_USER_ID,
      routingKey: GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
      payload: {
        userId: OTHER_USER_ID,
        unseenCount: 0,
        seenThrough: NOW,
      },
    });

    expect(publishNotificationCreated).not.toHaveBeenCalled();
    expect(publishUnseenCount).toHaveBeenCalledTimes(1);
    expect(publishUnseenCount).toHaveBeenCalledWith(OTHER_USER_ID, {
      unseenCount: 0,
      seenThrough: NOW,
    });
  });
});
