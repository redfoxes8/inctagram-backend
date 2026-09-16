import { randomUUID } from 'crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../src/core/prisma/client';
import {
  SubscriptionReminderNotificationType,
  SubscriptionReminderStatus,
  SubscriptionStatus,
} from '../../src/core/prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProcessDueSubscriptionRemindersService } from '../../src/modules/payment/application/services/process-due-subscription-reminders.service';
import { PaymentNotificationEventFactory } from '../../src/modules/payment/domain/payment-notification-event.factory';
import { PaymentUnitOfWork } from '../../src/modules/payment/infrastructure/repositories/payment-unit-of-work';

const DATABASE_URL = process.env.PAYMENT_REMINDER_DUE_TEST_DB_URL;
const PRODUCT_ID = '71000000-0000-4000-8000-000000000001';

function createClient(): PrismaClient {
  if (!DATABASE_URL) throw new Error('PAYMENT_REMINDER_DUE_TEST_DB_URL is required');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
}

function asPrismaService(client: PrismaClient): PrismaService {
  return client as unknown as PrismaService;
}

function dueWorker(client: PrismaClient): ProcessDueSubscriptionRemindersService {
  return new ProcessDueSubscriptionRemindersService(
    new PaymentUnitOfWork(asPrismaService(client)),
    new PaymentNotificationEventFactory(),
  );
}

async function createDueReminder(
  client: PrismaClient,
  input: Readonly<{
    status: SubscriptionStatus;
    autoRenew: boolean;
    notificationType: SubscriptionReminderNotificationType;
  }>,
): Promise<Readonly<{ reminderId: string; subscriptionId: string; userId: string; endsAt: Date }>> {
  const reminderId = randomUUID();
  const subscriptionId = randomUUID();
  const userId = randomUUID();
  const now = new Date();
  const endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1_000);
  await client.subscription.create({
    data: {
      id: subscriptionId,
      userId,
      productId: PRODUCT_ID,
      provider: 'STRIPE',
      sequence: 1,
      status: input.status,
      autoRenew: input.autoRenew,
      startsAt: new Date(now.getTime() - 27 * 24 * 60 * 60 * 1_000),
      endsAt,
      nextBillingAt: input.autoRenew ? endsAt : null,
    },
  });
  await client.subscriptionReminder.create({
    data: {
      id: reminderId,
      subscriptionId,
      userId,
      notificationType: input.notificationType,
      leadDays: 1,
      dueAt: new Date(now.getTime() - 60_000),
      subscriptionEndsAt: endsAt,
      expectedAutoRenew: input.autoRenew,
      status: SubscriptionReminderStatus.PENDING,
    },
  });
  return { reminderId, subscriptionId, userId, endsAt };
}

describe('ProcessDueSubscriptionRemindersService PostgreSQL integration', () => {
  let first: PrismaClient;
  let second: PrismaClient;

  beforeAll(async () => {
    first = createClient();
    second = createClient();
    await Promise.all([first.$connect(), second.$connect()]);
    await first.product.create({
      data: {
        id: PRODUCT_ID,
        code: 'REMINDER_DUE_SMOKE',
        name: 'Reminder due smoke',
        billingInterval: 'MONTH',
        billingIntervalCount: 1,
        priceMinor: 1_000,
        currency: 'USD',
      },
    });
  });

  afterEach(async () => {
    await first.outboxEvent.deleteMany();
    await first.subscriptionReminder.deleteMany();
    await first.subscription.deleteMany();
  });

  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('claims concurrent due reminders once, is idempotent, and uses the partial due index', async () => {
    const firstReminder = await createDueReminder(first, {
      status: SubscriptionStatus.ACTIVE,
      autoRenew: true,
      notificationType: SubscriptionReminderNotificationType.UPCOMING_PAYMENT,
    });
    const secondReminder = await createDueReminder(first, {
      status: SubscriptionStatus.ACTIVE,
      autoRenew: true,
      notificationType: SubscriptionReminderNotificationType.UPCOMING_PAYMENT,
    });

    const results = await Promise.all([
      dueWorker(first).runOnce(20),
      dueWorker(second).runOnce(20),
    ]);
    expect(results.reduce((total, result) => total + result.completed, 0)).toBe(2);
    expect(await first.subscriptionReminder.count({ where: { status: 'COMPLETED' } })).toBe(2);
    expect(await first.outboxEvent.count()).toBe(2);
    const businessKeys = await first.outboxEvent.findMany({ select: { payload: true } });
    expect(
      new Set(businessKeys.map((event) => (event.payload as { businessKey: string }).businessKey))
        .size,
    ).toBe(2);

    await expect(dueWorker(first).runOnce(20)).resolves.toMatchObject({
      candidates: 0,
      outboxCreated: 0,
    });
    expect(await first.outboxEvent.count()).toBe(2);
    await expect(
      first.subscriptionReminder.findMany({
        where: { id: { in: [firstReminder.reminderId, secondReminder.reminderId] } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: SubscriptionReminderStatus.COMPLETED }),
        expect.objectContaining({ status: SubscriptionReminderStatus.COMPLETED }),
      ]),
    );

    const plan = await first.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return transaction.$queryRaw<Readonly<{ 'QUERY PLAN': string }>[]>(Prisma.sql`
        EXPLAIN
        SELECT reminder."id"
        FROM "subscription_reminders" AS reminder
        INNER JOIN "subscriptions" AS subscription ON subscription."id" = reminder."subscription_id"
        WHERE reminder."status" = 'PENDING'::"SubscriptionReminderStatus"
          AND reminder."due_at" <= transaction_timestamp()
          AND subscription."status" <> 'QUEUED'::"SubscriptionStatus"
        ORDER BY reminder."due_at", reminder."id"
        LIMIT 20
      `);
    });
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'subscription_reminders_pending_due_idx',
    );
  });

  it('suppresses ineligible reminders and rolls back an Outbox plus terminal transition', async () => {
    const ineligible = await createDueReminder(first, {
      status: SubscriptionStatus.EXPIRED,
      autoRenew: false,
      notificationType: SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING,
    });
    await expect(dueWorker(first).runOnce(20)).resolves.toMatchObject({
      suppressed: 1,
      outboxCreated: 0,
    });
    await expect(
      first.subscriptionReminder.findUniqueOrThrow({ where: { id: ineligible.reminderId } }),
    ).resolves.toEqual(expect.objectContaining({ status: SubscriptionReminderStatus.SUPPRESSED }));
    expect(await first.outboxEvent.count()).toBe(0);

    const eligible = await createDueReminder(first, {
      status: SubscriptionStatus.ACTIVE,
      autoRenew: true,
      notificationType: SubscriptionReminderNotificationType.UPCOMING_PAYMENT,
    });
    const unitOfWork = new PaymentUnitOfWork(asPrismaService(first));
    const eventFactory = new PaymentNotificationEventFactory();
    await expect(
      unitOfWork.execute(async (context) => {
        const now = await context.databaseNow();
        await context.outbox.writeMany([
          eventFactory.create({
            occurredAt: now,
            aggregateType: 'SUBSCRIPTION',
            aggregateId: eligible.subscriptionId,
            payload: {
              type: 'UPCOMING_PAYMENT',
              userId: eligible.userId,
              businessKey: `rollback:${eligible.reminderId}`,
              subscriptionId: eligible.subscriptionId,
              providerInvoiceId: null,
              effectiveAt: eligible.endsAt.toISOString(),
              subscriptionEndsAt: eligible.endsAt.toISOString(),
              reasonCode: null,
            },
          }),
        ]);
        await context.subscriptionReminders.complete([eligible.reminderId], now);
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');
    expect(await first.outboxEvent.count()).toBe(0);
    await expect(
      first.subscriptionReminder.findUniqueOrThrow({ where: { id: eligible.reminderId } }),
    ).resolves.toEqual(expect.objectContaining({ status: SubscriptionReminderStatus.PENDING }));
  });
});
