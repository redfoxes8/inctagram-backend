import { Logger, type INestMicroservice } from '@nestjs/common';
import { loadSync } from '@grpc/proto-loader';
import {
  Server,
  ServerCredentials,
  loadPackageDefinition,
  type ServiceDefinition,
} from '@grpc/grpc-js';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { createIsolatedPaymentDatabase } from './isolated-payment-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import type { PrismaService as PaymentPrismaService } from '../../../micro-payment-service/src/core/prisma/prisma.service';
import type { PrismaClient as PaymentClient } from '../../../micro-payment-service/src/core/prisma/client';
import type { PaymentConfig } from '../../../micro-payment-service/src/core/payment.config';
import { UserGrpcController } from '../../src/modules/users/api/grpc/user.grpc.controller';
import {
  ExportPaymentUserProfilesHandler,
  IPaymentProfileExportQueryRepository,
} from '../../src/modules/users/application/queries/export-payment-user-profiles.query';
import { PaymentProfileExportQueryRepository } from '../../src/modules/users/infrastructure/payment-profile-export.query-repository';
import { PaymentProfileExportClient } from '../../../micro-payment-service/src/modules/payment/infrastructure/grpc/payment-profile-export.client';
import { ProjectionBootstrapRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/projection-bootstrap.repository';
import { PaymentProfileBootstrapService } from '../../../micro-payment-service/src/modules/payment/application/services/payment-profile-bootstrap.service';
import { PaymentProfileBootstrapWorker } from '../../../micro-payment-service/src/modules/payment/infrastructure/schedulers/payment-profile-bootstrap.worker';
import { PaymentUserProfileConsumer } from '../../../micro-payment-service/src/modules/payment/infrastructure/messaging/payment-user-profile.consumer';
import { AdminUserProfileSnapshotRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/admin-user-profile-snapshot.repository';
import type {
  IPaymentProfileExportClient,
  PaymentProfileExportResult,
} from '../../../micro-payment-service/src/modules/payment/application/ports/payment-profile-bootstrap.port';
import {
  normalizePaymentProfileExportPage,
  type PaymentProfileExportPage,
} from '../../../../libs/contracts/src/events/payment-user-profile-export';

const SYNC_ID = 'payment-user-profile-v1';
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('P1d isolated PostgreSQL and real Gateway User gRPC export', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let gateway: PrismaService;
  let payment: PaymentClient;
  let server: INestMicroservice;
  let exporter: PaymentProfileExportClient;
  let repository: ProjectionBootstrapRepository;
  const consumer = { isConnected: (): boolean => true };
  function worker(client: IPaymentProfileExportClient = exporter): PaymentProfileBootstrapService {
    return new PaymentProfileBootstrapService(repository, client, consumer);
  }
  async function markRollout(): Promise<void> {
    await payment.adminUserProjectionSync.update({
      where: { id: SYNC_ID },
      data: {
        sourceWritersConfirmedAt: new Date(),
        sourceDeploymentRevision: 'isolated-all-writers-fixture',
      },
    });
  }
  async function allowAttempt(): Promise<void> {
    await payment.$executeRaw`UPDATE "admin_user_projection_sync" SET "last_batch_at" = clock_timestamp() - interval '2 seconds', "next_run_at" = clock_timestamp() WHERE "id" = ${SYNC_ID}`;
  }
  async function source(count = 1): Promise<void> {
    await gateway.user.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        id: `source-${String(index).padStart(4, '0')}`,
        email: `source-${index}@example.test`,
      })),
    });
  }
  async function page(): Promise<PaymentProfileExportPage> {
    const result = await exporter.exportPage({ limit: 500 });
    if (result.outcome !== 'SUCCESS') throw new Error('Export unavailable');
    return result.page;
  }
  beforeAll(async () => {
    await database.start();
    gateway = database.client();
    payment = createIsolatedPaymentDatabase(database);
    repository = new ProjectionBootstrapRepository(payment as PaymentPrismaService);
    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [UserGrpcController],
      providers: [
        ExportPaymentUserProfilesHandler,
        {
          provide: IPaymentProfileExportQueryRepository,
          useClass: PaymentProfileExportQueryRepository,
        },
        { provide: PrismaService, useValue: gateway },
      ],
    }).compile();
    const port = await unusedPort();
    server = module.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'inctagram.user.v1',
        protoPath: join(process.cwd(), 'libs/contracts/src/proto/user.proto'),
        url: `127.0.0.1:${port}`,
      },
    });
    await server.listen();
    exporter = new PaymentProfileExportClient({
      userProjectionSyncEnabled: true,
      gatewayUserServiceGrpcUrl: `127.0.0.1:${port}`,
    } as PaymentConfig);
  });
  afterAll(async () => {
    exporter?.onModuleDestroy();
    await server?.close();
    await payment?.$disconnect();
    await database.stop();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await gateway.profile.deleteMany();
    await gateway.user.deleteMany();
    await payment.adminUserProfileReadModel.deleteMany();
    await payment.adminUserProjectionSync.deleteMany();
    await payment.adminUserProjectionSync.create({ data: { id: SYNC_ID } });
  });

  it('exports bounded pages including v0, >MAX_SAFE_INTEGER, tombstone, and opaque TEXT IDs', async () => {
    await source(3);
    await gateway.profile.create({ data: { userId: 'source-0000', username: 'export_fixture' } });
    await gateway.user.update({
      where: { id: 'source-0001' },
      data: { deletedAt: new Date(), paymentProfileVersion: 9007199254740993n },
    });
    const first = await exporter.exportPage({ limit: 2 });
    expect(first.outcome).toBe('SUCCESS');
    if (first.outcome !== 'SUCCESS') return;
    expect(first.page).toMatchObject({
      upperUserId: 'source-0002',
      nextAfterUserId: 'source-0001',
      complete: false,
    });
    expect(first.page.items).toEqual([
      {
        userId: 'source-0000',
        sourceVersion: '0',
        profileExists: true,
        username: 'export_fixture',
        isDeleted: false,
      },
      {
        userId: 'source-0001',
        sourceVersion: '9007199254740993',
        profileExists: false,
        username: null,
        isDeleted: true,
      },
    ]);
    const second = await exporter.exportPage({
      limit: 2,
      upperUserId: first.page.upperUserId,
      afterUserId: first.page.nextAfterUserId,
    });
    expect(second).toMatchObject({
      outcome: 'SUCCESS',
      page: { complete: true, nextAfterUserId: 'source-0002', items: [{ userId: 'source-0002' }] },
    });
    expect(await exporter.exportPage({ limit: 2, upperUserId: 'source-0002' })).toMatchObject({
      outcome: 'SUCCESS',
      page: first.page,
    });
    expect(
      await exporter.exportPage({
        limit: 2,
        upperUserId: 'source-0002',
        afterUserId: 'source-0002',
      }),
    ).toMatchObject({ outcome: 'SUCCESS', page: { items: [], complete: true } });
    for (const request of [
      { limit: 0 },
      { limit: 501 },
      { limit: 2, afterUserId: '' },
      { limit: 2, afterUserId: 'a' },
      { limit: 2, upperUserId: 'source-0000', afterUserId: 'source-0002' },
    ]) {
      expect(await exporter.exportPage(request)).toEqual({
        outcome: 'UNAVAILABLE',
        unimplemented: false,
      });
    }
  });

  it('empty source is explicit; READY requires marker and connected existing consumer', async () => {
    await worker().runOnce();
    expect(
      await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'NOT_READY', leaseGeneration: 0n });
    await markRollout();
    jest.spyOn(consumer, 'isConnected').mockReturnValue(false);
    await worker().runOnce();
    expect(
      await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'NOT_READY' });
    jest.restoreAllMocks();
    expect(await page()).toEqual({
      protocolVersion: 1,
      sourceEmpty: true,
      items: [],
      complete: true,
      upperUserId: undefined,
      nextAfterUserId: undefined,
    });
    await worker().runOnce();
    const sync = await payment.adminUserProjectionSync.findUniqueOrThrow({
      where: { id: SYNC_ID },
    });
    expect(sync).toMatchObject({ phase: 'READY', mode: 'IDLE', sourceEmpty: true });
    expect(sync.nextRunAt.getTime() - sync.lastCompletedAt!.getTime()).toBeGreaterThanOrEqual(
      86399990,
    );
  });

  it('commits 500 snapshots/cursor together, globally throttles and resumes in a new service instance', async () => {
    await source(501);
    await markRollout();
    await worker().runOnce();
    expect(await payment.adminUserProfileReadModel.count()).toBe(500);
    const first = await payment.adminUserProjectionSync.findUniqueOrThrow({
      where: { id: SYNC_ID },
    });
    expect(first).toMatchObject({
      phase: 'LOADING',
      mode: 'BOOTSTRAP',
      cursor: 'source-0499',
      upperUserId: 'source-0500',
    });
    // Persisted future clock fixture makes the throttle check independent of machine speed.
    await payment.$executeRaw`UPDATE "admin_user_projection_sync" SET "last_batch_at" = clock_timestamp() + interval '1 hour'`;
    expect(await repository.claim()).toBeNull();
    await allowAttempt();
    await worker().runOnce();
    expect(await payment.adminUserProfileReadModel.count()).toBe(501);
    const final = await payment.adminUserProjectionSync.findUniqueOrThrow({
      where: { id: SYNC_ID },
    });
    expect(final).toMatchObject({
      phase: 'READY',
      mode: 'IDLE',
      cursor: 'source-0500',
      passId: first.passId,
    });
    // Routine reconciliation preserves READY even while the pass is incomplete.
    await allowAttempt();
    await worker().runOnce();
    expect(
      await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'READY', mode: 'RECONCILE' });
  });

  it('live newer version wins over old export; trusted export repairs equal-version corruption', async () => {
    await source(2);
    await markRollout();
    const lease = await repository.claim();
    expect(lease).not.toBeNull();
    const exported = await page();
    await payment.$transaction(async (transaction) => {
      const snapshots = AdminUserProfileSnapshotRepository.forTransaction({
        transaction,
        rootClient: payment,
      });
      await snapshots.apply({
        userId: 'source-0000',
        sourceVersion: '9',
        username: 'live_newer',
        profileExists: true,
        isDeleted: false,
      });
      await snapshots.apply({
        userId: 'source-0001',
        sourceVersion: '0',
        username: 'corrupt_equal',
        profileExists: true,
        isDeleted: false,
      });
    });
    await repository.complete({
      lease: lease!,
      page: exported,
      consumerConnected: consumer.isConnected,
    });
    expect(
      await payment.adminUserProfileReadModel.findUniqueOrThrow({
        where: { userId: 'source-0000' },
      }),
    ).toMatchObject({ sourceVersion: 9n, username: 'live_newer' });
    expect(
      await payment.adminUserProfileReadModel.findUniqueOrThrow({
        where: { userId: 'source-0001' },
      }),
    ).toMatchObject({ sourceVersion: 0n, username: null, profileExists: false });
  });

  it('fences a replaced worker and expires lease during apply: entire page/cursor rolls back', async () => {
    await source();
    await markRollout();
    const claims = await Promise.all([
      repository.claim(),
      new ProjectionBootstrapRepository(payment as PaymentPrismaService).claim(),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const stale = claims.find((lease) => lease !== null)!;
    const exported = await page();
    await payment.$executeRaw`UPDATE "admin_user_projection_sync" SET "lease_until" = clock_timestamp() - interval '1 second', "last_batch_at" = clock_timestamp() - interval '2 seconds'`;
    const replacement = await repository.claim();
    expect(replacement!.generation).toBeGreaterThan(stale.generation);
    await expect(
      repository.complete({
        lease: stale,
        page: exported,
        consumerConnected: consumer.isConnected,
      }),
    ).rejects.toThrow('LEASE_LOST');
    expect(await payment.adminUserProfileReadModel.count()).toBe(0);
    // A controlled DB clock fault inside this transaction exercises the FINAL time check.
    await payment.$executeRawUnsafe(`CREATE FUNCTION fixture_expire_sync_lease() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN UPDATE admin_user_projection_sync SET lease_until = clock_timestamp() - interval '1 second'; RETURN NEW; END $body$`);
    await payment.$executeRawUnsafe(
      `CREATE TRIGGER fixture_expire_sync AFTER INSERT ON admin_user_profile_read_model FOR EACH ROW EXECUTE FUNCTION fixture_expire_sync_lease()`,
    );
    try {
      await expect(
        repository.complete({
          lease: replacement!,
          page: exported,
          consumerConnected: consumer.isConnected,
        }),
      ).rejects.toThrow('LEASE_LOST');
      expect(await payment.adminUserProfileReadModel.count()).toBe(0);
      expect(
        await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } }),
      ).toMatchObject({ cursor: null, phase: 'LOADING' });
    } finally {
      await payment.$executeRawUnsafe(
        'DROP TRIGGER fixture_expire_sync ON admin_user_profile_read_model',
      );
      await payment.$executeRawUnsafe('DROP FUNCTION fixture_expire_sync_lease()');
    }
  });

  it('persisted retry preserves progress; UNIMPLEMENTED waits >=60s, outage backoff <=5min', async () => {
    await source(501);
    await markRollout();
    await worker().runOnce();
    const broken = {
      exportPage: jest
        .fn<Promise<PaymentProfileExportResult>, []>()
        .mockResolvedValue({ outcome: 'UNAVAILABLE', unimplemented: true }),
    };
    await allowAttempt();
    await worker(broken).runOnce();
    let sync = await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } });
    expect(sync).toMatchObject({
      cursor: 'source-0499',
      upperUserId: 'source-0500',
      phase: 'LOADING',
      leaseOwner: null,
    });
    expect(sync.nextRunAt.getTime() - sync.lastBatchAt!.getTime()).toBeGreaterThanOrEqual(60000);
    expect(await repository.claim()).toBeNull();
    broken.exportPage.mockResolvedValue({ outcome: 'UNAVAILABLE', unimplemented: false });
    await allowAttempt();
    await worker(broken).runOnce();
    sync = await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } });
    expect(sync.nextRunAt.getTime() - sync.lastBatchAt!.getTime()).toBeGreaterThanOrEqual(30000);
    expect(sync.nextRunAt.getTime() - sync.lastBatchAt!.getTime()).toBeLessThan(301000);
  });

  it('real transport reports UNIMPLEMENTED from an older server and outage without losing progress', async () => {
    await source();
    await markRollout();
    const definition = loadPackageDefinition(
      loadSync(join(process.cwd(), 'libs/contracts/src/proto/user.proto')),
    ) as unknown as {
      inctagram: { user: { v1: { UserService: { service: ServiceDefinition } } } };
    };
    // Actual gRPC server with no implementation of the newly added method, not Payment MS.
    const older = new Server();
    older.addService(definition.inctagram.user.v1.UserService.service, {});
    const port = await new Promise<number>((resolve, reject) =>
      older.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, bound) =>
        error ? reject(error) : resolve(bound),
      ),
    );
    const client = new PaymentProfileExportClient({
      userProjectionSyncEnabled: true,
      gatewayUserServiceGrpcUrl: `127.0.0.1:${port}`,
    } as PaymentConfig);
    try {
      expect(await client.exportPage({ limit: 500 })).toEqual({
        outcome: 'UNAVAILABLE',
        unimplemented: true,
      });
      await worker(client).runOnce();
      expect(
        await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } }),
      ).toMatchObject({ phase: 'LOADING', cursor: null, upperUserId: null });
      older.forceShutdown();
      expect(await client.exportPage({ limit: 500 })).toEqual({
        outcome: 'UNAVAILABLE',
        unimplemented: false,
      });
    } finally {
      client.onModuleDestroy();
      older.forceShutdown();
    }
  });

  it('a disconnected consumer at commit cannot declare READY or advance snapshots', async () => {
    await source();
    await markRollout();
    const lease = await repository.claim();
    const exported = await page();
    await expect(
      repository.complete({ lease: lease!, page: exported, consumerConnected: () => false }),
    ).rejects.toThrow('CONSUMER_NOT_CONNECTED');
    expect(await payment.adminUserProfileReadModel.count()).toBe(0);
    expect(
      await payment.adminUserProjectionSync.findUniqueOrThrow({ where: { id: SYNC_ID } }),
    ).toMatchObject({ phase: 'LOADING', cursor: null, lastCompletedAt: null });
  });

  it('disabled flag creates no export transport and starts neither worker nor consumer', () => {
    const disabled = { userProjectionSyncEnabled: false } as PaymentConfig;
    const client = new PaymentProfileExportClient(disabled);
    const runner = worker(client);
    const run = jest.spyOn(runner, 'runOnce');
    const background = new PaymentProfileBootstrapWorker(disabled, runner);
    const live = new PaymentUserProfileConsumer(payment as PaymentPrismaService, disabled);
    const connect = jest.spyOn(live, 'connect');
    background.onModuleInit();
    live.onModuleInit();
    expect(run).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    client.onModuleDestroy();
  });

  it('rejects corrupt page metadata/versions before progress writes', () => {
    const request = { limit: 2, upperUserId: 'bound' };
    const base = {
      protocolVersion: 1,
      upperUserId: 'bound',
      sourceEmpty: false,
      items: [],
      complete: true,
    };
    for (const value of [
      { ...base, protocolVersion: 2 },
      { ...base, upperUserId: 'different' },
      { ...base, complete: false },
      {
        ...base,
        items: [
          {
            userId: 'id',
            sourceVersion: '01',
            username: null,
            profileExists: false,
            isDeleted: false,
          },
        ],
        nextAfterUserId: 'id',
      },
    ]) {
      expect(() => normalizePaymentProfileExportPage({ request, value })).toThrow();
    }
  });
});
