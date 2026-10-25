import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { IsolatedRabbit } from './isolated-rabbit';
import { createIsolatedPaymentDatabase } from './isolated-payment-database';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import type { PrismaService as PaymentPrismaService } from '../../../micro-payment-service/src/core/prisma/prisma.service';
import type { PrismaClient as PaymentClient } from '../../../micro-payment-service/src/core/prisma/client';
import type { GatewayConfig } from '../../src/core/gateway.config';
import type { PaymentConfig } from '../../../micro-payment-service/src/core/payment.config';
import { PaymentUserProfileRelay } from '../../src/modules/users/infrastructure/outbox/payment-user-profile-relay';
import { PaymentUserProfileConsumer } from '../../../micro-payment-service/src/modules/payment/infrastructure/messaging/payment-user-profile.consumer';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { ProfileRepository } from '../../src/modules/users/infrastructure/profile.repository';
import { UserEntity } from '../../src/modules/users/domain/user.entity';
import { ProfileEntity } from '../../src/modules/users/domain/profile.entity';
import * as transport from '../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import * as topology from '../../../../libs/contracts/src/events/payment-user-profile-delivery';
import { parsePaymentUserProfileChangedV1 } from '../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';

type TestChannel = transport.ProfileConsumerChannel & {
  get(queue: string, options: object): Promise<transport.ProfileMessage | false>;
  purgeQueue(queue: string): Promise<unknown>;
  checkQueue(queue: string): Promise<{ messageCount: number; consumerCount: number }>;
  unbindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
};
async function waitFor(input: {
  check: () => Promise<boolean>;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (input.timeoutMs ?? 10000);
  while (Date.now() < deadline) {
    if (await input.check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Expected isolated delivery state was not observed');
}

describe('P1c real isolated source PostgreSQL -> RabbitMQ -> Payment PostgreSQL', () => {
  jest.setTimeout(180000);
  const database = new IsolatedAdminDatabase();
  const rabbit = new IsolatedRabbit();
  let gateway: PrismaService;
  let payment: PaymentClient;
  let connection: transport.ProfileBrokerConnection;
  let channel: TestChannel;
  let sender: transport.PaymentProfileConfirmPublisher;
  let relay: PaymentUserProfileRelay;
  const consumers: PaymentUserProfileConsumer[] = [];
  const relays: PaymentUserProfileRelay[] = [];

  function consumer(enabled = true): PaymentUserProfileConsumer {
    const instance = new PaymentUserProfileConsumer(
      payment as PaymentPrismaService,
      {
        userProjectionSyncEnabled: enabled,
        rabbitUrl: rabbit.url,
      } as PaymentConfig,
    );
    consumers.push(instance);
    return instance;
  }
  function newRelay(): PaymentUserProfileRelay {
    const instance = new PaymentUserProfileRelay(gateway, {
      rabbitmqUrl: rabbit.url,
    } as GatewayConfig);
    relays.push(instance);
    return instance;
  }
  async function source(): Promise<{ userId: string; rowId: string }> {
    const user = await new PrismaUsersRepository(gateway).save(
      UserEntity.createNew(randomUUID() + '@fixture.test', null),
    );
    const row = await gateway.paymentUserProfileOutbox.findFirstOrThrow({
      where: { userId: user.id },
    });
    return { userId: user.id, rowId: row.id };
  }
  async function publish(content: Buffer): Promise<void> {
    await sender.publish({
      routingKey: topology.PAYMENT_PROFILE_ROUTING_KEY,
      content,
      messageId: randomUUID(),
    });
  }
  async function drained(): Promise<void> {
    await waitFor({
      check: () => {
        const stats = rabbit
          .deliveryCounts()
          .find((row) => row.name === topology.PAYMENT_PROFILE_QUEUE);
        return Promise.resolve(
          !!stats && stats.messages_ready === 0 && stats.messages_unacknowledged === 0,
        );
      },
    });
  }

  beforeAll(async () => {
    await database.start();
    gateway = database.client();
    payment = createIsolatedPaymentDatabase(database);
    await rabbit.start();
    await rabbit.connection(); // Existing helper waits for AMQP readiness, not just an open TCP port.
    connection = await transport.connectPaymentProfileBroker(rabbit.url);
    channel = (await connection.createChannel()) as TestChannel;
    sender = new transport.PaymentProfileConfirmPublisher(rabbit.url);
    // Production consumer declares the topology, not a parallel test implementation.
    const bootstrap = consumer();
    await bootstrap.connect();
    await waitFor({
      check: async () =>
        (await channel.checkQueue(topology.PAYMENT_PROFILE_QUEUE)).consumerCount === 1,
    });
    await bootstrap.onModuleDestroy();
    consumers.length = 0;
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await gateway.user.deleteMany();
    await gateway.paymentUserProfileOutbox.deleteMany();
    await payment.adminUserProfileReadModel.deleteMany();
    for (const queue of [
      topology.PAYMENT_PROFILE_QUEUE,
      topology.PAYMENT_PROFILE_RETRY_QUEUE,
      topology.PAYMENT_PROFILE_DLQ,
    ]) {
      await channel.purgeQueue(queue);
    }
    relay = newRelay();
  });
  afterEach(async () => {
    await Promise.all(consumers.splice(0).map((instance) => instance.onModuleDestroy()));
    await Promise.all(relays.splice(0).map((instance) => instance.onModuleDestroy()));
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await sender?.close();
    await connection?.close();
    await payment?.$disconnect();
    await rabbit.stop();
    await database.stop();
  });

  it('delivers saved snapshots, competes on one queue and ignores duplicate/out-of-order messages without declaring READY', async () => {
    const firstConsumer = consumer();
    const secondConsumer = consumer();
    expect(firstConsumer.isConnected()).toBe(false);
    await Promise.all([firstConsumer.connect(), secondConsumer.connect()]);
    expect(firstConsumer.isConnected()).toBe(true);
    expect(secondConsumer.isConnected()).toBe(true);
    expect((await channel.checkQueue(topology.PAYMENT_PROFILE_QUEUE)).consumerCount).toBe(2);
    const { userId, rowId } = await source();
    const saved = await gateway.paymentUserProfileOutbox.findUniqueOrThrow({
      where: { id: rowId },
    });
    await relay.relay();
    await waitFor({
      check: async () =>
        !!(await payment.adminUserProfileReadModel.findUnique({ where: { userId } })),
    });
    expect(
      (await gateway.paymentUserProfileOutbox.findUniqueOrThrow({ where: { id: rowId } }))
        .publishedAt,
    ).not.toBeNull();
    await new ProfileRepository(gateway).save(ProfileEntity.createNew(userId, 'delivered_fixture'));
    await relay.relay();
    await waitFor({
      check: async () =>
        (await payment.adminUserProfileReadModel.findUnique({ where: { userId } }))
          ?.sourceVersion === 2n,
    });
    const newer = await gateway.paymentUserProfileOutbox.findFirstOrThrow({
      where: { userId, sourceVersion: 2n },
    });
    await publish(Buffer.from(JSON.stringify(newer.payload)));
    await publish(Buffer.from(JSON.stringify(saved.payload)));
    await drained();
    expect(await payment.adminUserProfileReadModel.findUnique({ where: { userId } })).toMatchObject(
      { sourceVersion: 2n, username: 'delivered_fixture' },
    );
    expect(
      await payment.adminUserProjectionSync.findUnique({
        where: { id: 'payment-user-profile-v1' },
      }),
    ).toMatchObject({ phase: 'NOT_READY', sourceWritersConfirmedAt: null });
    await firstConsumer.onModuleDestroy();
    expect(firstConsumer.isConnected()).toBe(false);
  });

  it('retains storage failures in the real 60000ms retry queue and applies after DB recovery', async () => {
    await consumer().connect();
    const { userId } = await source();
    await payment.$executeRawUnsafe(
      'ALTER TABLE "admin_user_profile_read_model" ADD CONSTRAINT "fixture_delivery_failure" CHECK(false) NOT VALID',
    );
    try {
      await relay.relay();
      await waitFor({
        check: async () =>
          (await channel.checkQueue(topology.PAYMENT_PROFILE_RETRY_QUEUE)).messageCount === 1,
      });
      await drained();
      expect(await payment.adminUserProfileReadModel.findUnique({ where: { userId } })).toBeNull();
    } finally {
      await payment.$executeRawUnsafe(
        'ALTER TABLE "admin_user_profile_read_model" DROP CONSTRAINT "fixture_delivery_failure"',
      );
    }
    // Observe actual broker TTL/dead-letter routing once, rather than replacing the retry transport.
    await waitFor({
      timeoutMs: 80000,
      check: async () =>
        (await payment.adminUserProfileReadModel.findUnique({ where: { userId } }))
          ?.sourceVersion === 1n,
    });
    await drained();
  });

  it('dead-letters malformed events and equal-version conflicts with the original bytes', async () => {
    await consumer().connect();
    const { userId, rowId } = await source();
    await relay.relay();
    await waitFor({
      check: async () =>
        !!(await payment.adminUserProfileReadModel.findUnique({ where: { userId } })),
    });
    const row = await gateway.paymentUserProfileOutbox.findUniqueOrThrow({ where: { id: rowId } });
    const event = parsePaymentUserProfileChangedV1(row.payload);
    const conflict = Buffer.from(
      JSON.stringify({ ...event, profileExists: true, username: 'conflicting_name' }),
    );
    for (const content of [Buffer.from('{"schemaVersion":999}'), conflict]) {
      await publish(content);
      await waitFor({
        check: async () =>
          (await channel.checkQueue(topology.PAYMENT_PROFILE_DLQ)).messageCount === 1,
      });
      const dead = await channel.get(topology.PAYMENT_PROFILE_DLQ, { noAck: true });
      expect(dead && dead.content.equals(content)).toBe(true);
    }
    expect(await payment.adminUserProfileReadModel.findUnique({ where: { userId } })).toMatchObject(
      { sourceVersion: 1n, profileExists: false, username: null },
    );
  });

  it('does not mark an unroutable confirmed publish as delivered, and a later relay retries the same payload', async () => {
    await channel.unbindQueue(
      topology.PAYMENT_PROFILE_QUEUE,
      topology.PAYMENT_PROFILE_EXCHANGE,
      topology.PAYMENT_PROFILE_ROUTING_KEY,
    );
    const { rowId } = await source();
    const before = await gateway.paymentUserProfileOutbox.findUniqueOrThrow({
      where: { id: rowId },
    });
    try {
      await relay.relay();
      expect(
        await gateway.paymentUserProfileOutbox.findUnique({ where: { id: rowId } }),
      ).toMatchObject({ publishedAt: null, attempts: 1, lastErrorCode: 'PUBLISH_FAILED' });
    } finally {
      await channel.bindQueue(
        topology.PAYMENT_PROFILE_QUEUE,
        topology.PAYMENT_PROFILE_EXCHANGE,
        topology.PAYMENT_PROFILE_ROUTING_KEY,
      );
    }
    await gateway.paymentUserProfileOutbox.update({
      where: { id: rowId },
      data: { availableAt: new Date(0) },
    });
    await newRelay().relay();
    expect(
      await gateway.paymentUserProfileOutbox.findUnique({ where: { id: rowId } }),
    ).toMatchObject({ payload: before.payload, sourceVersion: before.sourceVersion, attempts: 2 });
    expect(
      (await gateway.paymentUserProfileOutbox.findUniqueOrThrow({ where: { id: rowId } }))
        .publishedAt,
    ).not.toBeNull();
    const delivered = await channel.get(topology.PAYMENT_PROFILE_QUEUE, { noAck: true });
    expect(delivered && delivered.properties.messageId).toBe(rowId);
  });

  it.each(['retry', 'dlq'] as const)(
    'keeps the original unacknowledged when %s republish is unconfirmed (transport fault only)',
    async (kind) => {
      const active = consumer();
      await active.connect();
      const original = sender.publish.bind(sender);
      jest
        .spyOn(transport.PaymentProfileConfirmPublisher.prototype, 'publish')
        .mockImplementation((input) => {
          if (
            input.routingKey ===
            (kind === 'retry'
              ? topology.PAYMENT_PROFILE_RETRY_ROUTING_KEY
              : topology.PAYMENT_PROFILE_DLQ_ROUTING_KEY)
          ) {
            return Promise.reject(new Error('fixture-unconfirmed'));
          }
          return original(input);
        });
      const { rowId } = await source();
      const row = await gateway.paymentUserProfileOutbox.findUniqueOrThrow({
        where: { id: rowId },
      });
      if (kind === 'retry') {
        await payment.$executeRawUnsafe(
          'ALTER TABLE "admin_user_profile_read_model" ADD CONSTRAINT "fixture_ack_failure" CHECK(false) NOT VALID',
        );
      }
      try {
        await publish(
          kind === 'retry' ? Buffer.from(JSON.stringify(row.payload)) : Buffer.from('not-json'),
        );
        await waitFor({
          check: async () => {
            const queue = await channel.checkQueue(topology.PAYMENT_PROFILE_QUEUE);
            return queue.messageCount === 1 && queue.consumerCount === 0;
          },
        });
        expect((await channel.checkQueue(topology.PAYMENT_PROFILE_RETRY_QUEUE)).messageCount).toBe(
          0,
        );
        expect((await channel.checkQueue(topology.PAYMENT_PROFILE_DLQ)).messageCount).toBe(0);
      } finally {
        if (kind === 'retry')
          await payment.$executeRawUnsafe(
            'ALTER TABLE "admin_user_profile_read_model" DROP CONSTRAINT "fixture_ack_failure"',
          );
      }
    },
  );

  it('does not connect or consume with the feature disabled', async () => {
    const connect = jest.spyOn(transport, 'connectPaymentProfileBroker');
    const disabled = consumer(false);
    disabled.onModuleInit();
    await disabled.connect();
    expect(connect).not.toHaveBeenCalled();
    expect((await channel.checkQueue(topology.PAYMENT_PROFILE_QUEUE)).consumerCount).toBe(0);
  });
});
