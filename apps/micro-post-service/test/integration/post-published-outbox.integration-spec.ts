import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { IsolatedRabbit } from '../../../main-gateway-service/test/superadmin/isolated-rabbit';
import { createIsolatedPostDatabase, POST_PUBLISHED_MIGRATION } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { PostConfig } from '../../src/core/post.config';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { CreatePostHandler } from '../../src/modules/posts/application/commands/create-post.handler';
import { CreatePostCommand } from '../../src/modules/posts/application/commands/create-post.command';
import { PostPublishedRelay } from '../../src/modules/posts/infrastructure/post-published.relay';
import { OutboxRelayCron } from '../../src/modules/posts/infrastructure/outbox-relay.cron';
import { FileStatus } from '../../../../libs/contracts/src';
import {
  parsePostPublishedV1,
  POST_PUBLISHED_EXCHANGE,
  POST_PUBLISHED_ROUTING_KEY,
} from '../../../../libs/contracts/src/events/post-published-v1.event';
import {
  connectPaymentProfileBroker,
  PaymentProfileConfirmPublisher,
  type ProfileBrokerConnection,
  type ProfileConsumerChannel,
} from '../../../../libs/common/src/messaging/payment-profile-confirm-publisher';

type TestChannel = Omit<ProfileConsumerChannel, 'assertQueue'> & {
  assertQueue(name: string, options: object): Promise<{ queue: string }>;
  get(
    name: string,
    options: object,
  ): Promise<false | { content: Buffer; properties: { messageId: string; deliveryMode: number } }>;
  purgeQueue(name: string): Promise<unknown>;
  unbindQueue(name: string, exchange: string, key: string): Promise<unknown>;
};

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe('D4 atomic Post published outbox and confirm relay', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  const rabbit = new IsolatedRabbit();
  const fixturePostId = randomUUID();
  const ownerId = randomUUID();
  let post: PrismaClient;
  let connection: ProfileBrokerConnection;
  let channel: TestChannel;
  let queue: string;
  let config: PostConfig;
  let repository: PostCommandRepository;
  let migrationEvidence: unknown;
  const relays: PostPublishedRelay[] = [];

  function relay(): PostPublishedRelay {
    const instance = new PostPublishedRelay(post as PrismaService, config);
    relays.push(instance);
    return instance;
  }

  async function create(input: { fileOwner?: string; status?: FileStatus } = {}): Promise<string> {
    // Only File transport is replaced. The real create handler/repository/DB transaction run.
    const fileClient = {
      getService: () => ({
        getFileStatus: () =>
          of({
            file: {
              ownerId: input.fileOwner ?? ownerId,
              status: input.status ?? FileStatus.UPLOADED,
            },
          }),
      }),
    } as unknown as ClientGrpc;
    const handler = new CreatePostHandler(fileClient, repository);
    handler.onModuleInit();
    return handler.execute(
      new CreatePostCommand({
        ownerId,
        description: '',
        images: [{ fileId: randomUUID() }, { fileId: randomUUID() }],
      }),
    );
  }

  beforeAll(async () => {
    await database.start();
    post = createIsolatedPostDatabase({
      database,
      beforeProjectionMigration: () => {},
      beforePublishedMigration: (sql) =>
        sql(`
      INSERT INTO "Post" ("id","ownerId","description","updatedAt") VALUES ('${fixturePostId}','${ownerId}','preserved',now());
      INSERT INTO "PostImage" ("id","postId","fileId","order") VALUES ('${randomUUID()}','${fixturePostId}','${randomUUID()}',0);
      INSERT INTO "OutboxEvent" ("id","type","payload") VALUES ('${randomUUID()}','POST_DELETED','{"legacy":true}');
      INSERT INTO post_admin_user_profile (user_id,source_version,username,profile_exists,is_deleted) VALUES ('source-text',7,'preserved',true,false);
    `),
    });
    migrationEvidence = {
      posts: await post.post.count(),
      images: await post.postImage.count(),
      legacy: await post.outboxEvent.count(),
      profiles: await post.postAdminUserProfile.count(),
      published: await post.postPublishedOutbox.count(),
      sync: await post.postAdminUserProjectionSync.findUniqueOrThrow({
        where: { id: 'post-user-profile-v1' },
      }),
      migrations: await post.$queryRaw<
        { migration_name: string; finished_at: Date | null }[]
      >`SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE migration_name=${POST_PUBLISHED_MIGRATION}`,
    };
    await rabbit.start();
    await rabbit.connection();
    connection = await connectPaymentProfileBroker(rabbit.url);
    channel = (await connection.createChannel()) as TestChannel;
    queue = (await channel.assertQueue('', { exclusive: true, autoDelete: true })).queue;
    await channel.bindQueue(queue, POST_PUBLISHED_EXCHANGE, POST_PUBLISHED_ROUTING_KEY);
    config = new PostConfig(
      new ConfigService({
        PORT: '3004',
        GRPC_PORT: '50053',
        DATABASE_URL: 'isolated-fixture-only',
        RABBITMQ_URL: rabbit.url,
      }),
    );
    repository = new PostCommandRepository(post as PrismaService);
  });

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    await post.postPublishedOutbox.deleteMany();
    await post.outboxEvent.deleteMany();
    await post.post.deleteMany();
    await channel.purgeQueue(queue);
  });
  afterEach(async () => {
    await Promise.all(relays.splice(0).map((instance) => instance.onModuleDestroy()));
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await channel?.close();
    await connection?.close();
    await rabbit.stop();
    await post?.$disconnect();
    await database.stop();
  });

  it('migrate deploy preserves the explicitly baselined previous schema without inventing events', () => {
    expect(migrationEvidence).toMatchObject({
      posts: 1,
      images: 1,
      legacy: 1,
      profiles: 1,
      published: 0,
      sync: { phase: 'NOT_READY', sourceDeploymentRevision: null },
      migrations: [{ migration_name: POST_PUBLISHED_MIGRATION, finished_at: expect.any(Date) }],
    });
  });

  it('commits real create/images/saved-date payload atomically; File validation and outbox failure do not commit', async () => {
    const postId = await create();
    const saved = await post.post.findUniqueOrThrow({
      where: { id: postId },
      include: { images: true },
    });
    const event = await post.postPublishedOutbox.findFirstOrThrow({ where: { postId } });
    expect(saved.images).toHaveLength(2);
    expect(saved.description).toBe('');
    expect(event.payload).toEqual({
      schemaVersion: 1,
      eventId: event.id,
      postId,
      ownerId,
      publishedAt: saved.createdAt.toISOString(),
    });
    expect(event).toMatchObject({ attempts: 0, publishedAt: null, leaseId: null });
    expect(await channel.get(queue, { noAck: true })).toBe(false);
    for (const invalid of [
      { ...(event.payload as object), schemaVersion: 2 },
      { ...(event.payload as object), username: 'extra' },
      { ...(event.payload as object), publishedAt: '2026-02-30T00:00:00.000Z' },
      { ...(event.payload as object), postId: '' },
    ]) {
      expect(() => parsePostPublishedV1(invalid)).toThrow('Invalid post published contract');
    }
    await expect(create({ fileOwner: randomUUID() })).rejects.toThrow();
    await expect(create({ status: FileStatus.PENDING })).rejects.toThrow();
    await post.$executeRawUnsafe(
      'ALTER TABLE "PostPublishedOutbox" ADD CONSTRAINT test_reject_outbox CHECK (false) NOT VALID',
    );
    try {
      await expect(create()).rejects.toThrow();
    } finally {
      await post.$executeRawUnsafe(
        'ALTER TABLE "PostPublishedOutbox" DROP CONSTRAINT test_reject_outbox',
      );
    }
    expect(await post.post.count()).toBe(1);
    expect(await post.postImage.count()).toBe(2);
    expect(await post.postPublishedOutbox.count()).toBe(1);
  });

  it('real mandatory return retries unchanged payload; confirmed persistent publish completes even with only a wildcard binding', async () => {
    const postId = await create();
    const original = await post.postPublishedOutbox.findFirstOrThrow({ where: { postId } });
    await channel.unbindQueue(queue, POST_PUBLISHED_EXCHANGE, POST_PUBLISHED_ROUTING_KEY);
    try {
      await relay().relay();
      const retry = await post.postPublishedOutbox.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(retry).toMatchObject({
        publishedAt: null,
        attempts: 1,
        leaseId: null,
        lastErrorCode: 'PUBLISH_FAILED',
        payload: original.payload,
      });
      expect(retry.availableAt.getTime() - original.availableAt.getTime()).toBeGreaterThanOrEqual(
        1900,
      );
      await channel.bindQueue(queue, POST_PUBLISHED_EXCHANGE, '#');
      await post.postPublishedOutbox.update({
        where: { id: original.id },
        data: { availableAt: new Date(0) },
      });
      await relay().relay();
      const message = await channel.get(queue, { noAck: true });
      if (!message) throw new Error('Confirmed published event missing');
      expect(JSON.parse(message.content.toString())).toEqual(original.payload);
      expect(message.properties).toMatchObject({ messageId: original.id, deliveryMode: 2 });
      expect(
        await post.postPublishedOutbox.findUniqueOrThrow({ where: { id: original.id } }),
      ).toMatchObject({
        attempts: 2,
        publishedAt: expect.any(Date),
        leaseId: null,
        lastErrorCode: null,
      });
      // Acceptance by this test wildcard queue does not prove Gateway/browser delivery.
    } finally {
      await channel.unbindQueue(queue, POST_PUBLISHED_EXCHANGE, '#');
      await channel.bindQueue(queue, POST_PUBLISHED_EXCHANGE, POST_PUBLISHED_ROUTING_KEY);
    }
  });

  it('unconfirmed publish keeps the event pending and bounds reconnect attempts across rows', async () => {
    await create();
    await create();
    const publish = jest
      .spyOn(PaymentProfileConfirmPublisher.prototype, 'publish')
      .mockRejectedValue(new Error('controlled timeout'));
    const instance = relay();
    await instance.relay();
    await instance.relay();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await post.postPublishedOutbox.count({ where: { publishedAt: null } })).toBe(2);
    expect(await post.postPublishedOutbox.count({ where: { attempts: 0 } })).toBe(1);
    await instance.onModuleDestroy();
    await instance.relay();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('recovers expired leases and fences a stale owner with controlled concurrent delivery', async () => {
    await create();
    const entered = gate();
    const release = gate();
    const originalPublish = Object.getOwnPropertyDescriptor(
      PaymentProfileConfirmPublisher.prototype,
      'publish',
    )?.value as PaymentProfileConfirmPublisher['publish'];
    let first = true;
    jest
      .spyOn(PaymentProfileConfirmPublisher.prototype, 'publish')
      .mockImplementation(async function (this: PaymentProfileConfirmPublisher, input) {
        await originalPublish.call(this, input);
        if (first) {
          first = false;
          entered.open();
          await release.promise;
        }
      });
    const old = relay();
    const pending = old.relay();
    try {
      await entered.promise;
      await old.relay(); // no overlapping claim on one instance
      const claimed = await post.postPublishedOutbox.findFirstOrThrow();
      expect(claimed.attempts).toBe(1);
      await post.$executeRaw`UPDATE "PostPublishedOutbox" SET "leaseUntil"=clock_timestamp()-interval '1 second'`;
      await relay().relay();
      const completed = await post.postPublishedOutbox.findFirstOrThrow();
      expect(completed).toMatchObject({
        attempts: 2,
        publishedAt: expect.any(Date),
        leaseId: null,
      });
      release.open();
      await pending;
      expect(await post.postPublishedOutbox.findFirstOrThrow()).toEqual(completed);
      expect(await channel.get(queue, { noAck: true })).not.toBe(false);
      expect(await channel.get(queue, { noAck: true })).not.toBe(false);
    } finally {
      release.open();
      await pending;
    }
  });

  it('legacy delete relay processes only its old table; published event survives physical Post deletion', async () => {
    const postId = await create();
    await repository.deletePost(postId);
    expect(await post.post.count()).toBe(0);
    await new OutboxRelayCron(post as PrismaService, config).handleOutboxRelay();
    expect(await post.outboxEvent.findFirstOrThrow()).toMatchObject({ status: 'PROCESSED' });
    expect(await post.postPublishedOutbox.findFirstOrThrow()).toMatchObject({
      attempts: 0,
      publishedAt: null,
    });
    expect(await channel.get(queue, { noAck: true })).toBe(false);
    await relay().relay();
    expect(await post.postPublishedOutbox.findFirstOrThrow()).toMatchObject({
      postId,
      publishedAt: expect.any(Date),
    });
    expect(await post.outboxEvent.count({ where: { status: 'PROCESSED' } })).toBe(1);
  });
});
