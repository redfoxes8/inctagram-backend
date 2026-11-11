import { type INestMicroservice } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { createServer } from 'node:net';
import { of, throwError } from 'rxjs';
import { Kind, validate } from 'graphql';
import { createIsolatedPostDatabase } from '../../../micro-post-service/test/isolated-post-database';
import type { PrismaClient as PostPrisma } from '../../../micro-post-service/src/core/prisma/client';
import type { PrismaService as PostPrismaService } from '../../../micro-post-service/src/core/prisma/prisma.service';
import { SuperadminPostsGrpcController } from '../../../micro-post-service/src/modules/posts/api/superadmin-posts-grpc.controller';
import { GetSuperadminUserPhotosHandler } from '../../../micro-post-service/src/modules/posts/application/queries/get-superadmin-user-photos.query';
import { SuperadminUserPhotosRead } from '../../../micro-post-service/src/modules/posts/application/ports/superadmin-user-photos.port';
import { SuperadminPostFiles } from '../../../micro-post-service/src/modules/posts/application/ports/superadmin-posts-read.port';
import { SuperadminUserPhotosMapper } from '../../../micro-post-service/src/modules/posts/application/mappers/superadmin-user-photos.mapper';
import { SuperadminUserPhotosQueryRepository } from '../../../micro-post-service/src/modules/posts/infrastructure/repositories/superadmin-user-photos.query-repository';
import { FileGrpcClient } from '../../../micro-post-service/src/modules/posts/infrastructure/grpc/file-grpc.client';
import { SuperadminPostFilesAdapter } from '../../../micro-post-service/src/modules/posts/infrastructure/grpc/superadmin-post-files.adapter';
import type { GetFilesDataRequest } from '../../../../libs/contracts/src/generated/file';
import { GatewayConfig } from '../../src/core/gateway.config';
import { PostGrpcClient } from '../../src/modules/posts/infrastructure/post-grpc.client';
import { assertSuperadminBudget } from '../../src/modules/superadmin/api/superadmin-query-budget';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';
import { parse } from 'graphql';
import { JwtService } from '@nestjs/jwt';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchema, printSchema, lexicographicSortSchema } from 'graphql';
import request from 'supertest';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { SuperadminUsersModule } from '../../src/modules/superadmin/superadmin-users.module';
import { SuperadminUserPhotosModule } from '../../src/modules/superadmin/superadmin-user-photos.module';
import { SuperadminModerationModule } from '../../src/modules/superadmin/superadmin-moderation.module';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import { SessionAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/session-admin-principal.verifier';
import {
  AdminClock,
  ADMIN_IDLE_MS,
  ADMIN_ABSOLUTE_MS,
} from '../../src/modules/superadmin/domain/admin-clock';
import { hashAdminToken } from '../../src/modules/superadmin/application/admin-token';
import { SUPERADMIN_RUNTIME_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/runtime-type-defs';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { setupSuperadminHttp } from '../../src/modules/superadmin/api/superadmin-http-security';
import { SUPERADMIN_CONTRACT_VERSION } from '../../../../libs/contracts/src/graphql/superadmin/v1/common-type-defs';

const ORIGIN = 'https://catalogue.example.test';
const PATH = '/api/v1/graphql';
const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const TOKEN = 'c'.repeat(43);
const LIST = `query($input: SuperadminUsersInput!) {
  superadminUsers(input: $input) {
    items { userId username profileUrl createdAt state isEmailConfirmed }
    totalCount pageInfo { page pageSize pagesCount hasNextPage }
  }
}`;

@Module({
  imports: [
    SuperadminModule.withRuntime({
      typeDefs: SUPERADMIN_RUNTIME_TYPE_DEFS,
      production: true,
      imports: [
        SuperadminAuthModule,
        SuperadminUsersModule,
        SuperadminUserPhotosModule,
        SuperadminModerationModule,
      ],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
    }),
  ],
})
class CatalogueFixtureModule {}

describe('U3 GraphQL user photos over isolated Gateway DB and transport double', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  const rpc = jest.fn();
  const PHOTO_QUERY = `query($userId: ID!, $input: PageInput!) { superadminUser(userId: $userId) { chosen: uploadedPhotos(input: $input) { items { imageId postId url } totalCount pageInfo { page pageSize pagesCount hasNextPage } } } }`;
  const imageId = '00000000-0000-4000-8000-000000000001';
  const postId = '00000000-0000-4000-8000-000000000002';

  let prisma: PrismaService;
  let app: INestApplication<Server>;

  function post(input: { query?: string; variables?: object; cookie?: string }): request.Test {
    return request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', input.cookie ?? `superadminSession=${TOKEN}`)
      .send({ query: input.query ?? LIST, variables: input.variables ?? { input: {} } });
  }

  async function fixture(
    input: {
      username?: string;
      id?: string;
      time?: number;
      banned?: boolean;
      confirmed?: boolean;
      deleted?: boolean;
    } = {},
  ): Promise<string> {
    const id = input.id ?? randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `${id}@fixture.test`,
        passwordHash: 'never-return-this-hash',
        isBanned: input.banned ?? false,
        isConfirmed: input.confirmed ?? false,
        createdAt: new Date(input.time ?? NOW),
        deletedAt: input.deleted ? new Date(NOW) : null,
        ...(input.username === undefined
          ? {}
          : {
              profile: {
                create: {
                  username: input.username,
                  avatarUrl: 'https://files.example.test/avatar.jpg',
                },
              },
            }),
      },
    });
    return id;
  }

  beforeAll(async () => {
    await database.start();
    prisma = database.client();
    const module = await Test.createTestingModule({ imports: [CatalogueFixtureModule] })
      .overrideProvider(GatewayConfig)
      .useValue({ postServiceGrpcUrl: '127.0.0.1:9' })
      .overrideProvider(PostGrpcClient)
      .useValue({ getSuperadminUserPhotos: rpc })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(NOW) })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ NODE_ENV: 'test', FRONTEND_URL: 'https://nymbi.org/' }))
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, CatalogueFixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    await app.init();
  });

  beforeEach(async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({
      items: [{ imageId, postId, url: 'https://files.fixture.test/photo' }],
      totalCount: 1,
      page: 1,
      pageSize: 8,
      pagesCount: 1,
      hasNextPage: false,
    });
    await prisma.user.deleteMany();
    await prisma.adminSession.deleteMany();
    await prisma.adminSession.create({
      data: {
        tokenHash: hashAdminToken(TOKEN),
        createdAt: new Date(NOW),
        lastSeenAt: new Date(NOW),
        idleExpiresAt: new Date(NOW + ADMIN_IDLE_MS),
        absoluteExpiresAt: new Date(NOW + ADMIN_ABSOLUTE_MS),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await database.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps parent ID and nullable URL with blocked parent; missing/deleted parent never invokes RPC', async () => {
    const userId = await fixture({ banned: true });
    const response = await post({ query: PHOTO_QUERY, variables: { userId, input: {} } });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.superadminUser.chosen).toEqual({
      items: [{ imageId, postId, url: 'https://files.fixture.test/photo' }],
      totalCount: 1,
      pageInfo: { page: 1, pageSize: 8, pagesCount: 1, hasNextPage: false },
    });
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({ request: { userId, page: 1, pageSize: 8 } }),
    );
    rpc.mockResolvedValueOnce({
      items: [{ imageId, postId }],
      totalCount: 1,
      page: 1,
      pageSize: 8,
      pagesCount: 1,
      hasNextPage: false,
    });
    expect(
      (await post({ query: PHOTO_QUERY, variables: { userId, input: {} } })).body.data
        .superadminUser.chosen.items[0].url,
    ).toBeNull();
    const deleted = await fixture({ deleted: true });
    rpc.mockClear();
    for (const id of [deleted, randomUUID()])
      expect(
        (await post({ query: PHOTO_QUERY, variables: { userId: id, input: {} } })).body.data
          .superadminUser,
      ).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('retains auth/input errors and reports unavailable on the aliased field without payload leaks', async () => {
    const userId = await fixture();
    const unauth = await post({
      query: PHOTO_QUERY,
      variables: { userId, input: {} },
      cookie: 'ordinaryJWT=fixture',
    });
    expect(unauth.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const jwt = new JwtService({ secret: 'u3-fixture-only' }).sign({ sub: userId });
    const ordinaryUser = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${jwt}`)
      .send({ query: PHOTO_QUERY, variables: { userId, input: {} } });
    expect(ordinaryUser.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const invalid = await post({
      query: PHOTO_QUERY,
      variables: { userId, input: { pageSize: 51 } },
    });
    expect(invalid.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(rpc).not.toHaveBeenCalled();
    for (const response of [
      { items: [], totalCount: 1, page: 1, pageSize: 8, pagesCount: 1, hasNextPage: false },
      {
        items: [{ imageId: 'bad', postId, url: 'https://files.fixture.test' }],
        totalCount: 1,
        page: 1,
        pageSize: 8,
        pagesCount: 1,
        hasNextPage: false,
      },
      {
        items: [{ imageId, postId, url: 'javascript:bad' }],
        totalCount: 1,
        page: 1,
        pageSize: 8,
        pagesCount: 1,
        hasNextPage: false,
      },
      { items: [], page: 1, pageSize: 8, pagesCount: 0, hasNextPage: false },
    ]) {
      rpc.mockResolvedValueOnce(response);
      const result = await post({ query: PHOTO_QUERY, variables: { userId, input: {} } });
      expect(result.body.data.superadminUser.chosen).toBeNull();
      expect(result.body.errors[0]).toMatchObject({
        path: ['superadminUser', 'chosen'],
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      });
    }
    rpc.mockRejectedValueOnce(
      new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'private failure',
      }),
    );
    const outage = await post({ query: PHOTO_QUERY, variables: { userId, input: {} } });
    expect(outage.body.errors[0]).toMatchObject({
      path: ['superadminUser', 'chosen'],
      extensions: { code: 'UPSTREAM_UNAVAILABLE' },
    });
    expect(JSON.stringify(outage.body)).not.toContain('private failure');
    rpc.mockRejectedValueOnce(new Error('unexpected fixture bug'));
    const bug = await post({ query: PHOTO_QUERY, variables: { userId, input: {} } });
    expect(bug.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
  });
  it('calculates actual budget for literals, variables, defaults and aliases; runtime SDL matches schema', () => {
    const fields =
      'items { imageId postId url } totalCount pageInfo { page pageSize pagesCount hasNextPage }';
    const query = (input: string): string =>
      `query($userId:ID!, $input:PageInput!) { superadminUser(userId:$userId) { uploadedPhotos(input:${input}) { ${fields} } } }`;
    expect(assertSuperadminBudget({ document: parse(query('{}')) })).toBe(33);
    expect(assertSuperadminBudget({ document: parse(query('{pageSize:50}')) })).toBe(159);
    expect(
      assertSuperadminBudget({
        document: parse(query('$input')),
        variables: { input: { page: 1, pageSize: 50 } },
      }),
    ).toBe(159);
    const aliases = parse(
      `{ superadminUser(userId:"00000000-0000-4000-8000-000000000001") { a:uploadedPhotos(input:{pageSize:50}) { ${fields} } b:uploadedPhotos(input:{pageSize:50}) { ${fields} } } }`,
    );
    expect(() => assertSuperadminBudget({ document: aliases })).toThrow();
    const schema = app.get(GraphQLSchemaHost).schema;
    const artifact = readFileSync(
      join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
      'utf8',
    );
    expect(printSchema(lexicographicSortSchema(schema))).toBe(
      printSchema(lexicographicSortSchema(buildSchema(artifact))),
    );
    expect(SUPERADMIN_CONTRACT_VERSION).toBe('1.7.0');
  });
});

it('uses a 5 second Gateway timeout and cancels the pending RPC without retry', async () => {
  jest.useFakeTimers();
  let cancelled = false;
  const rpc = jest.fn(
    () =>
      new Observable(() => () => {
        cancelled = true;
      }),
  );
  const client = new PostGrpcClient({
    getService: () => ({ getSuperadminUserPhotos: rpc }),
  } as unknown as ClientGrpc);
  client.onModuleInit();
  try {
    const result = client
      .getSuperadminUserPhotos({
        request: { userId: randomUUID(), page: 1, pageSize: 8 },
        signal: new AbortController().signal,
      })
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(4999);
    expect(cancelled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ code: DomainExceptionCode.ServiceUnavailable });
    expect(cancelled).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

describe('U4 connected HTTP GraphQL to real Post gRPC and isolated DBs', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let gateway: PrismaService;
  let postDb: PostPrisma;
  let postServer: INestMicroservice;
  let app: INestApplication<Server>;
  const fileRpc = jest.fn();
  async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing local port');
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    return address.port;
  }
  beforeAll(async () => {
    await database.start();
    gateway = database.client();
    postDb = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => undefined });
    const fileClient = new FileGrpcClient({
      getService: () => ({ getFilesData: fileRpc }),
    } as unknown as ClientGrpc);
    const postModule = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [SuperadminPostsGrpcController],
      providers: [
        GetSuperadminUserPhotosHandler,
        SuperadminUserPhotosMapper,
        {
          provide: SuperadminUserPhotosRead,
          useValue: new SuperadminUserPhotosQueryRepository(postDb as PostPrismaService),
        },
        { provide: SuperadminPostFiles, useValue: new SuperadminPostFilesAdapter(fileClient) },
      ],
    }).compile();
    const address = `127.0.0.1:${await freePort()}`;
    postServer = postModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'inctagram.post.v1',
        protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
        url: address,
      },
    });
    await postServer.listen();
    const gatewayModule = await Test.createTestingModule({ imports: [CatalogueFixtureModule] })
      .overrideProvider(GatewayConfig)
      .useValue({ postServiceGrpcUrl: address })
      .overrideProvider(PrismaService)
      .useValue(gateway)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(NOW) })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ NODE_ENV: 'test', FRONTEND_URL: 'https://nymbi.org' }))
      .compile();
    app = gatewayModule.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, CatalogueFixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await postServer?.close();
    await postDb?.$disconnect();
    await database.stop();
  });
  it('paginates selected photos and propagates File failure through the real chain', async () => {
    const owner = randomUUID();
    const other = randomUUID();
    const missing = randomUUID();
    await gateway.user.create({ data: { id: owner, email: `${owner}@fixture.test` } });
    await gateway.adminSession.create({
      data: {
        tokenHash: hashAdminToken(TOKEN),
        createdAt: new Date(NOW),
        lastSeenAt: new Date(NOW),
        idleExpiresAt: new Date(NOW + ADMIN_IDLE_MS),
        absoluteExpiresAt: new Date(NOW + ADMIN_ABSOLUTE_MS),
      },
    });
    const timestamp = new Date('2026-10-26T12:00:00Z');
    const upper = '00000000-0000-4000-8000-000000000002';
    const lower = '00000000-0000-4000-8000-000000000001';
    const images = [randomUUID(), missing, randomUUID()].map((fileId, order) => ({
      fileId,
      order,
    }));
    const multi = await postDb.post.create({
      data: {
        id: upper,
        ownerId: owner,
        description: '',
        createdAt: timestamp,
        images: { create: images },
      },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    const single = await postDb.post.create({
      data: {
        id: lower,
        ownerId: owner,
        description: '',
        createdAt: timestamp,
        images: { create: { fileId: randomUUID(), order: 0 } },
      },
      include: { images: true },
    });
    await postDb.post.create({
      data: {
        ownerId: owner,
        description: '',
        deletedAt: timestamp,
        images: { create: { fileId: randomUUID(), order: 0 } },
      },
    });
    await postDb.post.create({
      data: {
        ownerId: other,
        description: '',
        images: { create: { fileId: randomUUID(), order: 0 } },
      },
    });
    fileRpc.mockImplementation((input: GetFilesDataRequest) =>
      of({
        files: Object.fromEntries(
          input.fileIds
            .filter((id) => id !== missing)
            .map((fileId) => [fileId, { fileId, fileUrl: `https://files.fixture.test/${fileId}` }]),
        ),
      }),
    );
    const query = `query($userId:ID!, $input:PageInput!){superadminUser(userId:$userId){photos:uploadedPhotos(input:$input){items{imageId postId url} totalCount pageInfo{page pageSize pagesCount hasNextPage}}}}`;
    const get = (page: number): request.Test =>
      request(app.getHttpServer())
        .post(PATH)
        .set('Origin', ORIGIN)
        .set('Cookie', `superadminSession=${TOKEN}`)
        .send({ query, variables: { userId: owner, input: { page, pageSize: 2 } } });
    const first = await get(1);
    const second = await get(2);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    const firstPage = first.body.data.superadminUser.photos;
    const secondPage = second.body.data.superadminUser.photos;
    expect(firstPage.items.map((item: { imageId: string }) => item.imageId)).toEqual([
      multi.images[0].id,
      multi.images[1].id,
    ]);
    expect(secondPage.items.map((item: { imageId: string }) => item.imageId)).toEqual([
      multi.images[2].id,
      single.images[0].id,
    ]);
    expect(
      new Set(
        [...firstPage.items, ...secondPage.items].map((item: { imageId: string }) => item.imageId),
      ).size,
    ).toBe(4);
    expect(firstPage.items[1]).toMatchObject({ postId: upper, url: null });
    expect(firstPage).toMatchObject({
      totalCount: 4,
      pageInfo: { page: 1, pageSize: 2, pagesCount: 2, hasNextPage: true },
    });
    expect(secondPage).toMatchObject({
      totalCount: 4,
      pageInfo: { page: 2, pageSize: 2, pagesCount: 2, hasNextPage: false },
    });
    expect(fileRpc).toHaveBeenCalledTimes(2);
    fileRpc.mockImplementationOnce(() =>
      throwError(() => new Error('private file transport detail')),
    );
    const outage = await get(1);
    expect(outage.body.data.superadminUser.photos).toBeNull();
    expect(outage.body.errors[0]).toMatchObject({
      path: ['superadminUser', 'photos'],
      extensions: { code: 'UPSTREAM_UNAVAILABLE' },
    });
    expect(JSON.stringify(outage.body)).not.toContain('private file transport detail');
  });
  it('validates every GraphQL guide operation against the actual runtime SDL', () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    const artifact = readFileSync(
      join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
      'utf8',
    );
    expect(printSchema(lexicographicSortSchema(schema))).toBe(
      printSchema(lexicographicSortSchema(buildSchema(artifact))),
    );
    const guide = readFileSync(join(process.cwd(), 'GRAPHQL_SUPERADMIN_FRONTEND_API.md'), 'utf8');
    let count = 0;
    let photos = false;
    for (const match of guide.matchAll(/```graphql\s*\n([\s\S]*?)```/g)) {
      const document = parse(match[1]);
      if (
        document.definitions.some((definition) => definition.kind === Kind.OPERATION_DEFINITION)
      ) {
        expect(validate(schema, document)).toEqual([]);
        count++;
        if (match[1].includes('uploadedPhotos')) photos = true;
      }
    }
    expect(count).toBeGreaterThanOrEqual(9);
    expect(photos).toBe(true);
    expect(SUPERADMIN_CONTRACT_VERSION).toBe('1.7.0');
  });
});
