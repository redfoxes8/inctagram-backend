import { NotificationOutboxStatus, type NotificationOutbox } from '../../src/core/prisma/client';
import { PersistedPaymentNotificationConsumer } from '../../src/modules/notifications/api/rabbit/persisted-payment-notification.consumer';
import {
  PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY,
  PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY,
  PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER,
} from '../../src/modules/notifications/api/rabbit/persisted-notification-rabbit.constants';
import { PersistRequestedNotificationService } from '../../src/modules/notifications/application/services/persist-requested-notification.service';
import { PersistRequestedNotificationOutcome } from '../../src/modules/notifications/application/types/persist-requested-notification.types';
import { NotificationOutboxPublisher } from '../../src/modules/notifications/infrastructure/messaging/notification-outbox.publisher';
import { NotificationOutboxRepository } from '../../src/modules/notifications/infrastructure/repositories/notification-outbox.repository';

const EVENT = {
  eventId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  eventType: 'payment.notification.requested.v1',
  occurredAt: '2026-09-02T08:00:00.000Z',
  aggregateType: 'SUBSCRIPTION',
  aggregateId: '22222222-2222-4222-8222-222222222222',
  routingKey: 'payment.notification.requested',
  payload: {
    type: 'SUBSCRIPTION_ACTIVATED',
    userId: '33333333-3333-4333-8333-333333333333',
    businessKey: 'subscription:22222222-2222-4222-8222-222222222222:activated',
    subscriptionId: '22222222-2222-4222-8222-222222222222',
    providerInvoiceId: null,
    effectiveAt: '2026-09-02T08:00:00.000Z',
    subscriptionEndsAt: '2026-09-09T08:00:00.000Z',
    reasonCode: null,
  },
};

function message(retryCount?: number) {
  return {
    fields: { redelivered: false, routingKey: EVENT.routingKey },
    properties: {
      messageId: EVENT.eventId,
      headers:
        retryCount === undefined ? {} : { 'x-notification-persistence-retry-count': retryCount },
    },
  };
}

describe('persisted notification messaging', () => {
  it('normalizes valid object and Buffer events, persists before immediate outbox publish, and ACKs duplicates', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        outcome: PersistRequestedNotificationOutcome.APPLIED,
        notificationId: '44444444-4444-4444-8444-444444444444',
        outboxEventId: '55555555-5555-4555-8555-555555555555',
      })
      .mockResolvedValueOnce({
        outcome: PersistRequestedNotificationOutcome.DUPLICATE_EVENT,
        notificationId: '44444444-4444-4444-8444-444444444444',
        outboxEventId: null,
      });
    const publishByEventId = jest.fn().mockResolvedValue(true);
    const amqp = { publish: jest.fn() };
    const consumer = new PersistedPaymentNotificationConsumer(
      { execute } as unknown as PersistRequestedNotificationService,
      { publishByEventId } as unknown as NotificationOutboxPublisher,
      amqp as never,
    );

    await consumer.handle(EVENT, message());
    await consumer.handle(Buffer.from(JSON.stringify(EVENT)), message());

    expect(execute).toHaveBeenCalledTimes(2);
    expect(publishByEventId).toHaveBeenCalledTimes(1);
    expect(publishByEventId).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('moves malformed input to terminal INVALID_EVENT DLQ without persistence', async () => {
    const execute = jest.fn();
    const amqp = { publish: jest.fn().mockResolvedValue(true) };
    const consumer = new PersistedPaymentNotificationConsumer(
      { execute } as unknown as PersistRequestedNotificationService,
      { publishByEventId: jest.fn() } as unknown as NotificationOutboxPublisher,
      amqp as never,
    );

    await consumer.handle(Buffer.from('{'), message());

    expect(execute).not.toHaveBeenCalled();
    expect(amqp.publish).toHaveBeenCalledWith(
      'common_exchange',
      PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY,
      expect.any(Buffer),
      expect.objectContaining({
        mandatory: true,
        persistent: true,
        headers: expect.objectContaining({
          [PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER]: 'INVALID_EVENT',
        }),
      }),
    );
  });

  it('uses bounded persistence retry and preserves failed outgoing rows for recovery', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('DATABASE_UNAVAILABLE'));
    const amqp = { publish: jest.fn().mockResolvedValue(true) };
    const consumer = new PersistedPaymentNotificationConsumer(
      { execute } as unknown as PersistRequestedNotificationService,
      { publishByEventId: jest.fn() } as unknown as NotificationOutboxPublisher,
      amqp as never,
    );
    await consumer.handle(EVENT, message());
    await consumer.handle(EVENT, message(2));
    expect(amqp.publish).toHaveBeenNthCalledWith(
      1,
      'common_exchange',
      PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY,
      EVENT,
      expect.any(Object),
    );
    expect(amqp.publish).toHaveBeenNthCalledWith(
      2,
      'common_exchange',
      PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY,
      EVENT,
      expect.objectContaining({
        headers: expect.objectContaining({
          [PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER]: 'PERSISTENCE_ERROR',
        }),
      }),
    );

    const outbox = {
      id: '66666666-6666-4666-8666-666666666666',
      eventId: '77777777-7777-4777-8777-777777777777',
      aggregateId: '44444444-4444-4444-8444-444444444444',
      eventType: 'notification.created.v1',
      eventVersion: 1,
      routingKey: 'notification.created',
      payload: {
        eventType: 'notification.created.v1',
        routingKey: 'notification.created',
        payload: { unseenCount: 1 },
      },
      status: NotificationOutboxStatus.PROCESSING,
      attempts: 0,
      availableAt: new Date(),
      lockedAt: new Date(),
      lockedBy: 'worker',
      lastErrorCode: null,
      occurredAt: new Date(),
      publishedAt: null,
      createdAt: new Date(),
    } as unknown as NotificationOutbox;
    const markPublished = jest.fn().mockResolvedValue(true);
    const markFailed = jest.fn().mockResolvedValue(true);
    const publisher = new NotificationOutboxPublisher(
      { markPublished, markFailed } as unknown as NotificationOutboxRepository,
      { publish: jest.fn().mockResolvedValue(false) } as never,
    );

    await expect(publisher.publishClaimed(outbox)).resolves.toBe(false);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markPublished).not.toHaveBeenCalled();
  });
});
