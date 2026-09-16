import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/core/prisma/client';
import { NotificationCleanupRepository } from '../../src/modules/notifications/infrastructure/repositories/notification-cleanup.repository';
import { NotificationPrismaService } from '../../src/core/prisma/prisma.service';

const databaseUrl = process.env.NOTIFICATION_CLEANUP_TEST_DB_URL;

function createClient(): PrismaClient {
  if (!databaseUrl) throw new Error('NOTIFICATION_CLEANUP_TEST_DB_URL is required');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

function repository(client: PrismaClient): NotificationCleanupRepository {
  return new NotificationCleanupRepository(client as unknown as NotificationPrismaService);
}

async function createNotification(
  client: PrismaClient,
  input: { createdAt: Date; businessKey: string },
): Promise<string> {
  const notification = await client.notification.create({
    data: {
      userId: randomUUID(),
      type: 'UPCOMING_PAYMENT',
      businessKey: input.businessKey,
      effectiveAt: input.createdAt,
      createdAt: input.createdAt,
    },
  });
  return notification.id;
}

describe('NotificationCleanupRepository PostgreSQL integration', () => {
  let client: PrismaClient;
  let cleanup: NotificationCleanupRepository;

  beforeAll(async () => {
    client = createClient();
    cleanup = repository(client);
    await client.$connect();
  });

  beforeEach(async () => {
    await client.notificationInbox.deleteMany();
    await client.notificationOutbox.deleteMany();
    await client.notification.deleteMany();
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('deletes bounded eligible history, preserves recent/blocked rows, cascades terminal outbox and nulls inbox', async () => {
    const oldPublishedId = await createNotification(client, {
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      businessKey: `old-published-${randomUUID()}`,
    });
    const oldBlockedId = await createNotification(client, {
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
      businessKey: `old-blocked-${randomUUID()}`,
    });
    const recentId = await createNotification(client, {
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      businessKey: `recent-${randomUUID()}`,
    });
    const inboxEventId = randomUUID();

    await client.notificationOutbox.create({
      data: {
        eventId: randomUUID(),
        aggregateId: oldPublishedId,
        eventType: 'notification.created.v1',
        eventVersion: 1,
        routingKey: 'notification.created',
        payload: {},
        status: 'PUBLISHED',
        occurredAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    });
    await client.notificationOutbox.create({
      data: {
        eventId: randomUUID(),
        aggregateId: oldBlockedId,
        eventType: 'notification.created.v1',
        eventVersion: 1,
        routingKey: 'notification.created',
        payload: {},
        status: 'FAILED',
        occurredAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    });
    await client.notificationInbox.create({
      data: {
        eventId: inboxEventId,
        eventType: 'payment.notification.requested.v1',
        businessKey: 'old-published-inbox',
        outcome: 'APPLIED',
        notificationId: oldPublishedId,
      },
    });

    await expect(cleanup.deleteExpired({ retentionDays: 90, batchSize: 1 })).resolves.toBe(1);
    expect(await client.notification.findUnique({ where: { id: oldPublishedId } })).toBeNull();
    expect(await client.notification.findUnique({ where: { id: oldBlockedId } })).not.toBeNull();
    expect(await client.notification.findUnique({ where: { id: recentId } })).not.toBeNull();
    expect(await client.notificationOutbox.count()).toBe(1);
    expect(
      await client.notificationInbox.findUnique({ where: { eventId: inboxEventId } }),
    ).toMatchObject({
      notificationId: null,
    });

    await expect(cleanup.deleteExpired({ retentionDays: 90, batchSize: 10 })).resolves.toBe(0);
  });

  it('deletes subsequent bounded batches and returns zero for an empty batch', async () => {
    await createNotification(client, {
      createdAt: new Date('2025-01-03T00:00:00.000Z'),
      businessKey: `batch-one-${randomUUID()}`,
    });
    await createNotification(client, {
      createdAt: new Date('2025-01-04T00:00:00.000Z'),
      businessKey: `batch-two-${randomUUID()}`,
    });

    await expect(cleanup.deleteExpired({ retentionDays: 90, batchSize: 1 })).resolves.toBe(1);
    await expect(cleanup.deleteExpired({ retentionDays: 90, batchSize: 1 })).resolves.toBe(1);
    await expect(cleanup.deleteExpired({ retentionDays: 90, batchSize: 1 })).resolves.toBe(0);
  });

  it('allows concurrent workers to claim different rows without duplicate deletion', async () => {
    await createNotification(client, {
      createdAt: new Date('2025-02-01T00:00:00.000Z'),
      businessKey: `concurrent-one-${randomUUID()}`,
    });
    await createNotification(client, {
      createdAt: new Date('2025-02-02T00:00:00.000Z'),
      businessKey: `concurrent-two-${randomUUID()}`,
    });

    await expect(
      Promise.all([
        cleanup.deleteExpired({ retentionDays: 90, batchSize: 1 }),
        cleanup.deleteExpired({ retentionDays: 90, batchSize: 1 }),
      ]),
    ).resolves.toEqual([1, 1]);
    expect(await client.notification.count()).toBe(0);
  });
});
