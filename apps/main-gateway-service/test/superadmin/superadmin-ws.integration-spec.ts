import { Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Context, Query, ResolveField, Resolver, Subscription } from '@nestjs/graphql';
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { WebSocket, type WebSocketServer } from 'ws';
import { io } from 'socket.io-client';
import { parse } from 'graphql';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import { AdminClock } from '../../src/modules/superadmin/domain/admin-clock';
import { AdminSessionRepository } from '../../src/modules/superadmin/domain/admin-session.repository';
import { SessionAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/session-admin-principal.verifier';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { GatewayConfig } from '../../src/core/gateway.config';
import { NotificationSocketIoAdapter } from '../../src/core/notification-socket-io.adapter';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { SUPERADMIN_AUTH_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/auth-type-defs';
import { setupSuperadminHttp } from '../../src/modules/superadmin/api/superadmin-http-security';
import { assertSuperadminBudget } from '../../src/modules/superadmin/api/superadmin-query-budget';
import {
  SUPERADMIN_WS_LIMITS,
  SuperadminSubscriptionServer,
} from '../../src/modules/superadmin/api/superadmin-subscription-server';
import type { SuperadminContext } from '../../src/modules/superadmin/api/superadmin-context';

const ORIGIN = 'https://admin.example.test';
const PATH = '/api/v1/graphql';
const streams = new Set<ProbeStream>();
type Message = { type: string; id?: string; payload?: unknown };

// Test-only cancellable iterator. No production subscription root/buffer is published in D5.
class ProbeStream implements AsyncIterableIterator<object> {
  private values: object[] = [{ probeEvents: {} }];
  private pending: ((value: IteratorResult<object>) => void) | null = null;
  private done = false;
  private resolveReturn!: () => void;
  readonly returned = new Promise<void>((resolve) => {
    this.resolveReturn = resolve;
  });
  constructor() {
    streams.add(this);
  }
  [Symbol.asyncIterator](): AsyncIterableIterator<object> {
    return this;
  }
  next(): Promise<IteratorResult<object>> {
    if (this.done) return Promise.resolve({ done: true, value: undefined });
    const value = this.values.shift();
    if (value) return Promise.resolve({ done: false, value });
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }
  emit(): void {
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ done: false, value: { probeEvents: {} } });
    } else this.values.push({ probeEvents: {} });
  }
  return(): Promise<IteratorResult<object>> {
    this.done = true;
    this.values = [];
    this.pending?.({ done: true, value: undefined });
    this.pending = null;
    streams.delete(this);
    this.resolveReturn();
    return Promise.resolve({ done: true, value: undefined });
  }
}

@Resolver()
class ProbeResolver {
  @Query('probe') probe(): string {
    return 'http-preserved';
  }
  @Subscription('probeEvents', {
    resolve: (value: { probeEvents: object }): object => value.probeEvents,
  })
  events(): AsyncIterableIterator<object> {
    return new ProbeStream();
  }
}
@Resolver('Probe')
class ProbeFields {
  @ResolveField('secret') secret(@Context() context: SuperadminContext): string {
    if (context.transport !== 'ws' || 'res' in context || !context.principal)
      throw new Error('Bad WS context');
    return 'protected';
  }
  @ResolveField('child') child(): object {
    return {};
  }
}
@WebSocketGateway({ transports: ['websocket'] })
class SocketFixture {
  @SubscribeMessage('probe') probe(): string {
    return 'socket-preserved';
  }
}
@Module({
  imports: [
    SuperadminModule.withRuntime({
      typeDefs: `${SUPERADMIN_AUTH_TYPE_DEFS}
      extend type Query { probe: String }
      type Probe { secret: String, child: Probe }
      type Subscription { probeEvents(seed: Int): Probe, restrictedEvents: Probe }
    `,
      production: true,
      imports: [SuperadminAuthModule],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
      subscriptions: { allowedOrigins: [ORIGIN], fields: ['probeEvents'] },
    }),
  ],
  providers: [ProbeResolver, ProbeFields, SocketFixture],
})
class FixtureModule {}

class Peer {
  readonly messages: Message[] = [];
  private pending: ((message: Message) => void) | null = null;
  readonly closed: Promise<number>;
  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      let bytes: Buffer;
      if (Array.isArray(data)) bytes = Buffer.concat(data);
      else if (Buffer.isBuffer(data)) bytes = data;
      else bytes = Buffer.from(data);
      const message = JSON.parse(bytes.toString('utf8')) as Message;
      if (this.pending) {
        const resolve = this.pending;
        this.pending = null;
        resolve(message);
      } else this.messages.push(message);
    });
    socket.on('error', () => {});
    this.closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
  }
  send(message: Message): void {
    this.socket.send(JSON.stringify(message));
  }
  next(): Promise<Message> {
    const value = this.messages.shift();
    if (value) return Promise.resolve(value);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error('Test message deadline'));
      }, 3000);
      this.pending = (message): void => {
        clearTimeout(timeout);
        resolve(message);
      };
    });
  }
  async stop(): Promise<void> {
    this.socket.close();
    await this.closed;
  }
}

describe('D5 protected graphql-transport-ws (test schema, isolated AdminSession DB)', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let app: INestApplication<Server>;
  let baseUrl: string;
  let now = Date.parse('2026-10-26T12:00:00Z');
  let cookie: string;
  let sessionId: string;
  const peers: Peer[] = [];
  let intervalSpy: jest.SpyInstance;
  let timeoutSpy: jest.SpyInstance;

  async function stopPeers(): Promise<void> {
    // Wait for the server's physical close too: client close alone need not have released the cap yet.
    const sockets = Reflect.get(
      app.get(SuperadminSubscriptionServer),
      'sockets',
    ) as WebSocketServer;
    const closed = [...sockets.clients].map((socket) => once(socket, 'close'));
    await Promise.all(peers.splice(0).map((peer) => peer.stop()));
    await Promise.all(closed);
  }

  async function open(
    input: {
      cookie?: string;
      origin?: string;
      noOrigin?: boolean;
      init?: boolean;
      params?: object;
      url?: string;
      autoPong?: boolean;
    } = {},
  ): Promise<Peer> {
    const socket = new WebSocket(
      input.url ?? baseUrl.replace('http:', 'ws:') + PATH,
      'graphql-transport-ws',
      {
        headers: {
          ...(input.noOrigin ? {} : { Origin: input.origin ?? ORIGIN }),
          ...(input.cookie ? { Cookie: input.cookie } : {}),
        },
        autoPong: input.autoPong ?? true,
      },
    );
    const peer = new Peer(socket);
    peers.push(peer);
    await once(socket, 'open');
    if (input.init !== false) peer.send({ type: 'connection_init', payload: input.params });
    return peer;
  }
  async function connected(input: { cookie?: string; autoPong?: boolean } = {}): Promise<Peer> {
    const peer = await open({ cookie, ...input });
    expect(await peer.next()).toEqual({ type: 'connection_ack' });
    return peer;
  }
  async function subscription(peer: Peer): Promise<ProbeStream> {
    peer.send({
      id: 'one',
      type: 'subscribe',
      payload: {
        query:
          'subscription { alias: probeEvents { ...Secret } } fragment Secret on Probe { secret }',
      },
    });
    expect(await peer.next()).toMatchObject({
      type: 'next',
      id: 'one',
      payload: { data: { alias: { secret: 'protected' } } },
    });
    const stream = [...streams].at(-1);
    if (!stream) throw new Error('Test iterator missing');
    return stream;
  }
  async function upgradeStatus(input: {
    origin?: string;
    noOrigin?: boolean;
    url?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        input.url ?? baseUrl.replace('http:', 'ws:') + PATH,
        'graphql-transport-ws',
        { headers: input.noOrigin ? {} : { Origin: input.origin ?? ORIGIN } },
      );
      socket.on('unexpected-response', (_request, response) => {
        const status = response.statusCode ?? 0;
        response.resume();
        socket.terminate();
        resolve(status);
      });
      socket.on('error', () => {});
      socket.on('open', () => {
        socket.terminate();
        reject(new Error('Unexpected upgrade acceptance'));
      });
    });
  }

  beforeAll(async () => {
    await database.start();
    prisma = database.client();
    const passwordHash = await bcrypt.hash('ws-test-password', 10);
    const module = await Test.createTestingModule({ imports: [FixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(now) })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          SUPERADMIN_EMAIL: 'ws-admin@example.test',
          SUPERADMIN_PASSWORD_HASH: passwordHash,
          NODE_ENV: 'test',
        }),
      )
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, FixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    app.useWebSocketAdapter(
      new NotificationSocketIoAdapter(app, {
        notificationWsAllowedOrigins: [ORIGIN],
      } as GatewayConfig),
    );
    // Only timer durations are accelerated for tests; production constants remain 25/10/30/5s.
    const originalInterval = global.setInterval;
    const originalTimeout = global.setTimeout;
    intervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation(((
        callback: (...args: unknown[]) => void,
        delay?: number,
        ...args: unknown[]
      ) =>
        originalInterval(
          callback,
          delay === 25000 || delay === 30000 ? 100 : delay,
          ...args,
        )) as typeof setInterval);
    timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      let timeout = delay;
      if (delay === 10000) timeout = 60;
      if (delay === 5000) timeout = 600;
      return originalTimeout(callback, timeout, ...args);
    }) as typeof setTimeout);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Test server address missing');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(async () => {
    now = Date.parse('2026-10-26T12:00:00Z');
    await prisma.adminSession.deleteMany();
    await prisma.adminLoginRateLimit.deleteMany();
    const result = await request(app.getHttpServer()).post(PATH).set('Origin', ORIGIN).send({
      query:
        'mutation { superadminLogin(input:{email:"ws-admin@example.test",password:"ws-test-password"}) { authenticated } }',
    });
    expect(result.body.errors).toBeUndefined();
    cookie = (result.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    sessionId = (await prisma.adminSession.findFirstOrThrow()).id;
  });
  afterEach(stopPeers);
  afterAll(async () => {
    await app?.close();
    intervalSpy?.mockRestore();
    timeoutSpy?.mockRestore();
    await database.stop();
  });

  it('authenticates cookies and guards aliases/nested fields without touching expiry; HTTP and Socket.IO coexist', async () => {
    const before = await prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
    now += 120000;
    const peer = await connected();
    const stream = await subscription(peer);
    const ping = once(peer.socket, 'ping');
    await ping; // Automatic browser-style protocol pong, not a graphql-ws JSON message.
    stream.emit();
    expect((await peer.next()).type).toBe('next');
    const after = await prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(after.lastSeenAt).toEqual(before.lastSeenAt);
    expect(after.idleExpiresAt).toEqual(before.idleExpiresAt);
    const http = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ query: '{probe}' });
    expect(http.body.data.probe).toBe('http-preserved');
    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { Origin: ORIGIN },
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      expect(await socket.timeout(2000).emitWithAck('probe')).toBe('socket-preserved');
    } finally {
      socket.disconnect();
    }
    await peer.stop();
    await stream.returned;
    expect(streams.size).toBe(0);
  });

  it('rejects missing session, JWT and connectionParams credentials, missing/denied Origin, and URL credentials', async () => {
    const userJwt = new JwtService({ secret: 'isolated-user-jwt-only' }).sign({
      sub: randomUUID(),
    });
    for (const input of [{}, { cookie: `accessToken=${userJwt}` }, { params: { token: cookie } }]) {
      const peer = await open(input);
      expect(await peer.closed).toBe(4401);
    }
    expect(await upgradeStatus({ noOrigin: true })).toBe(403);
    expect(await upgradeStatus({ origin: 'https://evil.example.test' })).toBe(403);
    expect(
      await upgradeStatus({ url: baseUrl.replace('http:', 'ws:') + PATH + '?token=forbidden' }),
    ).toBe(403);
  });

  it('allows only whitelisted subscriptions; validates variables/fragments/budget and one active operation', async () => {
    const peer = await connected();
    const fragmentDag = ['fragment F0 on Subscription {probeEvents {secret}}'];
    for (let index = 1; index <= 10; index++)
      fragmentDag.push(`fragment F${index} on Subscription {...F${index - 1} ...F${index - 1}}`);
    const cases = [
      [`subscription {...F10} ${fragmentDag.join(' ')}`, 'BAD_USER_INPUT'],
      ['{probe}', 'FORBIDDEN'],
      ['mutation {superadminLogout {loggedOut}}', 'FORBIDDEN'],
      ['subscription { restrictedEvents {secret} }', 'FORBIDDEN'],
      ['subscription {probeEvents(seed:"invalid") {secret}}', 'GRAPHQL_VALIDATION_FAILED'],
      [
        `subscription {probeEvents {...Wide}} fragment Wide on Probe { ${Array.from({ length: 201 }, (_, index) => `alias${index}:secret`).join(' ')} }`,
        'BAD_USER_INPUT',
      ],
      [
        `subscription {probeEvents {${'child {'.repeat(9)} secret ${'}'.repeat(9)}}}`,
        'BAD_USER_INPUT',
      ],
    ];
    for (const [query, code] of cases) {
      peer.send({ type: 'subscribe', id: randomUUID(), payload: { query } });
      expect(await peer.next()).toMatchObject({
        type: 'error',
        payload: [{ extensions: { code } }],
      });
    }
    peer.send({
      type: 'subscribe',
      id: 'invalid-variable',
      payload: {
        query: 'subscription($seed:Int){probeEvents(seed:$seed){secret}}',
        variables: { seed: 'invalid' },
      },
    });
    expect(await peer.next()).toMatchObject({
      type: 'error',
      payload: [{ extensions: { code: 'BAD_USER_INPUT' } }],
    });
    const stream = await subscription(peer);
    peer.send({
      type: 'subscribe',
      id: 'two',
      payload: { query: 'subscription {probeEvents {secret}}' },
    });
    expect(await peer.next()).toMatchObject({
      type: 'error',
      id: 'two',
      payload: [{ extensions: { code: 'TOO_MANY_REQUESTS' } }],
    });
    peer.send({ type: 'complete', id: 'one' });
    await stream.returned;
  });

  it('fails closed on revoke, exact expiry and storage failure; delivery cannot revive an old session', async () => {
    const peer = await connected();
    const stream = await subscription(peer);
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(now) },
    });
    stream.emit();
    expect(await peer.closed).toBe(4401);
    await stream.returned;
    expect(peer.messages.filter((message) => message.type === 'next')).toHaveLength(0);
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: null, idleExpiresAt: new Date(now + 1) },
    });
    const expiring = await connected();
    now++;
    expect(await expiring.closed).toBe(4401); // Idle sweep, no delivery required.
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: { idleExpiresAt: new Date(now + 60000) },
    });
    const outage = await connected();
    const failure = jest
      .spyOn(app.get(AdminSessionRepository), 'findActive')
      .mockRejectedValue(new Error('private storage details'));
    try {
      expect(await outage.closed).toBe(1013);
    } finally {
      failure.mockRestore();
    }
    const replaced = await connected();
    const login = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        query:
          'mutation { superadminLogin(input:{email:"ws-admin@example.test",password:"ws-test-password"}) { authenticated } }',
      });
    expect(login.body.errors).toBeUndefined();
    expect(await replaced.closed).toBe(4401);
    const newCookie = (login.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    const loggedOut = await connected({ cookie: newCookie });
    const logout = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', newCookie)
      .set('X-Superadmin-CSRF', String(login.headers['x-superadmin-csrf']))
      .send({ query: 'mutation { superadminLogout { loggedOut } }' });
    expect(logout.body.errors).toBeUndefined();
    expect(await loggedOut.closed).toBe(4401);
  });

  it('limits authenticated/pre-init connections and releases counters; init wait is bounded', async () => {
    const clients = await Promise.all(Array.from({ length: 5 }, () => connected()));
    const sixth = await open({ cookie });
    expect(await sixth.closed).toBe(4403);
    await clients[0].stop();
    await connected();
    await stopPeers();
    const uninitialized = await Promise.all(
      Array.from({ length: 100 }, () => open({ init: false })),
    );
    expect(await upgradeStatus({})).toBe(429);
    expect(uninitialized).toHaveLength(100);
    await stopPeers();
    const init = await open({ init: false });
    expect(await init.closed).toBe(4408);
    const oversized = await connected();
    const expectedProtocolError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      oversized.send({ type: 'subscribe', id: 'large', payload: { query: ' '.repeat(65537) } });
      expect(await oversized.closed).toBe(1009);
    } finally {
      expectedProtocolError.mockRestore();
    }
  });

  it('requires matching protocol pong, cancels iterator/timers on timeout and shutdown, leaves other paths alone', async () => {
    const peer = await connected({ autoPong: false });
    const stream = await subscription(peer);
    peer.socket.on('ping', () => {
      peer.socket.pong('wrong-nonce');
      peer.send({ type: 'pong' });
    });
    expect(await peer.closed).toBe(1006);
    await stream.returned;
    const active = await connected();
    const activeStream = await subscription(active);
    const server = app.get(SuperadminSubscriptionServer);
    await server.onModuleDestroy();
    expect(await active.closed).toBe(1001);
    await activeStream.returned;
    expect(streams.size).toBe(0);
    expect(app.getHttpServer().listeners('upgrade')).toHaveLength(1); // Existing Socket.IO owner only.
    const http = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ query: '{probe}' });
    expect(http.body.data.probe).toBe('http-preserved');
  });

  it('uses one exact budget for the future full Posts query and subscription without raising 200', () => {
    const post = 'postId userId username description publishedAt images {fileId url order}';
    const document = parse(
      `query($input:PostsInput!){superadminPosts(input:$input){items {${post}} pageInfo {endCursor hasNextPage}}}`,
    );
    expect(assertSuperadminBudget({ document, variables: { input: {} } })).toBe(149);
    expect(assertSuperadminBudget({ document, variables: { input: { first: 5 } } })).toBe(185);
    expect(() =>
      assertSuperadminBudget({ document, variables: { input: { first: 6 } } }),
    ).toThrow();
    expect(() =>
      assertSuperadminBudget({
        document: parse(
          `{a:superadminPosts(input:{first:5}){items{${post}}} b:superadminPosts(input:{first:5}){items{${post}}}}`,
        ),
      }),
    ).toThrow();
    expect(
      assertSuperadminBudget({
        document: parse(`subscription{superadminPostPublished(input:{}){kind post{${post}}}}`),
        allowSubscriptions: true,
      }),
    ).toBe(39);
    expect(SUPERADMIN_WS_LIMITS).toMatchObject({
      pingMs: 25000,
      pongMs: 10000,
      sweepMs: 30000,
      initMs: 5000,
      maxPayload: 65536,
      connections: 100,
      sessionConnections: 5,
    });
  });
});
