import type { Notification } from '../../src/core/prisma/client';
import { NotificationPrismaService } from '../../src/core/prisma/prisma.service';
import {
  PersistRequestedNotificationOutcome,
  type PersistRequestedNotificationInput,
} from '../../src/modules/notifications/application/types/persist-requested-notification.types';
import { PrismaNotificationPersistenceRepository } from '../../src/modules/notifications/infrastructure/repositories/prisma-notification-persistence.repository';

const INPUT: PersistRequestedNotificationInput = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventType: 'payment.notification.requested.v1',
  occurredAt: new Date('2026-09-02T08:00:00.000Z'),
  type: 'SUBSCRIPTION_ACTIVATED',
  userId: '22222222-2222-4222-8222-222222222222',
  businessKey: 'subscription:33333333-3333-4333-8333-333333333333:activated:2026-09-02',
  subscriptionId: '33333333-3333-4333-8333-333333333333',
  providerInvoiceId: null,
  effectiveAt: new Date('2026-09-02T08:00:00.000Z'),
  subscriptionEndsAt: new Date('2026-09-09T08:00:00.000Z'),
  reasonCode: null,
};

function notification(): Notification {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    userId: INPUT.userId,
    type: 'SUBSCRIPTION_ACTIVATED',
    businessKey: INPUT.businessKey,
    subscriptionId: INPUT.subscriptionId,
    providerInvoiceId: null,
    effectiveAt: INPUT.effectiveAt,
    subscriptionEndsAt: INPUT.subscriptionEndsAt,
    reasonCode: null,
    createdAt: new Date('2026-09-02T08:00:30.000Z'),
    seenAt: null,
  };
}

describe('PrismaNotificationPersistenceRepository', () => {
  it('persists inbox, notification and created outbox event in one transaction', async () => {
    const transaction = {
      notificationInbox: {
        findUnique: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(notification()),
        count: jest.fn().mockResolvedValue(1),
      },
      notificationOutbox: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const transactionSpy = jest.fn(
      (callback: (value: typeof transaction) => Promise<unknown>): Promise<unknown> =>
        callback(transaction),
    );
    const prisma = {
      $transaction: transactionSpy,
    } as unknown as NotificationPrismaService;
    const repository = new PrismaNotificationPersistenceRepository(prisma);

    const result = await repository.persist(INPUT);

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcome: PersistRequestedNotificationOutcome.APPLIED,
      notificationId: notification().id,
      outboxEventId: expect.any(String),
    });
    expect(transaction.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ seenAt: null }),
      }),
    );
    expect(transaction.notificationInbox.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: 'APPLIED',
          notificationId: notification().id,
        }),
        skipDuplicates: true,
      }),
    );
    expect(transaction.notificationOutbox.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'notification.created.v1',
          routingKey: 'notification.created',
          aggregateId: notification().id,
          payload: expect.objectContaining({
            payload: expect.objectContaining({ unseenCount: 1 }),
          }),
        }),
      }),
    );
  });

  it('does not create notifications or outbox events for transport or business duplicates', async () => {
    const existing = notification();
    const transaction = {
      notificationInbox: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ notificationId: existing.id })
          .mockResolvedValueOnce(null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn(),
        count: jest.fn(),
      },
      notificationOutbox: {
        createMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const transactionSpy = jest.fn(
      (callback: (value: typeof transaction) => Promise<unknown>): Promise<unknown> =>
        callback(transaction),
    );
    const prisma = {
      $transaction: transactionSpy,
    } as unknown as NotificationPrismaService;
    const repository = new PrismaNotificationPersistenceRepository(prisma);

    const duplicateEvent = await repository.persist(INPUT);
    const duplicateBusinessKey = await repository.persist({
      ...INPUT,
      eventId: '55555555-5555-4555-8555-555555555555',
    });

    expect(duplicateEvent.outcome).toBe(PersistRequestedNotificationOutcome.DUPLICATE_EVENT);
    expect(duplicateBusinessKey.outcome).toBe(
      PersistRequestedNotificationOutcome.DUPLICATE_BUSINESS_KEY,
    );
    expect(transaction.notification.upsert).not.toHaveBeenCalled();
    expect(transaction.notificationOutbox.createMany).not.toHaveBeenCalled();
    expect(transaction.notificationInbox.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'DUPLICATE', notificationId: existing.id }),
      }),
    );
  });
});
