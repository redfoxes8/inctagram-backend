import { Logger, type INestMicroservice } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientProxyFactory, Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import {
  Server,
  ServerCredentials,
  loadPackageDefinition,
  type ServiceDefinition,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { PrismaService as GatewayPrismaService } from '../../../main-gateway-service/src/core/prisma/prisma.service';
import { UserGrpcController } from '../../../main-gateway-service/src/modules/users/api/grpc/user.grpc.controller';
import {
  ExportPaymentUserProfilesHandler,
  IPaymentProfileExportQueryRepository,
} from '../../../main-gateway-service/src/modules/users/application/queries/export-payment-user-profiles.query';
import { PaymentProfileExportQueryRepository } from '../../../main-gateway-service/src/modules/users/infrastructure/payment-profile-export.query-repository';
import { createIsolatedPostDatabase } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { PostConfig } from '../../src/core/post.config';
import { PostProfileExportClient } from '../../src/modules/posts/infrastructure/grpc/post-profile-export.client';
import { PostProfileBootstrapService } from '../../src/modules/posts/application/services/post-profile-bootstrap.service';
import { PostProjectionBootstrapRepository } from '../../src/modules/posts/infrastructure/repositories/post-projection-bootstrap.repository';
import { PostAdminUserProfileRepository } from '../../src/modules/posts/infrastructure/repositories/post-admin-user-profile.repository';
import { PostProfileBootstrapWorker } from '../../src/modules/posts/infrastructure/schedulers/post-profile-bootstrap.worker';
import type { PostProfileExport } from '../../src/modules/posts/application/ports/post-profile-bootstrap.port';
import type { PaymentProfileExportPage } from '../../../../libs/contracts/src/events/payment-user-profile-export';

const SYNC_ID = 'post-user-profile-v1';

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing disposable gRPC port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('D2c Post bootstrap with isolated Gateway/Post PostgreSQL and real User gRPC', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  const consumer = { isConnected: (): boolean => true }; // D2b covers the actual Rabbit consumer.
  let gateway: GatewayPrismaService;
  let post: PrismaClient;
  let server: INestMicroservice;
  let exporter: PostProfileExportClient;
  let progress: PostProjectionBootstrapRepository;
  let address: string;

  function config(overrides: Record<string, string> = {}): PostConfig {
    return new PostConfig(
      new ConfigService<Record<string, string>, true>({
        PORT: '3004',
        GRPC_PORT: '50051',
        DATABASE_URL: 'postgresql://127.0.0.1:1/unused_config',
        RABBITMQ_URL: 'amqp://127.0.0.1:1',
        POST_USER_PROJECTION_SYNC_ENABLED: 'true',
        GATEWAY_USER_SERVICE_GRPC_URL: address,
        ...overrides,
      }),
    );
  }
  function bootstrap(client: PostProfileExport = exporter): PostProfileBootstrapService {
    return new PostProfileBootstrapService(progress, client, consumer);
  }
  async function source(count = 1): Promise<void> {
    await gateway.user.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        id: `source-${String(index).padStart(4, '0')}`,
        email: `source-${index}@fixture.test`,
      })),
    });
  }
  async function markRollout(): Promise<void> {
    await post.postAdminUserProjectionSync.update({
      where: { id: SYNC_ID },
      data: {
        sourceWritersConfirmedAt: new Date(),
        sourceDeploymentRevision: 'isolated-all-writers-revision',
      },
    });
  }
  async function allowAttempt(): Promise<void> {
    // Controlled persisted scheduling time; no day-long waits or random race sleeps.
    await post.$executeRaw`UPDATE "post_admin_user_projection_sync"
      SET "last_batch_at"=clock_timestamp()-interval '2 seconds', "next_run_at"=clock_timestamp()
      WHERE "id"=${SYNC_ID}`;
  }
  async function page(): Promise<PaymentProfileExportPage> {
    const result = await exporter.exportPage({ limit: 500 });
    if (result.outcome !== 'SUCCESS') throw new Error('Fixture export unavailable');
    return result.page;
  }
  beforeAll(async () => {
    await database.start();
    gateway = database.client();
    post = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => undefined });
    progress = new PostProjectionBootstrapRepository(post as PrismaService);
    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [UserGrpcController],
      providers: [
        ExportPaymentUserProfilesHandler,
        {
          provide: IPaymentProfileExportQueryRepository,
          useClass: PaymentProfileExportQueryRepository,
        },
        { provide: GatewayPrismaService, useValue: gateway },
      ],
    }).compile();
    address = `127.0.0.1:${await unusedPort()}`;
    server = module.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'inctagram.user.v1',
        protoPath: join(process.cwd(), 'libs/contracts/src/proto/user.proto'),
        url: address,
      },
    });
    await server.listen();
    exporter = new PostProfileExportClient(config());
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await gateway.profile.deleteMany();
    await gateway.user.deleteMany();
    await post.postAdminUserProfile.deleteMany();
    await post.postAdminUserProjectionSync.deleteMany();
    await post.postAdminUserProjectionSync.create({ data: { id: SYNC_ID } });
  });
  afterAll(async () => {
    exporter?.onModuleDestroy();
    await server?.close();
    await post?.$disconnect();
    await database.stop();
  });

  it('exports multiple real pages with v0, exact large versions, tombstone and TEXT IDs', async () => {
    await source(3);
    await gateway.profile.create({ data: { userId: 'source-0000', username: 'real_export_name' } });
    await gateway.user.update({
      where: { id: 'source-0001' },
      data: { deletedAt: new Date(), paymentProfileVersion: 9007199254740993n },
    });
    const first = await exporter.exportPage({ limit: 2 });
    expect(first.outcome).toBe('SUCCESS');
    if (first.outcome !== 'SUCCESS') throw new Error('Expected source page');
    expect(first.page).toMatchObject({
      upperUserId: 'source-0002',
      nextAfterUserId: 'source-0001',
      complete: false,
    });
    expect(first.page.items).toEqual([
      {
        userId: 'source-0000',
        sourceVersion: '0',
        username: 'real_export_name',
        profileExists: true,
        isDeleted: false,
      },
      {
        userId: 'source-0001',
        sourceVersion: '9007199254740993',
        username: null,
        profileExists: false,
        isDeleted: true,
      },
    ]);
    expect(
      await exporter.exportPage({
        limit: 2,
        afterUserId: first.page.nextAfterUserId,
        upperUserId: first.page.upperUserId,
      }),
    ).toMatchObject({
      outcome: 'SUCCESS',
      page: { complete: true, items: [{ userId: 'source-0002', sourceVersion: '0' }] },
    });
  });

  it('does not start without marker/consumer; completes empty source and schedules daily reconciliation', async () => {
    await bootstrap().runOnce();
    expect(
      await post.postAdminUserProjectionSync.findUnique({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'NOT_READY', leaseGeneration: 0n });
    await markRollout();
    jest.spyOn(consumer, 'isConnected').mockReturnValue(false);
    await bootstrap().runOnce();
    expect(
      await post.postAdminUserProjectionSync.findUnique({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'NOT_READY', leaseGeneration: 0n });
    jest.restoreAllMocks();
    expect(await page()).toMatchObject({ sourceEmpty: true, complete: true, items: [] });
    await bootstrap().runOnce();
    const state = await post.postAdminUserProjectionSync.findUniqueOrThrow({
      where: { id: SYNC_ID },
    });
    expect(state).toMatchObject({
      phase: 'READY',
      mode: 'IDLE',
      sourceEmpty: true,
      cursor: null,
      upperUserId: null,
    });
    expect(state.nextRunAt.getTime() - state.lastCompletedAt!.getTime()).toBeGreaterThanOrEqual(
      86399990,
    );
    expect(await progress.claim()).toBeNull();
  });

  it('resumes persisted 500-row progress in a new service and keeps READY through reconciliation', async () => {
    await source(501);
    await markRollout();
    const firstRunner = bootstrap();
    await firstRunner.runOnce();
    const saved = await post.postAdminUserProjectionSync.findUniqueOrThrow({
      where: { id: SYNC_ID },
    });
    expect(saved).toMatchObject({
      phase: 'LOADING',
      mode: 'BOOTSTRAP',
      upperUserId: 'source-0500',
      cursor: 'source-0499',
    });
    expect(await post.postAdminUserProfile.count()).toBe(500);
    firstRunner.stop();
    // Emulate a snapshot already delivered by D2b; this test does not exercise Rabbit again.
    const behind = '00000000-0000-4000-8000-000000000001';
    await gateway.user.create({
      data: { id: behind, email: 'behind-cursor@fixture.test', paymentProfileVersion: 1n },
    });
    await post.$transaction((transaction) =>
      PostAdminUserProfileRepository.forTransaction({ transaction, rootClient: post }).apply({
        userId: behind,
        sourceVersion: '1',
        username: null,
        profileExists: false,
        isDeleted: false,
      }),
    );
    await post.$executeRaw`UPDATE "post_admin_user_projection_sync" SET "last_batch_at"=clock_timestamp() WHERE "id"=${SYNC_ID}`;
    expect(await progress.claim()).toBeNull();
    await allowAttempt();
    await bootstrap().runOnce();
    expect(await post.postAdminUserProfile.count()).toBe(502);
    const complete = await post.postAdminUserProjectionSync.findUniqueOrThrow({
      where: { id: SYNC_ID },
    });
    expect(complete).toMatchObject({
      phase: 'READY',
      cursor: 'source-0500',
      upperUserId: saved.upperUserId,
      passId: saved.passId,
    });
    await allowAttempt();
    const reconcile = await progress.claim();
    expect(reconcile).not.toBeNull();
    expect(
      await post.postAdminUserProjectionSync.findUnique({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'READY', mode: 'RECONCILE' });
    await progress.retry({ lease: reconcile!, delaySeconds: 30 });
  });

  it('preserves newer live/tombstone snapshots and repairs equal-version content only via trusted export', async () => {
    await source(3);
    await markRollout();
    const lease = await progress.claim();
    const exported = await page();
    await post.$transaction(async (transaction) => {
      const profiles = PostAdminUserProfileRepository.forTransaction({
        transaction,
        rootClient: post,
      });
      await profiles.apply({
        userId: 'source-0000',
        sourceVersion: '9',
        username: 'live_newer',
        profileExists: true,
        isDeleted: false,
      });
      await profiles.apply({
        userId: 'source-0001',
        sourceVersion: '0',
        username: 'corrupt_equal',
        profileExists: true,
        isDeleted: false,
      });
      await profiles.apply({
        userId: 'source-0002',
        sourceVersion: '10',
        username: null,
        profileExists: true,
        isDeleted: true,
      });
    });
    await progress.complete({
      lease: lease!,
      page: exported,
      consumerConnected: consumer.isConnected,
    });
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: 'source-0000' } }),
    ).toMatchObject({ sourceVersion: 9n, username: 'live_newer' });
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: 'source-0001' } }),
    ).toMatchObject({ sourceVersion: 0n, username: null, profileExists: false });
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: 'source-0002' } }),
    ).toMatchObject({ sourceVersion: 10n, username: null, isDeleted: true });
  });

  it('fences takeover and expiry during apply, rolling back all snapshots and cursor before READY', async () => {
    await source();
    await markRollout();
    const claims = await Promise.all([
      progress.claim(),
      new PostProjectionBootstrapRepository(post as PrismaService).claim(),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const old = claims.find((claim) => claim !== null)!;
    const exported = await page();
    await post.$executeRaw`UPDATE "post_admin_user_projection_sync" SET "lease_until"=clock_timestamp()-interval '1 second', "last_batch_at"=clock_timestamp()-interval '2 seconds' WHERE "id"=${SYNC_ID}`;
    const replacement = await progress.claim();
    expect(replacement!.generation).toBeGreaterThan(old.generation);
    await expect(
      progress.complete({ lease: old, page: exported, consumerConnected: consumer.isConnected }),
    ).rejects.toThrow('LEASE_LOST');
    // Controlled DB expiry after transaction start: now() would incorrectly keep the lease valid.
    await post.$executeRawUnsafe(`CREATE FUNCTION fixture_expire_post_lease() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN UPDATE post_admin_user_projection_sync SET lease_until = transaction_timestamp() + interval '10 milliseconds';
      PERFORM pg_sleep(0.03); RETURN NEW; END $body$`);
    await post.$executeRawUnsafe(
      'CREATE TRIGGER fixture_expire_post AFTER INSERT ON post_admin_user_profile FOR EACH ROW EXECUTE FUNCTION fixture_expire_post_lease()',
    );
    try {
      await expect(
        progress.complete({
          lease: replacement!,
          page: exported,
          consumerConnected: consumer.isConnected,
        }),
      ).rejects.toThrow('LEASE_LOST');
      expect(await post.postAdminUserProfile.count()).toBe(0);
      expect(
        await post.postAdminUserProjectionSync.findUnique({ where: { id: SYNC_ID } }),
      ).toMatchObject({ phase: 'LOADING', cursor: null, lastCompletedAt: null });
    } finally {
      await post.$executeRawUnsafe('DROP TRIGGER fixture_expire_post ON post_admin_user_profile');
      await post.$executeRawUnsafe('DROP FUNCTION fixture_expire_post_lease()');
    }
    await expect(
      progress.complete({ lease: replacement!, page: exported, consumerConnected: () => false }),
    ).rejects.toThrow('CONSUMER_NOT_CONNECTED');
    expect(await post.postAdminUserProfile.count()).toBe(0);
  });

  it('persists cursor through actual UNIMPLEMENTED/outage and bounded export retry', async () => {
    await source(3);
    await markRollout();
    await post.postAdminUserProjectionSync.update({
      where: { id: SYNC_ID },
      data: {
        phase: 'LOADING',
        mode: 'BOOTSTRAP',
        cursor: 'source-0000',
        upperUserId: 'source-0002',
      },
    });
    const definition = loadPackageDefinition(
      loadSync(join(process.cwd(), 'libs/contracts/src/proto/user.proto')),
    ) as unknown as {
      inctagram: { user: { v1: { UserService: { service: ServiceDefinition } } } };
    };
    const older = new Server();
    older.addService(definition.inctagram.user.v1.UserService.service, {});
    const port = await new Promise<number>((resolve, reject) =>
      older.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, bound) =>
        error ? reject(error) : resolve(bound),
      ),
    );
    const broken = new PostProfileExportClient(
      config({ GATEWAY_USER_SERVICE_GRPC_URL: `127.0.0.1:${port}` }),
    );
    const runner = bootstrap(broken);
    try {
      expect(await broken.exportPage({ limit: 500 })).toEqual({
        outcome: 'UNAVAILABLE',
        unimplemented: true,
      });
      await runner.runOnce();
      let state = await post.postAdminUserProjectionSync.findUniqueOrThrow({
        where: { id: SYNC_ID },
      });
      expect(state).toMatchObject({
        phase: 'LOADING',
        cursor: 'source-0000',
        upperUserId: 'source-0002',
        leaseOwner: null,
      });
      expect(state.nextRunAt.getTime() - state.lastBatchAt!.getTime()).toBeGreaterThanOrEqual(
        60000,
      );
      expect(await progress.claim()).toBeNull();
      older.forceShutdown();
      await allowAttempt();
      await runner.runOnce();
      state = await post.postAdminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } });
      expect(state).toMatchObject({
        cursor: 'source-0000',
        upperUserId: 'source-0002',
        leaseOwner: null,
      });
      const delays = await post.$queryRaw<
        { delay: number }[]
      >`SELECT extract(epoch FROM ("next_run_at"-clock_timestamp()))::double precision AS delay FROM "post_admin_user_projection_sync" WHERE "id"=${SYNC_ID}`;
      expect(delays[0].delay).toBeGreaterThan(29);
      expect(delays[0].delay).toBeLessThanOrEqual(300);
    } finally {
      broken.onModuleDestroy();
      older.forceShutdown();
    }
  });

  it('requires a private address only when enabled, disables the client/worker and stops scheduling on shutdown', async () => {
    const disabled = config({
      POST_USER_PROJECTION_SYNC_ENABLED: 'false',
      GATEWAY_USER_SERVICE_GRPC_URL: '',
    });
    expect(disabled.gatewayUserServiceGrpcUrl).toBeNull();
    expect(() => config({ GATEWAY_USER_SERVICE_GRPC_URL: '' })).toThrow('private host:port');
    expect(() => config({ GATEWAY_USER_SERVICE_GRPC_URL: 'https://public.example:443' })).toThrow(
      'private host:port',
    );
    expect(() => config({ GATEWAY_USER_SERVICE_GRPC_URL: '127.0.0.1:65536' })).toThrow(
      'valid port',
    );
    const create = jest.spyOn(ClientProxyFactory, 'create');
    const client = new PostProfileExportClient(disabled);
    expect(await client.exportPage({ limit: 500 })).toEqual({
      outcome: 'UNAVAILABLE',
      unimplemented: false,
    });
    expect(create).not.toHaveBeenCalled();
    const runner = bootstrap(client);
    const run = jest.spyOn(runner, 'runOnce').mockResolvedValue(undefined);
    const background = new PostProfileBootstrapWorker(disabled, runner);
    background.onModuleInit();
    expect(run).not.toHaveBeenCalled();
    await background.onModuleDestroy();
    jest.useFakeTimers();
    try {
      const activeRunner = bootstrap();
      const activeRun = jest.spyOn(activeRunner, 'runOnce').mockResolvedValue(undefined);
      const active = new PostProfileBootstrapWorker(config(), activeRunner);
      active.onModuleInit();
      await jest.advanceTimersByTimeAsync(1000);
      expect(activeRun).toHaveBeenCalledTimes(1);
      await active.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(10000);
      expect(activeRun).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      client.onModuleDestroy();
    }
  });
});
