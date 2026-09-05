import type { Notification } from '../../src/core/prisma/client';
import { NotificationPrismaService } from '../../src/core/prisma/prisma.service';
import { NotificationClock } from '../../src/modules/notifications/application/ports/notification-clock.port';
import { GetNotificationsService } from '../../src/modules/notifications/application/services/get-notifications.service';
import { MarkNotificationsSeenService } from '../../src/modules/notifications/application/services/mark-notifications-seen.service';
import { PrismaNotificationHistoryRepository } from '../../src/modules/notifications/infrastructure/repositories/prisma-notification-history.repository';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-05T12:00:00.000Z');
const SHARED_CREATED_AT = new Date('2026-09-05T10:00:00.000Z');

function notification(input: { id: string; userId?: string; createdAt?: Date }): Notification {
  return {
    id: input.id,
    userId: input.userId ?? USER_ID,
    type: 'SUBSCRIPTION_ACTIVATED',
    businessKey: `key:${input.id}`,
    subscriptionId: null,
    providerInvoiceId: null,
    effectiveAt: SHARED_CREATED_AT,
    subscriptionEndsAt: null,
    reasonCode: null,
    createdAt: input.createdAt ?? SHARED_CREATED_AT,
    seenAt: null,
  } as unknown as Notification;
}

describe('Notification history and seen persistence', () => {
  it('uses UTC keyset pagination without skipping same-timestamp items and never mutates reads', async () => {
    const newest = notification({ id: '33333333-3333-4333-8333-333333333333' });
    const middle = notification({ id: '22222222-2222-4222-8222-222222222222' });
    const oldest = notification({ id: '11111111-1111-4111-8111-111111111111' });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([newest, middle, oldest])
      .mockResolvedValueOnce([oldest]);
    const readUpdateMany = jest.fn();
    const prisma = {
      notification: { findMany, count: jest.fn(), updateMany: readUpdateMany },
      $transaction: jest.fn(),
    } as unknown as NotificationPrismaService;
    const repository = new PrismaNotificationHistoryRepository(prisma);
    const service = new GetNotificationsService(repository);

    const firstPage = await service.execute({
      userId: USER_ID,
      cursor: undefined,
      pageSize: 2,
      now: NOW,
    });
    const secondPage = await service.execute({
      userId: USER_ID,
      cursor: firstPage.nextCursor ?? undefined,
      pageSize: 2,
      now: NOW,
    });

    expect(firstPage.items.map((item) => item.id)).toEqual([newest.id, middle.id]);
    expect(secondPage.items.map((item) => item.id)).toEqual([oldest.id]);
    expect(firstPage.nextCursor).toBeDefined();
    expect(secondPage.nextCursor).toBeNull();
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          createdAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lt: new Date('2026-10-01T00:00:00.000Z'),
          },
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          OR: [
            { createdAt: { lt: SHARED_CREATED_AT } },
            { createdAt: SHARED_CREATED_AT, id: { lt: middle.id } },
          ],
        }),
      }),
    );
    expect(readUpdateMany).not.toHaveBeenCalled();
  });

  it('marks only eligible unseen rows with one batch update and returns the post-boundary unseen count', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const count = jest.fn().mockResolvedValue(1);
    const transaction = { notification: { updateMany, count } };
    const transactionRunner = jest
      .fn()
      .mockImplementation((work: (client: typeof transaction) => Promise<number>) =>
        work(transaction),
      );
    const prisma = {
      notification: { findMany: jest.fn(), count, updateMany },
      $transaction: transactionRunner,
    } as unknown as NotificationPrismaService;
    const repository = new PrismaNotificationHistoryRepository(prisma);
    const clock = { now: jest.fn().mockReturnValue(NOW) } as unknown as NotificationClock;
    const service = new MarkNotificationsSeenService(repository, clock);

    const first = await service.execute(USER_ID);
    const second = await service.execute(USER_ID);

    expect(first).toEqual({ seenThrough: NOW, unseenCount: 1 });
    expect(second).toEqual({ seenThrough: NOW, unseenCount: 1 });
    expect(transactionRunner).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        seenAt: null,
        createdAt: { lte: NOW },
      },
      data: { seenAt: NOW },
    });
    expect(count).toHaveBeenCalledWith({ where: { userId: USER_ID, seenAt: null } });
  });
});
