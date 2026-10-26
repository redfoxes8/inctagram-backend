import { Module, type INestApplication, type INestMicroservice, Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { Transport, type MicroserviceOptions, type ClientGrpc } from '@nestjs/microservices';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { of, Observable } from 'rxjs';
import { buildSchema, parse, validate, Kind, printSchema, lexicographicSortSchema } from 'graphql';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { IsolatedRabbit } from './isolated-rabbit';
import { createIsolatedPostDatabase } from '../../../micro-post-service/test/isolated-post-database';
import type { PrismaClient as PostPrisma } from '../../../micro-post-service/src/core/prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { PrismaService as PostPrismaService } from '../../../micro-post-service/src/core/prisma/prisma.service';
import { GatewayConfig } from '../../src/core/gateway.config';
import { PostConfig } from '../../../micro-post-service/src/core/post.config';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { SuperadminPostsDeliveryModule } from '../../src/modules/superadmin/superadmin-posts-delivery.module';
import { SessionAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/session-admin-principal.verifier';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import { PostGrpcClient } from '../../src/modules/posts/infrastructure/post-grpc.client';
import { GrpcSuperadminPostsReader } from '../../src/modules/superadmin/infrastructure/grpc-superadmin-posts.reader';
import { SUPERADMIN_RUNTIME_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/runtime-type-defs';
import { SUPERADMIN_CONTRACT_VERSION } from '../../../../libs/contracts/src/graphql/superadmin/v1/common-type-defs';
import { setupSuperadminHttp } from '../../src/modules/superadmin/api/superadmin-http-security';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { SuperadminPostsGrpcController } from '../../../micro-post-service/src/modules/posts/api/superadmin-posts-grpc.controller';
import { PostsController } from '../../../micro-post-service/src/modules/posts/api/posts.controller';
import { GetSuperadminPostsPageHandler } from '../../../micro-post-service/src/modules/posts/application/queries/get-superadmin-posts-page.query';
import { GetSuperadminPostPublishedViewHandler } from '../../../micro-post-service/src/modules/posts/application/queries/get-superadmin-post-published-view.query';
import {
  SuperadminPostsRead,
  SuperadminPostFiles,
} from '../../../micro-post-service/src/modules/posts/application/ports/superadmin-posts-read.port';
import { SuperadminPostsQueryRepository } from '../../../micro-post-service/src/modules/posts/infrastructure/repositories/superadmin-posts.query-repository';
import { SuperadminPostImagesMapper } from '../../../micro-post-service/src/modules/posts/application/mappers/superadmin-post-images.mapper';
import { SuperadminPostFilesAdapter } from '../../../micro-post-service/src/modules/posts/infrastructure/grpc/superadmin-post-files.adapter';
import { FileGrpcClient } from '../../../micro-post-service/src/modules/posts/infrastructure/grpc/file-grpc.client';
import { CreatePostHandler } from '../../../micro-post-service/src/modules/posts/application/commands/create-post.handler';
import { CreatePostCommand } from '../../../micro-post-service/src/modules/posts/application/commands/create-post.command';
import { PostCommandRepository } from '../../../micro-post-service/src/modules/posts/infrastructure/repositories/post.command-repository';
import { PostPublishedRelay } from '../../../micro-post-service/src/modules/posts/infrastructure/post-published.relay';
import { FileStatus } from '../../../../libs/contracts/src/generated/file';
import type { PostServiceClient } from '../../../../libs/contracts/src/generated/post';

const ORIGIN = 'https://posts-admin.example.test';
const PATH = '/api/v1/graphql';
const FIELDS = 'postId userId username description publishedAt images {fileId url order}';
const PAGE = `query Posts($input:SuperadminPostsInput!){feed:superadminPosts(input:$input){items{${FIELDS}} pageInfo{endCursor hasNextPage}}}`;
const SUB = `subscription Posts($input:SuperadminPostPublishedInput!){superadminPostPublished(input:$input){kind post{${FIELDS}}}}`;

@Module({
  imports: [
    SuperadminModule.withRuntime({
      typeDefs: SUPERADMIN_RUNTIME_TYPE_DEFS,
      production: true,
      imports: [SuperadminAuthModule, SuperadminPostsDeliveryModule],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
      subscriptions: { allowedOrigins: [ORIGIN], fields: ['superadminPostPublished'] },
    }),
  ],
})
class GatewayFixture {}

type EventMessage = {
  type: string;
  payload?: {
    data?: {
      superadminPostPublished: {
        kind: string;
        post: { postId: string; userId: string; username: string | null } | null;
      };
    };
    extensions?: object;
  };
};
class Peer {
  private readonly messages: EventMessage[] = [];
  private pending: ((message: EventMessage) => void) | null = null;
  readonly closed: Promise<number>;
  constructor(readonly socket: WebSocket) {
    socket.on('error', () => {});
    socket.on('message', (data) => {
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data);
      const message = JSON.parse(bytes.toString('utf8')) as EventMessage;
      if (this.pending) {
        const resolve = this.pending;
        this.pending = null;
        resolve(message);
      } else this.messages.push(message);
    });
    this.closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
  }
  send(value: object): void {
    this.socket.send(JSON.stringify(value));
  }
  next(): Promise<EventMessage> {
    const message = this.messages.shift();
    if (message) return Promise.resolve(message);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('Posts WS fixture deadline'));
      }, 10000);
      this.pending = (value): void => {
        clearTimeout(timer);
        resolve(value);
      };
    });
  }
  async stop(): Promise<void> {
    this.socket.close();
    await this.closed;
  }
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture port missing');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

describe('D6b actual GraphQL HTTP/WS -> Post gRPC -> isolated Post DB and published relay/Rabbit', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  const rabbit = new IsolatedRabbit();
  let prisma: PrismaService;
  let post: PostPrisma;
  let postModule: TestingModule;
  let microservice: INestMicroservice;
  let app: INestApplication<Server>;
  let relay: PostPublishedRelay;
  let create: CreatePostHandler;
  let cookie: string;
  let baseUrl: string;
  let author: string;
  const peers: Peer[] = [];
  const fileStatus = jest.fn(() => of({ file: { ownerId: author, status: FileStatus.UPLOADED } }));
  const fileData = jest.fn((input: { fileIds: string[] }) =>
    of({
      files: Object.fromEntries(
        input.fileIds
          .slice(1)
          .map((id) => [id, { fileId: id, fileUrl: `https://files.fixture.test/${id}` }]),
      ),
    }),
  );

  async function publishPost(): Promise<string> {
    return create.execute(
      new CreatePostCommand({
        ownerId: author,
        description: '',
        images: [{ fileId: randomUUID() }, { fileId: randomUUID() }],
      }),
    );
  }
  function page(input: object = {}): request.Test {
    return request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ query: PAGE, variables: { input } });
  }
  async function open(
    input: { noCookie?: boolean; search?: string; query?: string } = {},
  ): Promise<Peer> {
    const socket = new WebSocket(baseUrl.replace('http:', 'ws:') + PATH, 'graphql-transport-ws', {
      headers: { Origin: ORIGIN, ...(input.noCookie ? {} : { Cookie: cookie }) },
    });
    const peer = new Peer(socket);
    peers.push(peer);
    await once(socket, 'open');
    peer.send({ type: 'connection_init' });
    if (!input.noCookie) {
      expect(await peer.next()).toEqual({ type: 'connection_ack' });
      peer.send({
        id: 'posts',
        type: 'subscribe',
        payload: {
          query: input.query ?? SUB,
          variables: { input: { searchUsername: input.search } },
        },
      });
    }
    return peer;
  }
  async function ready(input: { search?: string } = {}): Promise<Peer> {
    const peer = await open(input);
    expect(await peer.next()).toMatchObject({
      type: 'next',
      payload: { data: { superadminPostPublished: { kind: 'READY', post: null } } },
    });
    return peer;
  }
  beforeAll(async () => {
    await database.start();
    prisma = database.client();
    post = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => {} });
    await rabbit.start();
    await rabbit.connection();
    const address = `127.0.0.1:${await freePort()}`;
    const config = new PostConfig(
      new ConfigService({
        PORT: '3004',
        GRPC_PORT: '50051',
        DATABASE_URL: 'isolated-config-only',
        RABBITMQ_URL: rabbit.url,
        POST_USER_PROJECTION_SYNC_ENABLED: 'true',
        GATEWAY_USER_SERVICE_GRPC_URL: '127.0.0.1:9',
      }),
    );
    const fileClient = {
      getService: () => ({ getFilesData: fileData, getFileStatus: fileStatus }),
    } as unknown as ClientGrpc;
    postModule = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [SuperadminPostsGrpcController, PostsController],
      providers: [
        GetSuperadminPostsPageHandler,
        GetSuperadminPostPublishedViewHandler,
        CreatePostHandler,
        PostCommandRepository,
        SuperadminPostImagesMapper,
        { provide: PostPrismaService, useValue: post },
        { provide: PostConfig, useValue: config },
        { provide: SuperadminPostsRead, useClass: SuperadminPostsQueryRepository },
        { provide: SuperadminPostFiles, useClass: SuperadminPostFilesAdapter },
        { provide: FileGrpcClient, useValue: new FileGrpcClient(fileClient) },
        { provide: 'FILE_SERVICE_PACKAGE', useValue: fileClient },
      ],
    }).compile();
    microservice = postModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'inctagram.post.v1',
        protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
        url: address,
      },
    });
    await microservice.listen();
    create = postModule.get(CreatePostHandler);
    relay = new PostPublishedRelay(post as PostPrismaService, config);
    const passwordHash = await bcrypt.hash('fixture-only', 10);
    const module = await Test.createTestingModule({ imports: [GatewayFixture] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(GatewayConfig)
      .useValue({ postServiceGrpcUrl: address, rabbitmqUrl: rabbit.url })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          NODE_ENV: 'test',
          SUPERADMIN_EMAIL: 'posts@example.test',
          SUPERADMIN_PASSWORD_HASH: passwordHash,
        }),
      )
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, GatewayFixture, {
      httpConfig: { enabled: true, enableCookies: true, enableGlobalPrefix: true },
    });
    await app.listen(0, '127.0.0.1');
    const location = app.getHttpServer().address();
    if (!location || typeof location === 'string') throw new Error('Missing HTTP fixture port');
    baseUrl = `http://127.0.0.1:${location.port}`;
  });
  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    await post.postPublishedOutbox.deleteMany();
    await post.post.deleteMany();
    await post.postAdminUserProfile.deleteMany();
    await post.postAdminUserProjectionSync.update({
      where: { id: 'post-user-profile-v1' },
      data: { phase: 'READY', mode: 'IDLE' },
    }); // Fixture, not bootstrap/rollout proof.
    await prisma.adminSession.deleteMany();
    await prisma.adminLoginRateLimit.deleteMany();
    const login = await request(app.getHttpServer()).post(PATH).set('Origin', ORIGIN).send({
      query:
        'mutation {superadminLogin(input:{email:"posts@example.test",password:"fixture-only"}){authenticated}}',
    });
    expect(login.body.errors).toBeUndefined();
    cookie = (login.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    author = randomUUID();
    await prisma.user.create({ data: { id: author, email: `${author}@fixture.test` } });
    await post.postAdminUserProfile.create({
      data: {
        userId: author,
        sourceVersion: 9007199254740993n,
        username: 'Target_%_name',
        profileExists: true,
        isDeleted: false,
      },
    });
  });
  afterEach(async () => {
    await Promise.all(peers.splice(0).map((peer) => peer.stop()));
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await relay?.onModuleDestroy();
    await app?.close();
    await microservice?.close();
    await post?.$disconnect();
    await rabbit.stop();
    await database.stop();
  });

  it('reads real posts through HTTP/gRPC with search, default/full-page cursor, nullable files, auth and runtime/guide validation', async () => {
    for (let index = 0; index < 6; index++) await publishPost();
    const first = await page({ searchUsername: ' TARGET_% ' });
    expect(first.body.errors).toBeUndefined();
    expect(first.body.data.feed.items).toHaveLength(4);
    expect(first.body.data.feed.items[0]).toMatchObject({
      description: '',
      username: 'Target_%_name',
      images: [
        { order: 0, url: null },
        { order: 1, url: expect.stringContaining('files.fixture.test') },
      ],
    });
    const second = await page({
      searchUsername: 'TARGET_%',
      after: first.body.data.feed.pageInfo.endCursor,
    });
    expect(second.body.errors).toBeUndefined();
    expect(second.body.data.feed.items).toHaveLength(2);
    expect(
      new Set(
        [...first.body.data.feed.items, ...second.body.data.feed.items].map(
          (item: { postId: string }) => item.postId,
        ),
      ).size,
    ).toBe(6);
    expect(second.body.data.feed.pageInfo.hasNextPage).toBe(false);
    expect((await page({ first: 5 })).body.data.feed.items).toHaveLength(5);
    expect((await page({ first: 6 })).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const denied = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .send({ query: PAGE, variables: { input: {} } });
    expect(denied.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const noCookie = await open({ noCookie: true });
    expect(await noCookie.closed).toBe(4401);
    const schema = app.get(GraphQLSchemaHost).schema;
    if (process.env.UPDATE_SUPERADMIN_RUNTIME === 'true')
      writeFileSync(
        join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
        printSchema(lexicographicSortSchema(schema)) + '\n',
      );
    expect(SUPERADMIN_CONTRACT_VERSION).toBe('1.6.0');
    expect(printSchema(lexicographicSortSchema(schema))).toBe(
      printSchema(
        lexicographicSortSchema(
          buildSchema(
            readFileSync(
              join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
              'utf8',
            ),
          ),
        ),
      ),
    );
    const guide = readFileSync(join(process.cwd(), 'GRAPHQL_SUPERADMIN_FRONTEND_API.md'), 'utf8');
    for (const match of [
      ...guide.matchAll(/```graphql\s*\n([\s\S]*?)```/g),
      ...guide.matchAll(/\bgql`([\s\S]*?)`/g),
    ]) {
      const doc = parse(match[1]);
      if (doc.definitions.some((node) => node.kind === Kind.OPERATION_DEFINITION)) {
        expect(validate(schema, doc)).toEqual([]);
        expect(
          validate(
            buildSchema(
              readFileSync(
                join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/target.graphql'),
                'utf8',
              ),
            ),
            doc,
          ),
        ).toEqual([]);
      }
    }
  });

  it('delivers READY -> actual create/outbox/relay/Rabbit -> event, same search, reconnect/refetch merge, real missing author confirmation', async () => {
    const peer = await ready({ search: 'TARGET_%' });
    const id = await publishPost();
    await relay.relay();
    const delivery = await peer.next();
    expect(delivery).toMatchObject({
      type: 'next',
      payload: {
        data: { superadminPostPublished: { kind: 'POST_PUBLISHED', post: { postId: id } } },
      },
    });
    const current = await page({ searchUsername: 'TARGET_%' });
    expect(current.body.data.feed.items[0].postId).toBe(id);
    const merged = new Map<string, object>();
    merged.set(id, delivery.payload!.data!.superadminPostPublished.post!);
    for (const item of current.body.data.feed.items as { postId: string }[])
      merged.set(item.postId, item);
    expect(merged.size).toBe(1);
    await peer.stop();
    const offlineId = await publishPost();
    await relay.relay();
    const reconnected = await ready();
    const head = await page();
    for (const item of head.body.data.feed.items as { postId: string }[])
      merged.set(item.postId, item);
    expect(merged.size).toBe(2);
    expect(merged.has(offlineId)).toBe(true);
    const client = app.get(PostGrpcClient);
    const calls = jest.spyOn(client, 'getSuperadminPostPublishedView');
    const aliased = await open({
      query: SUB.replace('superadminPostPublished(', 'aliased:superadminPostPublished('),
    });
    expect(await aliased.next()).toMatchObject({
      payload: { data: { aliased: { kind: 'READY', post: null } } },
    });
    author = randomUUID(); // Deliberately absent from Gateway User and Post projection.
    const orphan = await publishPost();
    await relay.relay();
    expect(await reconnected.next()).toMatchObject({
      payload: {
        data: {
          superadminPostPublished: { post: { postId: orphan, userId: author, username: null } },
        },
      },
    });
    expect(await aliased.next()).toMatchObject({
      payload: { data: { aliased: { post: { postId: orphan, userId: author, username: null } } } },
    });
    expect(calls).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          postId: orphan,
          authorMissingConfirmed: true,
          authorUserId: author,
        }),
      }),
    );
  });

  it('initial NOT_READY gives no READY, malformed response/outage/timeout are safe, unexpected client bug stays INTERNAL', async () => {
    await post.postAdminUserProjectionSync.update({
      where: { id: 'post-user-profile-v1' },
      data: { phase: 'NOT_READY' },
    });
    const notReady = await page();
    expect(notReady.body.data.feed).toBeNull();
    expect(notReady.body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
    const peer = await open();
    expect(await peer.next()).toMatchObject({
      type: 'next',
      payload: { errors: [{ extensions: { code: 'UPSTREAM_UNAVAILABLE' } }] },
    });
    expect(await peer.next()).toMatchObject({ type: 'complete' }); // No READY; GraphQL subscribe initial failure result.
    await post.postAdminUserProjectionSync.update({
      where: { id: 'post-user-profile-v1' },
      data: { phase: 'READY' },
    });
    const client = app.get(PostGrpcClient);
    const postId = await publishPost();
    const validView = await client.getSuperadminPostPublishedView({
      request: { postId, authorMissingConfirmed: false },
      signal: new AbortController().signal,
    });
    const forgedConfirmation = jest
      .spyOn(client, 'getSuperadminPostPublishedView')
      .mockResolvedValue(validView);
    const reader = app.get(GrpcSuperadminPostsReader);
    const untrusted = reader.readPublishedView({
      postId,
      authorMissingConfirmed: true,
      authorUserId: 'another-source-user',
      signal: new AbortController().signal,
    });
    await expect(untrusted).rejects.toMatchObject({ code: 503 });
    forgedConfirmation.mockRestore();
    const malformed = jest
      .spyOn(client, 'getSuperadminPostsPage')
      .mockResolvedValue({ items: [], pageInfo: { hasNextPage: true } });
    expect((await page()).body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
    malformed.mockRestore();
    const crash = jest
      .spyOn(client, 'getSuperadminPostsPage')
      .mockRejectedValue(new TypeError('private implementation detail'));
    expect((await page()).body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    crash.mockRestore();
    let cancelled = false;
    const service = Reflect.get(client, 'postService') as PostServiceClient;
    const never = jest.spyOn(service, 'getSuperadminPostsPage').mockReturnValue(
      new Observable(() => (): void => {
        cancelled = true;
      }),
    );
    expect((await page()).body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(cancelled).toBe(true);
    never.mockRestore();
    await microservice.close();
    const outage = await page();
    expect(outage.body.data.feed).toBeNull();
    expect(outage.body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
    const json = JSON.stringify(outage.body);
    expect(json).not.toContain('stack');
    expect(json).not.toContain('private implementation detail');
  });
});
