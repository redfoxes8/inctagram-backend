import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { IsolatedRabbit } from './isolated-rabbit';
import { createIsolatedPaymentDatabase } from './isolated-payment-database';
import { createIsolatedPostDatabase } from '../../../micro-post-service/test/isolated-post-database';
import { UserAccessRevokeRelay } from '../../src/modules/users/infrastructure/outbox/user-access-revoke-relay';
import { PaymentUserProfileRelay } from '../../src/modules/users/infrastructure/outbox/payment-user-profile-relay';
import { PostPublishedRelay } from '../../../micro-post-service/src/modules/posts/infrastructure/post-published.relay';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { PrismaService as PostPrisma } from '../../../micro-post-service/src/core/prisma/prisma.service';
import type { PrismaClient as PaymentPrisma } from '../../../micro-payment-service/src/core/prisma/client';
import { GatewayConfig } from '../../src/core/gateway.config';
import { PostConfig } from '../../../micro-post-service/src/core/post.config';
import { PrismaTransactionManager } from '../../src/core/prisma/transactions/prisma.transaction.manager';
import { withGatewayTransaction } from '../../src/core/prisma/transactions/require-gateway-transaction';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { ProfileRepository } from '../../src/modules/users/infrastructure/profile.repository';
import { PrismaUserModerationRepository } from '../../src/modules/users/infrastructure/user-moderation.repository';
import { UserEntity } from '../../src/modules/users/domain/user.entity';
import { ProfileEntity } from '../../src/modules/users/domain/profile.entity';
import { PostEntity } from '../../../micro-post-service/src/modules/posts/domain/post.entity';
import { PostImageEntity } from '../../../micro-post-service/src/modules/posts/domain/post-image.entity';
import { PostCommandRepository } from '../../../micro-post-service/src/modules/posts/infrastructure/repositories/post.command-repository';
import { PaymentProfileConfirmPublisher } from '../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import { ProjectionBootstrapRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/projection-bootstrap.repository';
import { PostProjectionBootstrapRepository } from '../../../micro-post-service/src/modules/posts/infrastructure/repositories/post-projection-bootstrap.repository';
import { PaymentProfileBootstrapService } from '../../../micro-payment-service/src/modules/payment/application/services/payment-profile-bootstrap.service';
import { PostProfileBootstrapService } from '../../../micro-post-service/src/modules/posts/application/services/post-profile-bootstrap.service';
import { PaymentProfileBootstrapWorker } from '../../../micro-payment-service/src/modules/payment/infrastructure/schedulers/payment-profile-bootstrap.worker';
import { PostProfileBootstrapWorker } from '../../../micro-post-service/src/modules/posts/infrastructure/schedulers/post-profile-bootstrap.worker';
import { PaymentConfig } from '../../../micro-payment-service/src/core/payment.config';
import { PrismaService as PaymentPrismaService } from '../../../micro-payment-service/src/core/prisma/prisma.service';
import { USER_ACCESS_REVOKED_ROUTING_KEY } from '../../../../libs/contracts/src/user-access-revoked';

async function eventually(check: () => Promise<boolean> | boolean): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Isolated outbox deadline');
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

describe('post-commit wake-up and idle SQL on disposable PostgreSQL/Rabbit', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  const rabbit = new IsolatedRabbit();
  let gateway: PrismaService;
  let post: PostPrisma;
  let payment: PaymentPrisma;
  let broker: Awaited<ReturnType<typeof connect>>;
  let channel: Awaited<ReturnType<typeof broker.createChannel>>;
  const received: { routingKey: string; eventId: string }[] = [];
  let revoke: UserAccessRevokeRelay;
  let profile: PaymentUserProfileRelay;
  let published: PostPublishedRelay;
  let paymentWorker: PaymentProfileBootstrapWorker;
  let postWorker: PostProfileBootstrapWorker;

  beforeAll(async () => {
    expect(database.container).toMatch(/^sa-admin-test-[0-9a-f-]+$/);
    await database.start();
    gateway = database.client();
    payment = createIsolatedPaymentDatabase(database);
    post = createIsolatedPostDatabase({
      database,
      beforeProjectionMigration: () => {},
    }) as PostPrisma;
    await rabbit.start();
    const amqp = await rabbit.connection();
    broker = await connect(rabbit.url);
    channel = await broker.createChannel();
    const queue = await channel.assertQueue('', { exclusive: true });
    for (const key of [
      'payment.user-profile.changed.v1',
      USER_ACCESS_REVOKED_ROUTING_KEY,
      'post.published.v1',
    ])
      await channel.bindQueue(queue.queue, 'common_exchange', key);
    await channel.consume(
      queue.queue,
      (message) => {
        if (message)
          received.push({
            routingKey: message.fields.routingKey,
            eventId: (
              JSON.parse((message.content as Buffer).toString('utf8')) as { eventId: string }
            ).eventId,
          });
      },
      { noAck: true },
    );
    revoke = new UserAccessRevokeRelay(gateway, amqp, { now: () => new Date() });
    profile = new PaymentUserProfileRelay(gateway, { rabbitmqUrl: rabbit.url } as GatewayConfig);
    published = new PostPublishedRelay(post, { rabbitUrl: rabbit.url } as PostConfig);
  });
  afterAll(async () => {
    await paymentWorker?.onModuleDestroy();
    await postWorker?.onModuleDestroy();
    await revoke?.onModuleDestroy();
    await profile?.onModuleDestroy();
    await published?.onModuleDestroy();
    await channel?.close();
    await broker?.close();
    await payment?.$disconnect();
    await post?.$disconnect();
    await rabbit.stop();
    await database.stop();
  });

  it('idle has five startup claims and zero steady-state SQL; outer commit publishes, rollback does not wake', async () => {
    await payment.$executeRaw`UPDATE admin_user_projection_sync SET next_run_at=clock_timestamp()+interval '24 hours',phase='READY',source_writers_confirmed_at=clock_timestamp(),source_deployment_revision='isolated'`;
    await post.$executeRaw`UPDATE post_admin_user_projection_sync SET next_run_at=clock_timestamp()+interval '24 hours',phase='READY',source_writers_confirmed_at=clock_timestamp(),source_deployment_revision='isolated'`;
    const gatewaySql = jest.spyOn(gateway, '$queryRaw');
    const paymentSql = jest.spyOn(payment, '$queryRaw');
    const postSql = jest.spyOn(post, '$queryRaw');
    const exporter = { exportPage: jest.fn() };
    const consumer = { isConnected: () => true };
    paymentWorker = new PaymentProfileBootstrapWorker(
      { userProjectionSyncEnabled: true } as PaymentConfig,
      new PaymentProfileBootstrapService(
        new ProjectionBootstrapRepository(payment as PaymentPrismaService),
        exporter,
        consumer,
      ),
    );
    postWorker = new PostProfileBootstrapWorker(
      { userProjectionSyncEnabled: true } as PostConfig,
      new PostProfileBootstrapService(
        new PostProjectionBootstrapRepository(post),
        exporter,
        consumer,
      ),
    );
    revoke.onModuleInit();
    profile.onModuleInit();
    published.onModuleInit();
    paymentWorker.onModuleInit();
    postWorker.onModuleInit();
    await eventually(
      () =>
        gatewaySql.mock.calls.length === 2 &&
        paymentSql.mock.calls.length === 1 &&
        postSql.mock.calls.length === 2,
    );
    const startup = [
      gatewaySql.mock.calls.length,
      paymentSql.mock.calls.length,
      postSql.mock.calls.length,
    ];
    await new Promise<void>((resolve) => setTimeout(resolve, 3200));
    expect([
      gatewaySql.mock.calls.length,
      paymentSql.mock.calls.length,
      postSql.mock.calls.length,
    ]).toEqual(startup);
    expect(exporter.exportPage).not.toHaveBeenCalled();
    gatewaySql.mockRestore();
    paymentSql.mockRestore();
    postSql.mockRestore();

    const manager = new PrismaTransactionManager(gateway);
    const users = new PrismaUsersRepository(gateway);
    const profiles = new ProfileRepository(gateway);
    const user = UserEntity.createNew(`${randomUUID()}@fixture.test`, null);
    const userProfile = ProfileEntity.createNew(user.id, 'wake-fixture');
    const wake = jest.spyOn(profile, 'wake');
    await expect(
      manager.execute(async (tx) => {
        await users.save(user, tx);
        await withGatewayTransaction({
          transaction: tx,
          callback: (nested) => profiles.save(userProfile, nested),
        });
        expect(wake).not.toHaveBeenCalled();
        throw new Error('outer rollback');
      }),
    ).rejects.toThrow('outer rollback');
    expect(wake).not.toHaveBeenCalled();
    expect(await gateway.paymentUserProfileOutbox.count({ where: { userId: user.id } })).toBe(0);
    await manager.execute(async (tx) => {
      await users.save(user, tx);
      await profiles.save(userProfile, tx);
      expect(wake).not.toHaveBeenCalled();
    });
    expect(wake).toHaveBeenCalledTimes(1);
    await eventually(
      async () =>
        (await gateway.paymentUserProfileOutbox.count({
          where: { userId: user.id, publishedAt: { not: null } },
        })) === 2,
    );
    const moderation = new PrismaUserModerationRepository();
    await manager.execute(async (transaction) => {
      await moderation.lockUser({ userId: user.id, transaction });
      await moderation.setDeleted({ userId: user.id, occurredAt: new Date(), transaction });
      await moderation.revokeSessionsAndEnqueue({
        userId: user.id,
        occurredAt: new Date(),
        transaction,
      });
    });
    await eventually(
      async () =>
        (await gateway.userAccessRevokeOutbox.count({
          where: { userId: user.id, publishedAt: { not: null } },
        })) === 1,
    );
    await eventually(
      async () =>
        (await gateway.paymentUserProfileOutbox.count({
          where: { userId: user.id, publishedAt: { not: null } },
        })) === 3,
    );
    const repository = new PostCommandRepository(post);
    const entry = PostEntity.create({ ownerId: randomUUID(), description: '' });
    entry.images = [PostImageEntity.create({ postId: entry.id, fileId: randomUUID(), order: 0 })];
    const postWake = jest.spyOn(published, 'wake');
    await post.$executeRaw`CREATE FUNCTION reject_background_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated outbox failure'; END $$`;
    await post.$executeRaw`CREATE TRIGGER reject_background_outbox BEFORE INSERT ON "PostPublishedOutbox" FOR EACH ROW EXECUTE FUNCTION reject_background_outbox()`;
    await expect(repository.createPost(entry)).rejects.toThrow();
    expect(postWake).not.toHaveBeenCalled();
    expect(await post.post.findUnique({ where: { id: entry.id } })).toBeNull();
    await post.$executeRaw`DROP TRIGGER reject_background_outbox ON "PostPublishedOutbox"`;
    await repository.createPost(entry);
    expect(postWake).toHaveBeenCalledTimes(1);
    await eventually(
      async () =>
        (await post.postPublishedOutbox.count({
          where: { postId: entry.id, publishedAt: { not: null } },
        })) === 1,
    );
    await eventually(() => received.length === 5);
    expect(new Set(received.map((event) => event.eventId)).size).toBe(5);
    wake.mockRestore();
    postWake.mockRestore();
  });

  it('broker failure retains stable event; recovery finds a committed row without a wake', async () => {
    const manager = new PrismaTransactionManager(gateway);
    const users = new PrismaUsersRepository(gateway);
    const publisher = Reflect.get(profile, 'publisher') as PaymentProfileConfirmPublisher;
    let rejectPublish!: (error: Error) => void;
    const pendingPublish = new Promise<void>((_resolve, reject) => {
      rejectPublish = reject;
    });
    const failed = jest.spyOn(publisher, 'publish').mockReturnValueOnce(pendingPublish);
    const user = UserEntity.createNew(`${randomUUID()}@fixture.test`, null);
    await users.save(user);
    // The source call completed while broker confirmation is still pending.
    await eventually(() => failed.mock.calls.length === 1);
    expect(await gateway.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    rejectPublish(new Error('transport fixture'));
    await eventually(
      async () =>
        (await gateway.paymentUserProfileOutbox.findFirst({ where: { userId: user.id } }))
          ?.lastErrorCode === 'PUBLISH_FAILED',
    );
    const original = await gateway.paymentUserProfileOutbox.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(original.publishedAt).toBeNull();
    failed.mockRestore();
    await gateway.paymentUserProfileOutbox.update({
      where: { id: original.id },
      data: { availableAt: new Date() },
    });
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 30001);
    await profile.relay();
    clock.mockRestore();
    expect(
      await gateway.paymentUserProfileOutbox.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({ id: original.id, payload: original.payload, publishedAt: expect.any(Date) });
    await profile.onModuleDestroy();
    const orphan = UserEntity.createNew(`${randomUUID()}@fixture.test`, null);
    await manager.execute((tx) => users.save(orphan, tx)); // Simulated crash window: no listener.
    const recovery = new PaymentUserProfileRelay(gateway, {
      rabbitmqUrl: rabbit.url,
    } as GatewayConfig);
    try {
      recovery.onModuleInit();
      await eventually(
        async () =>
          (await gateway.paymentUserProfileOutbox.count({
            where: { userId: orphan.id, publishedAt: { not: null } },
          })) === 1,
      );
    } finally {
      await recovery.onModuleDestroy();
    }
  });
});
