import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { IsolatedRabbit } from '../../../main-gateway-service/test/superadmin/isolated-rabbit';
import { createIsolatedPostDatabase } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { PostConfig } from '../../src/core/post.config';
import { PostUserProfileConsumer } from '../../src/modules/posts/infrastructure/messaging/post-user-profile.consumer';
import * as transport from '../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import * as topology from '../../../../libs/contracts/src/events/post-user-profile-delivery';
import * as paymentTopology from '../../../../libs/contracts/src/events/payment-user-profile-delivery';
import { parsePaymentUserProfileChangedV1 } from '../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';

type TestChannel = transport.ProfileConsumerChannel & {
  get(queue: string, options: object): Promise<transport.ProfileMessage | false>;
  purgeQueue(queue: string): Promise<unknown>;
  checkQueue(queue: string): Promise<{ messageCount: number; consumerCount: number }>;
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
  throw new Error('Expected isolated Post delivery state was not observed');
}

function event(
  input: { userId?: string; sourceVersion?: string; username?: string } = {},
): ReturnType<typeof parsePaymentUserProfileChangedV1> {
  return parsePaymentUserProfileChangedV1({
    eventId: randomUUID(),
    eventType: 'payment.user-profile.changed.v1',
    schemaVersion: 1,
    occurredAt: '2026-10-26T12:00:00.000Z',
    userId: input.userId ?? randomUUID(),
    sourceVersion: input.sourceVersion ?? '1',
    username: input.username ?? 'fixture_post_author',
    profileExists: true,
    isDeleted: false,
  });
}

describe('D2b Post consumer on real isolated PostgreSQL and RabbitMQ', () => {
  jest.setTimeout(180000);
  const database = new IsolatedAdminDatabase();
  const rabbit = new IsolatedRabbit();
  const consumers: PostUserProfileConsumer[] = [];
  let post: PrismaClient;
  let connection: transport.ProfileBrokerConnection;
  let channel: TestChannel;
  let sender: transport.PaymentProfileConfirmPublisher;

  function config(overrides: Record<string, string> = {}): PostConfig {
    return new PostConfig(
      new ConfigService<Record<string, string>, true>({
        PORT: '3004',
        GRPC_PORT: '50051',
        DATABASE_URL: 'postgresql://127.0.0.1:1/unused_config',
        RABBITMQ_URL: rabbit.url,
        ...overrides,
      }),
    );
  }
  function consumer(): PostUserProfileConsumer {
    const instance = new PostUserProfileConsumer(
      post as PrismaService,
      config({ POST_USER_PROJECTION_SYNC_ENABLED: 'true' }),
    );
    consumers.push(instance);
    return instance;
  }
  async function publish(input: { content: Buffer; messageId?: string }): Promise<void> {
    await sender.publish({
      routingKey: topology.POST_PROFILE_SOURCE_KEY,
      content: input.content,
      messageId: input.messageId ?? randomUUID(),
    });
  }
  async function drained(): Promise<void> {
    await waitFor({
      check: () => {
        const counts = rabbit
          .deliveryCounts()
          .find((row) => row.name === topology.POST_PROFILE_QUEUE);
        return Promise.resolve(
          !!counts && counts.messages_ready === 0 && counts.messages_unacknowledged === 0,
        );
      },
    });
  }

  beforeAll(async () => {
    await database.start();
    post = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => undefined });
    await rabbit.start();
    await rabbit.connection();
    connection = await transport.connectPaymentProfileBroker(rabbit.url);
    channel = (await connection.createChannel()) as TestChannel;
    sender = new transport.PaymentProfileConfirmPublisher(rabbit.url);
    // A real independent Payment queue, not a simulated Payment MS consumer or handler.
    await channel.assertQueue(paymentTopology.PAYMENT_PROFILE_QUEUE, {
      durable: true,
      exclusive: false,
      autoDelete: false,
    });
    await channel.bindQueue(
      paymentTopology.PAYMENT_PROFILE_QUEUE,
      topology.POST_PROFILE_EXCHANGE,
      paymentTopology.PAYMENT_PROFILE_ROUTING_KEY,
    );
    const initializer = consumer();
    await initializer.connect();
    expect(initializer.isConnected()).toBe(true);
    await initializer.onModuleDestroy();
    consumers.length = 0;
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await post.postAdminUserProfile.deleteMany();
    for (const queue of [
      topology.POST_PROFILE_QUEUE,
      topology.POST_PROFILE_RETRY_QUEUE,
      topology.POST_PROFILE_DLQ,
      paymentTopology.PAYMENT_PROFILE_QUEUE,
    ]) {
      await channel.purgeQueue(queue);
    }
  });
  afterEach(async () => {
    await Promise.all(consumers.splice(0).map((instance) => instance.onModuleDestroy()));
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await sender?.close();
    await connection?.close();
    await post?.$disconnect();
    await rabbit.stop();
    await database.stop();
  });

  it('independently routes source to Post and Payment, applies duplicates/stale and shuts down competing consumers', async () => {
    const first = consumer();
    const second = consumer();
    await Promise.all([first.connect(), second.connect()]);
    expect((await channel.checkQueue(topology.POST_PROFILE_QUEUE)).consumerCount).toBe(2);
    const initial = event({ sourceVersion: '2' });
    const content = Buffer.from(JSON.stringify(initial));
    await publish({ content, messageId: initial.eventId });
    await waitFor({
      check: async () =>
        !!(await post.postAdminUserProfile.findUnique({ where: { userId: initial.userId } })),
    });
    const paymentCopy = await channel.get(paymentTopology.PAYMENT_PROFILE_QUEUE, { noAck: true });
    expect(paymentCopy && paymentCopy.content.equals(content)).toBe(true);
    expect(paymentCopy && paymentCopy.properties.messageId).toBe(initial.eventId);
    await publish({ content, messageId: initial.eventId });
    await publish({ content: Buffer.from(JSON.stringify({ ...initial, sourceVersion: '1' })) });
    await drained();
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: initial.userId } }),
    ).toMatchObject({ sourceVersion: 2n, username: initial.username });
    expect(
      await post.postAdminUserProjectionSync.findUnique({ where: { id: 'post-user-profile-v1' } }),
    ).toMatchObject({ phase: 'NOT_READY', sourceWritersConfirmedAt: null });
    await first.onModuleDestroy();
    await second.onModuleDestroy();
    expect(first.isConnected()).toBe(false);
    expect((await channel.checkQueue(topology.POST_PROFILE_QUEUE)).consumerCount).toBe(0);
    const connect = jest.spyOn(transport, 'connectPaymentProfileBroker');
    await first.connect();
    expect(connect).not.toHaveBeenCalled();
  });

  it('retains storage failure through actual 60000ms TTL and routes the retry only to Post', async () => {
    await consumer().connect();
    const value = event();
    await post.$executeRaw`ALTER TABLE "post_admin_user_profile" ADD CONSTRAINT fixture_post_delivery_failure CHECK(false) NOT VALID`;
    try {
      await publish({ content: Buffer.from(JSON.stringify(value)), messageId: value.eventId });
      await waitFor({
        check: async () =>
          (await channel.checkQueue(topology.POST_PROFILE_RETRY_QUEUE)).messageCount === 1,
      });
      await drained();
      expect(
        await post.postAdminUserProfile.findUnique({ where: { userId: value.userId } }),
      ).toBeNull();
      expect(await channel.get(paymentTopology.PAYMENT_PROFILE_QUEUE, { noAck: true })).not.toBe(
        false,
      );
    } finally {
      await post.$executeRaw`ALTER TABLE "post_admin_user_profile" DROP CONSTRAINT fixture_post_delivery_failure`;
    }
    await waitFor({
      timeoutMs: 80000,
      check: async () =>
        (await post.postAdminUserProfile.findUnique({ where: { userId: value.userId } }))
          ?.sourceVersion === 1n,
    });
    await drained();
    expect((await channel.checkQueue(paymentTopology.PAYMENT_PROFILE_QUEUE)).messageCount).toBe(0);
    expect((await channel.checkQueue(topology.POST_PROFILE_RETRY_QUEUE)).messageCount).toBe(0);
  });

  it('confirms invalid payload, equal-version conflict and resurrection into the Post DLQ unchanged', async () => {
    await consumer().connect();
    const value = event();
    await publish({ content: Buffer.from(JSON.stringify(value)) });
    await drained();
    const invalid = Buffer.from('not-json');
    const conflict = Buffer.from(JSON.stringify({ ...value, username: 'conflict' }));
    await publish({ content: invalid, messageId: 'fixture-invalid' });
    await publish({ content: conflict, messageId: value.eventId });
    await publish({
      content: Buffer.from(
        JSON.stringify({ ...value, sourceVersion: '2', isDeleted: true, username: null }),
      ),
    });
    const resurrection = Buffer.from(JSON.stringify({ ...value, sourceVersion: '3' }));
    await publish({ content: resurrection });
    await drained();
    const messages = await Promise.all(
      [0, 1, 2].map(() => channel.get(topology.POST_PROFILE_DLQ, { noAck: true })),
    );
    expect(messages.filter(Boolean)).toHaveLength(3);
    expect(messages.map((message) => message && message.content.toString())).toEqual([
      invalid.toString(),
      conflict.toString(),
      resurrection.toString(),
    ]);
    expect(messages[0] && messages[0].properties.headers?.['x-post-profile-reason']).toBe(
      'INVALID_EVENT',
    );
    expect(messages[1] && messages[1].properties.messageId).toBe(value.eventId);
    expect((await channel.checkQueue(topology.POST_PROFILE_RETRY_QUEUE)).messageCount).toBe(0);
  });

  it.each(['retry', 'dlq'] as const)(
    'does not ack original when %s republish is unconfirmed (transport fault only)',
    async (kind) => {
      const instance = consumer();
      await instance.connect();
      const original = sender.publish.bind(sender);
      jest
        .spyOn(transport.PaymentProfileConfirmPublisher.prototype, 'publish')
        .mockImplementation((input) => {
          if (
            input.routingKey ===
            (kind === 'retry' ? topology.POST_PROFILE_RETRY_QUEUE : topology.POST_PROFILE_DLQ_KEY)
          )
            return Promise.reject(new Error('Controlled unconfirmed publish'));
          return original(input);
        });
      const value = event();
      const content =
        kind === 'retry' ? Buffer.from(JSON.stringify(value)) : Buffer.from('invalid');
      if (kind === 'retry')
        await post.$executeRaw`ALTER TABLE "post_admin_user_profile" ADD CONSTRAINT fixture_post_unconfirmed CHECK(false) NOT VALID`;
      try {
        await publish({ content, messageId: value.eventId });
        await waitFor({
          check: async () => {
            const stats = await channel.checkQueue(topology.POST_PROFILE_QUEUE);
            return stats.messageCount === 1 && stats.consumerCount === 0;
          },
        });
        expect(instance.isConnected()).toBe(false);
        expect((await channel.checkQueue(topology.POST_PROFILE_RETRY_QUEUE)).messageCount).toBe(0);
        expect((await channel.checkQueue(topology.POST_PROFILE_DLQ)).messageCount).toBe(0);
        const retained = await channel.get(topology.POST_PROFILE_QUEUE, { noAck: true });
        expect(retained && retained.content.equals(content)).toBe(true);
      } finally {
        if (kind === 'retry')
          await post.$executeRaw`ALTER TABLE "post_admin_user_profile" DROP CONSTRAINT fixture_post_unconfirmed`;
      }
    },
  );

  it('defaults off without a connection/export address, validates enabled config and runs Nest lifecycle safely', async () => {
    const disabled = config();
    expect(disabled.userProjectionSyncEnabled).toBe(false);
    expect(() => config({ POST_USER_PROJECTION_SYNC_ENABLED: 'invalid' })).toThrow(
      'must be true or false',
    );
    expect(() =>
      config({ POST_USER_PROJECTION_SYNC_ENABLED: 'true', RABBITMQ_URL: 'not-a-url' }),
    ).toThrow('valid AMQP URL');
    const connect = jest.spyOn(transport, 'connectPaymentProfileBroker');
    const module = await Test.createTestingModule({
      providers: [
        PostUserProfileConsumer,
        { provide: PrismaService, useValue: post },
        { provide: PostConfig, useValue: disabled },
      ],
    }).compile();
    await module.init();
    expect(module.get(PostUserProfileConsumer).isConnected()).toBe(false);
    await module.get(PostUserProfileConsumer).connect();
    await module.close();
    expect(connect).not.toHaveBeenCalled();
    expect((await channel.checkQueue(topology.POST_PROFILE_QUEUE)).consumerCount).toBe(0);
  });
});
