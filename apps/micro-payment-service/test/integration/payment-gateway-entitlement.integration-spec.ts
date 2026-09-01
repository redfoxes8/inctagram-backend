import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { PrismaPg } from '@prisma/adapter-pg';
import amqp, { Channel, ChannelModel } from 'amqplib';

import { PrismaClient as PaymentPrismaClient } from '../../src/core/prisma/client';
import { PrismaService as PaymentPrismaService } from '../../src/core/prisma/prisma.service';
import { PaymentConfig } from '../../src/core/payment.config';
import { PaymentOutboxPublisher } from '../../src/modules/payment/infrastructure/messaging/payment-outbox.publisher';
import { PaymentOutboxRelayService } from '../../src/modules/payment/infrastructure/messaging/payment-outbox-relay.service';
import { PaymentOutboxRelayRepository } from '../../src/modules/payment/infrastructure/repositories/payment-outbox-relay.repository';
import { PrismaClient as GatewayPrismaClient } from '../../../main-gateway-service/src/core/prisma/client';
import { PrismaService as GatewayPrismaService } from '../../../main-gateway-service/src/core/prisma/prisma.service';

const PAYMENT_DATABASE_URL = process.env.PAYMENT_LIFECYCLE_TEST_DB_URL;
const GATEWAY_DATABASE_URL = process.env.GATEWAY_LIFECYCLE_TEST_DB_URL;
const RABBITMQ_URL = process.env.PAYMENT_TEST_RABBIT_URL;
const QUEUE_NAME = 'gateway-payment-lifecycle-test';
const USER_ID = '81000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '84000000-0000-4000-8000-000000000001';

type EntitlementPayload = Readonly<{
  userId: string;
  subscriptionId: string;
  subscriptionSequence: number;
  startsAt?: string;
  endsAt: string;
  productId?: string;
  hasActiveReplacement?: boolean;
  replacementSubscriptionId?: string | null;
}>;

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

describe('Payment Outbox to Gateway entitlement integration', () => {
  let payment: PaymentPrismaClient;
  let gateway: GatewayPrismaClient;
  let publisher: PaymentOutboxPublisher;
  let relay: PaymentOutboxRelayService;
  let rabbitConnection: ChannelModel;
  let rabbitChannel: Channel;
  let consumerTag: string;

  beforeAll(async () => {
    process.env.PAYMENT_ACCOUNT_QUEUE_NAME = QUEUE_NAME;
    const paymentDatabaseUrl = required(PAYMENT_DATABASE_URL, 'PAYMENT_LIFECYCLE_TEST_DB_URL');
    const gatewayDatabaseUrl = required(GATEWAY_DATABASE_URL, 'GATEWAY_LIFECYCLE_TEST_DB_URL');
    const rabbitmqUrl = required(RABBITMQ_URL, 'PAYMENT_TEST_RABBIT_URL');
    payment = new PaymentPrismaClient({
      adapter: new PrismaPg({ connectionString: paymentDatabaseUrl }),
    });
    gateway = new GatewayPrismaClient({
      adapter: new PrismaPg({ connectionString: gatewayDatabaseUrl }),
    });
    await Promise.all([payment.$connect(), gateway.$connect()]);

    const { PaymentRabbitConsumer } = jest.requireActual<
      typeof import('../../../main-gateway-service/src/modules/users/infrastructure/payment.rabbit.consumer')
    >('../../../main-gateway-service/src/modules/users/infrastructure/payment.rabbit.consumer');
    const consumer = new PaymentRabbitConsumer(
      gateway as unknown as GatewayPrismaService,
      { publish: jest.fn() } as unknown as AmqpConnection,
    );
    rabbitConnection = await amqp.connect(rabbitmqUrl);
    rabbitChannel = await rabbitConnection.createChannel();
    await rabbitChannel.assertExchange('common_exchange', 'topic', { durable: true });
    await rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });
    await rabbitChannel.bindQueue(QUEUE_NAME, 'common_exchange', 'subscription.activated');
    await rabbitChannel.bindQueue(QUEUE_NAME, 'common_exchange', 'payment.subscription.expired');
    await rabbitChannel.assertQueue(`${QUEUE_NAME}.retry`, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'common_exchange',
        'x-dead-letter-routing-key': 'gateway.payment-entitlement.retry.ready',
      },
    });
    await rabbitChannel.bindQueue(
      `${QUEUE_NAME}.retry`,
      'common_exchange',
      'gateway.payment-entitlement.retry.delay',
    );
    await rabbitChannel.assertQueue(`${QUEUE_NAME}.dlq`, { durable: true });
    await rabbitChannel.bindQueue(
      `${QUEUE_NAME}.dlq`,
      'common_exchange',
      'gateway.payment-entitlement.dlq',
    );
    const registration = await rabbitChannel.consume(QUEUE_NAME, async (message) => {
      if (!message) return;
      const result = await consumer.handlePaymentEntitlementEvent(message.content, {
        properties: {
          headers: message.properties.headers,
          messageId: message.properties.messageId,
        },
      });
      if (result instanceof Nack) {
        rabbitChannel.nack(message, false, result.requeue);
        return;
      }
      rabbitChannel.ack(message);
    });
    consumerTag = registration.consumerTag;

    const config = {
      outboxRelayEnabled: true,
      outboxRelayCron: '* * * * * *',
      outboxRelayBatchSize: 20,
      outboxRelayMaxAttempts: 3,
      outboxRelayBackoffSeconds: 5,
      outboxRelayLockTimeoutSeconds: 30,
      rabbitUrl: rabbitmqUrl,
    } as PaymentConfig;
    publisher = new PaymentOutboxPublisher(config);
    relay = new PaymentOutboxRelayService(
      config,
      new PaymentOutboxRelayRepository(payment as unknown as PaymentPrismaService),
      publisher,
    );

    await gateway.paymentEntitlementInbox.deleteMany({ where: { userId: USER_ID } });
    await gateway.paymentEntitlementCursor.deleteMany({ where: { userId: USER_ID } });
    await gateway.user.upsert({
      where: { id: USER_ID },
      create: {
        id: USER_ID,
        email: 'lifecycle-gateway@example.test',
        isConfirmed: true,
        accountType: 'PERSONAL',
      },
      update: { accountType: 'PERSONAL', deletedAt: null },
    });
    await payment.outboxEvent.deleteMany({
      where: {
        aggregateId: {
          in: ['83000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002'],
        },
      },
    });
    await payment.subscription.deleteMany({ where: { userId: USER_ID } });
    await payment.product.upsert({
      where: { id: PRODUCT_ID },
      create: {
        id: PRODUCT_ID,
        code: 'ENTITLEMENT_WEEK',
        name: 'Entitlement week',
        billingInterval: 'WEEK',
        billingIntervalCount: 1,
        priceMinor: 800,
        currency: 'USD',
      },
      update: {},
    });
  });

  afterAll(async () => {
    await publisher.close();
    await rabbitChannel.cancel(consumerTag);
    await rabbitChannel.close();
    await rabbitConnection.close();
    await Promise.all([payment.$disconnect(), gateway.$disconnect()]);
  });

  async function enqueue(input: {
    eventId: string;
    subscriptionId: string;
    eventType: 'subscription.activated.v1' | 'subscription.expired.v1';
    routingKey: 'subscription.activated' | 'payment.subscription.expired';
    payload: EntitlementPayload;
  }): Promise<void> {
    await payment.outboxEvent.create({
      data: {
        id: input.eventId,
        aggregateType: 'SUBSCRIPTION',
        aggregateId: input.subscriptionId,
        eventType: input.eventType,
        eventVersion: 1,
        routingKey: input.routingKey,
        payload: input.payload,
        availableAt: new Date(),
        occurredAt: new Date(),
      },
    });
    relay.tick();
    await eventually(async () => {
      const outbox = await payment.outboxEvent.findUniqueOrThrow({ where: { id: input.eventId } });
      expect(outbox.status).toBe('PUBLISHED');
      expect(outbox.attempts).toBe(1);
    });
  }

  it('applies activation, replacement-safe expiration, ordering, final expiration and duplicates', async () => {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const firstSubscriptionId = '83000000-0000-4000-8000-000000000001';
    const replacementId = '83000000-0000-4000-8000-000000000002';
    const activationId = '85000000-0000-4000-8000-000000000001';
    const replacementExpirationId = '85000000-0000-4000-8000-000000000002';
    const replacementActivationId = '85000000-0000-4000-8000-000000000003';
    const staleActivationId = '85000000-0000-4000-8000-000000000004';
    const finalExpirationId = '85000000-0000-4000-8000-000000000005';

    await payment.$transaction(async (transaction) => {
      await transaction.subscription.create({
        data: {
          id: firstSubscriptionId,
          userId: USER_ID,
          productId: PRODUCT_ID,
          provider: 'STRIPE',
          sequence: 1,
          status: 'ACTIVE',
          autoRenew: false,
          startsAt: now,
          endsAt,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          id: activationId,
          aggregateType: 'SUBSCRIPTION',
          aggregateId: firstSubscriptionId,
          eventType: 'subscription.activated.v1',
          eventVersion: 1,
          routingKey: 'subscription.activated',
          payload: {
            userId: USER_ID,
            subscriptionId: firstSubscriptionId,
            subscriptionSequence: 1,
            startsAt: now.toISOString(),
            endsAt: endsAt.toISOString(),
            productId: PRODUCT_ID,
          },
          availableAt: now,
          occurredAt: now,
        },
      });
    });
    relay.tick();
    await eventually(async () => {
      expect((await gateway.user.findUniqueOrThrow({ where: { id: USER_ID } })).accountType).toBe(
        'BUSINESS',
      );
      expect(
        (await payment.outboxEvent.findUniqueOrThrow({ where: { id: activationId } })).status,
      ).toBe('PUBLISHED');
    });

    const activation = await payment.outboxEvent.findUniqueOrThrow({ where: { id: activationId } });
    await publisher.publish({
      id: activation.id,
      aggregateType: activation.aggregateType,
      aggregateId: activation.aggregateId,
      eventType: activation.eventType,
      eventVersion: activation.eventVersion,
      routingKey: activation.routingKey,
      payload: activation.payload,
      attempts: activation.attempts,
      occurredAt: activation.occurredAt,
    });
    await eventually(async () => {
      expect(
        await gateway.paymentEntitlementInbox.count({ where: { eventId: activationId } }),
      ).toBe(1);
    });

    await enqueue({
      eventId: replacementExpirationId,
      subscriptionId: firstSubscriptionId,
      eventType: 'subscription.expired.v1',
      routingKey: 'payment.subscription.expired',
      payload: {
        userId: USER_ID,
        subscriptionId: firstSubscriptionId,
        subscriptionSequence: 1,
        endsAt: endsAt.toISOString(),
        hasActiveReplacement: true,
        replacementSubscriptionId: replacementId,
      },
    });
    await eventually(async () => {
      expect((await gateway.user.findUniqueOrThrow({ where: { id: USER_ID } })).accountType).toBe(
        'BUSINESS',
      );
    });

    await enqueue({
      eventId: replacementActivationId,
      subscriptionId: replacementId,
      eventType: 'subscription.activated.v1',
      routingKey: 'subscription.activated',
      payload: {
        userId: USER_ID,
        subscriptionId: replacementId,
        subscriptionSequence: 2,
        startsAt: endsAt.toISOString(),
        endsAt: new Date(endsAt.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        productId: PRODUCT_ID,
      },
    });
    await enqueue({
      eventId: staleActivationId,
      subscriptionId: firstSubscriptionId,
      eventType: 'subscription.activated.v1',
      routingKey: 'subscription.activated',
      payload: {
        userId: USER_ID,
        subscriptionId: firstSubscriptionId,
        subscriptionSequence: 1,
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
        productId: PRODUCT_ID,
      },
    });
    await eventually(async () => {
      const cursor = await gateway.paymentEntitlementCursor.findUniqueOrThrow({
        where: { userId: USER_ID },
      });
      expect(cursor.lastSubscriptionSequence).toBe(2);
      expect(
        (
          await gateway.paymentEntitlementInbox.findUniqueOrThrow({
            where: { eventId: staleActivationId },
          })
        ).outcome,
      ).toBe('STALE');
    });

    await enqueue({
      eventId: finalExpirationId,
      subscriptionId: replacementId,
      eventType: 'subscription.expired.v1',
      routingKey: 'payment.subscription.expired',
      payload: {
        userId: USER_ID,
        subscriptionId: replacementId,
        subscriptionSequence: 2,
        endsAt: new Date(endsAt.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        hasActiveReplacement: false,
        replacementSubscriptionId: null,
      },
    });
    await eventually(async () => {
      expect((await gateway.user.findUniqueOrThrow({ where: { id: USER_ID } })).accountType).toBe(
        'PERSONAL',
      );
      expect(await gateway.paymentEntitlementInbox.count({ where: { userId: USER_ID } })).toBe(5);
    });

    const finalEvent = await payment.outboxEvent.findUniqueOrThrow({
      where: { id: finalExpirationId },
    });
    await publisher.publish({
      id: finalEvent.id,
      aggregateType: finalEvent.aggregateType,
      aggregateId: finalEvent.aggregateId,
      eventType: finalEvent.eventType,
      eventVersion: finalEvent.eventVersion,
      routingKey: finalEvent.routingKey,
      payload: finalEvent.payload,
      attempts: finalEvent.attempts,
      occurredAt: finalEvent.occurredAt,
    });
    await eventually(async () => {
      expect(await gateway.paymentEntitlementInbox.count({ where: { userId: USER_ID } })).toBe(5);
      expect((await gateway.user.findUniqueOrThrow({ where: { id: USER_ID } })).accountType).toBe(
        'PERSONAL',
      );
    });
  });
});
