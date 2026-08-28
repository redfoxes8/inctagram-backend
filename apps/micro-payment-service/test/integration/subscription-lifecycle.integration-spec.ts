import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/core/prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { SubscriptionLifecycleService } from '../../src/modules/payment/application/services/subscription-lifecycle.service';
import { OutboxStatus, SubscriptionStatus } from '../../src/core/prisma/client';
import { PaymentOutboxRelayRepository } from '../../src/modules/payment/infrastructure/repositories/payment-outbox-relay.repository';
import { PaymentUnitOfWork } from '../../src/modules/payment/infrastructure/repositories/payment-unit-of-work';

const DATABASE_URL = process.env.PAYMENT_LIFECYCLE_TEST_DB_URL;
const PRODUCT_ID = '10000000-0000-4000-8000-000000000001';
const BASE_TIME = new Date(Date.now() - 60_000);
const PERIOD_START = new Date(BASE_TIME.getTime() - 7 * 24 * 60 * 60 * 1_000);
const REPLACEMENT_END = new Date(BASE_TIME.getTime() + 7 * 24 * 60 * 60 * 1_000);

function createClient(onQuery?: () => void): PrismaClient {
  if (!DATABASE_URL) throw new Error('PAYMENT_LIFECYCLE_TEST_DB_URL is required');
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
    log: [{ emit: 'event', level: 'query' }],
  });
  if (onQuery) client.$on('query', onQuery);
  return client;
}

function prismaService(client: PrismaClient): PrismaService {
  return client as unknown as PrismaService;
}

function lifecycle(client: PrismaClient): SubscriptionLifecycleService {
  return new SubscriptionLifecycleService(new PaymentUnitOfWork(prismaService(client)));
}

function userId(index: number): string {
  return `20000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}

async function insertActive(
  client: PrismaClient,
  input: { userIndex: number; sequence?: number; endsAt?: Date },
): Promise<string> {
  const id = `30000000-0000-4000-8000-${input.userIndex.toString().padStart(12, '0')}`;
  await client.subscription.create({
    data: {
      id,
      userId: userId(input.userIndex),
      productId: PRODUCT_ID,
      provider: 'STRIPE',
      sequence: input.sequence ?? 1,
      status: SubscriptionStatus.ACTIVE,
      autoRenew: false,
      startsAt: PERIOD_START,
      endsAt: input.endsAt ?? BASE_TIME,
      nextBillingAt: null,
    },
  });
  return id;
}

describe('Subscription lifecycle PostgreSQL integration', () => {
  let first: PrismaClient;
  let second: PrismaClient;
  let measuredQueries = 0;

  beforeAll(async () => {
    first = createClient(() => {
      measuredQueries += 1;
    });
    second = createClient();
    await Promise.all([first.$connect(), second.$connect()]);
    await first.outboxEvent.deleteMany();
    await first.paymentTransaction.deleteMany();
    await first.subscription.deleteMany();
    await first.checkoutSession.deleteMany();
    await first.productProvider.deleteMany();
    await first.product.deleteMany();
    await first.product.create({
      data: {
        id: PRODUCT_ID,
        code: 'LIFECYCLE_WEEK',
        name: 'Lifecycle week',
        billingInterval: 'WEEK',
        billingIntervalCount: 1,
        priceMinor: 800,
        currency: 'USD',
      },
    });
  });

  afterEach(async () => {
    await first.outboxEvent.deleteMany();
    await first.paymentTransaction.deleteMany();
    await first.subscription.deleteMany();
  });

  afterAll(async () => {
    await first.outboxEvent.deleteMany();
    await first.subscription.deleteMany();
    await first.product.deleteMany();
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('processes one due subscription once across two concurrent connections', async () => {
    const subscriptionId = await insertActive(first, { userIndex: 1 });

    const processed = await Promise.all([
      lifecycle(first).runBatch(10),
      lifecycle(second).runBatch(10),
    ]);

    expect(processed.reduce((total, count) => total + count, 0)).toBe(1);
    await expect(
      first.subscription.findUniqueOrThrow({ where: { id: subscriptionId } }),
    ).resolves.toEqual(expect.objectContaining({ status: SubscriptionStatus.EXPIRED }));
    expect(await first.outboxEvent.count()).toBe(1);
  });

  it('expires and activates a contiguous replacement atomically', async () => {
    const activeId = await insertActive(first, { userIndex: 2 });
    const replacementId = '40000000-0000-4000-8000-000000000002';
    await first.subscription.create({
      data: {
        id: replacementId,
        userId: userId(2),
        productId: PRODUCT_ID,
        provider: 'STRIPE',
        sequence: 2,
        status: SubscriptionStatus.QUEUED,
        autoRenew: false,
        startsAt: BASE_TIME,
        endsAt: REPLACEMENT_END,
        nextBillingAt: null,
      },
    });

    const processed = await Promise.all([
      lifecycle(first).runBatch(10),
      lifecycle(second).runBatch(10),
    ]);
    const records = await first.subscription.findMany({ orderBy: { sequence: 'asc' } });
    const events = await first.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } });

    expect(processed.reduce((total, count) => total + count, 0)).toBe(1);
    expect(records).toEqual([
      expect.objectContaining({ id: activeId, status: SubscriptionStatus.EXPIRED }),
      expect.objectContaining({ id: replacementId, status: SubscriptionStatus.ACTIVE }),
    ]);
    expect(events.map(({ eventType }) => eventType).sort()).toEqual([
      'subscription.activated.v1',
      'subscription.expired.v1',
    ]);
    expect(
      events.find(({ eventType }) => eventType === 'subscription.expired.v1')?.payload,
    ).toEqual(expect.objectContaining({ hasActiveReplacement: true }));
  });

  it('rolls back subscription and Outbox changes when the transaction fails', async () => {
    const subscriptionId = await insertActive(first, { userIndex: 3 });
    const unitOfWork = new PaymentUnitOfWork(prismaService(first));

    await expect(
      unitOfWork.execute(async (context) => {
        await context.lockUser(userId(3));
        const subscription = await context.subscriptions.findActiveByUserId(userId(3));
        if (!subscription) throw new Error('fixture missing');
        subscription.expire(BASE_TIME);
        await context.subscriptions.save(subscription);
        await context.outbox.write({
          eventId: '50000000-0000-4000-8000-000000000003',
          version: 1,
          eventType: 'subscription.expired.v1',
          occurredAt: BASE_TIME.toISOString(),
          aggregateType: 'SUBSCRIPTION',
          aggregateId: subscriptionId,
          routingKey: 'payment.subscription.expired',
          payload: {
            userId: userId(3),
            subscriptionId,
            subscriptionSequence: 1,
            endsAt: BASE_TIME.toISOString(),
            hasActiveReplacement: false,
            replacementSubscriptionId: null,
          },
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    expect(await first.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).toEqual(
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
    expect(await first.outboxEvent.count()).toBe(0);
  });

  it('honors batch size and duplicate runs create no extra events', async () => {
    await Promise.all([4, 5, 6].map((userIndex) => insertActive(first, { userIndex })));
    const service = lifecycle(first);

    await expect(service.runBatch(2)).resolves.toBe(2);
    expect(await first.subscription.count({ where: { status: SubscriptionStatus.EXPIRED } })).toBe(
      2,
    );
    await expect(service.runBatch(2)).resolves.toBe(1);
    await expect(service.runBatch(2)).resolves.toBe(0);
    expect(await first.outboxEvent.count()).toBe(3);
  });

  it('recovers only stale Outbox claims and keeps attempts bounded', async () => {
    const old = new Date(BASE_TIME.getTime() - 60_000);
    const id = '60000000-0000-4000-8000-000000000001';
    await first.outboxEvent.create({
      data: {
        id,
        aggregateType: 'SUBSCRIPTION',
        aggregateId: '70000000-0000-4000-8000-000000000001',
        eventType: 'subscription.expired.v1',
        eventVersion: 1,
        routingKey: 'payment.subscription.expired',
        payload: {},
        status: OutboxStatus.PROCESSING,
        attempts: 1,
        availableAt: old,
        lockedAt: old,
        lockedBy: 'stale-worker',
        occurredAt: old,
      },
    });
    const repository = new PaymentOutboxRelayRepository(prismaService(first));

    const claimed = await repository.claim({
      workerId: 'recovery-worker',
      now: BASE_TIME,
      staleBefore: new Date(BASE_TIME.getTime() - 30_000),
      batchSize: 1,
      maxAttempts: 3,
    });
    const record = await first.outboxEvent.findUniqueOrThrow({ where: { id } });

    expect(claimed).toHaveLength(1);
    expect(record).toEqual(
      expect.objectContaining({
        status: OutboxStatus.PROCESSING,
        attempts: 2,
        lockedBy: 'recovery-worker',
      }),
    );
  });

  it('keeps lifecycle SQL operations bounded for empty, expiration and duplicate runs', async () => {
    const service = lifecycle(first);
    measuredQueries = 0;
    await expect(service.runBatch(10)).resolves.toBe(0);
    const emptyBatch = measuredQueries;

    await insertActive(first, { userIndex: 7 });
    measuredQueries = 0;
    await expect(service.runBatch(10)).resolves.toBe(1);
    const expirationWithoutReplacement = measuredQueries;

    measuredQueries = 0;
    await expect(service.runBatch(10)).resolves.toBe(0);
    const duplicateRun = measuredQueries;

    await insertActive(first, { userIndex: 8 });
    await first.subscription.create({
      data: {
        id: '40000000-0000-4000-8000-000000000008',
        userId: userId(8),
        productId: PRODUCT_ID,
        provider: 'STRIPE',
        sequence: 2,
        status: SubscriptionStatus.QUEUED,
        autoRenew: false,
        startsAt: BASE_TIME,
        endsAt: REPLACEMENT_END,
        nextBillingAt: null,
      },
    });
    measuredQueries = 0;
    await expect(service.runBatch(10)).resolves.toBe(1);
    const expirationWithReplacement = measuredQueries;

    expect({
      emptyBatch,
      expirationWithoutReplacement,
      expirationWithReplacement,
      duplicateRun,
    }).toEqual({
      emptyBatch: expect.any(Number),
      expirationWithoutReplacement: expect.any(Number),
      expirationWithReplacement: expect.any(Number),
      duplicateRun: expect.any(Number),
    });
    expect(emptyBatch).toBeLessThanOrEqual(5);
    expect(expirationWithoutReplacement).toBeLessThanOrEqual(12);
    expect(expirationWithReplacement).toBeLessThanOrEqual(16);
    expect(duplicateRun).toBeLessThanOrEqual(5);
    console.info(
      JSON.stringify({
        emptyBatch,
        expirationWithoutReplacement,
        expirationWithReplacement,
        duplicateRun,
      }),
    );
  });
});
