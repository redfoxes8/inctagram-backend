import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { IsolatedRabbit } from './isolated-rabbit';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { SuperadminUsersModule } from '../../src/modules/superadmin/superadmin-users.module';
import { SuperadminModerationModule } from '../../src/modules/superadmin/superadmin-moderation.module';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import { SessionAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/session-admin-principal.verifier';
import {
  AdminClock,
  ADMIN_ABSOLUTE_MS,
  ADMIN_IDLE_MS,
} from '../../src/modules/superadmin/domain/admin-clock';
import { hashAdminToken } from '../../src/modules/superadmin/application/admin-token';
import { UserAccessModule } from '../../src/modules/sessions/user-access.module';
import { UserStateAuditModule } from '../../src/modules/users/user-state-audit.module';
import {
  UserAccessCheck,
  UserAccessClock,
} from '../../src/modules/sessions/application/user-access-check';
import { ModerateUserUseCase } from '../../src/modules/users/application/commands/moderate-user.usecase';
import { AdminUserActionAuditWriter } from '../../src/modules/users/domain/interfaces/admin-user-action-audit.writer';
import { UserAccessStateQuery } from '../../src/modules/users/domain/interfaces/user-access-state.query';
import { PrismaUsersQueryRepository } from '../../src/modules/users/infrastructure/users.query-repository';
import { UserAccessRevokeRelay } from '../../src/modules/users/infrastructure/outbox/user-access-revoke-relay';
import { UserAccessRevokedConsumer } from '../../src/modules/notifications/infrastructure/user-access-revoked.consumer';
import { NotificationLiveEventConsumer } from '../../src/modules/notifications/infrastructure/notification-live-event.consumer';
import { NotificationRealtimePublisher } from '../../src/modules/notifications/realtime/notification-realtime.publisher';
import { NotificationsGateway } from '../../src/modules/notifications/api/ws/notifications.gateway';
import { AuthController } from '../../src/modules/auth/api/auth.controller';
import { SessionsController } from '../../src/modules/sessions/api/security-devices.controller';
import { LocalStrategy } from '../../src/common/strategies/local.strategy';
import { JwtStrategy } from '../../src/common/strategies/jwt.strategy';
import { LoginUseCase } from '../../src/modules/auth/application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../src/modules/auth/application/use-cases/refresh-token.use-case';
import { GoogleLoginUseCase } from '../../src/modules/auth/application/use-cases/google-login.use-case';
import { IGoogleAuthAdapter } from '../../src/modules/auth/application/interfaces/google-auth.adapter.interface';
import { IOAuthAccountsRepository } from '../../src/modules/auth/domain/interfaces/oauth-accounts.repository.interface';
import { PrismaOAuthAccountsRepository } from '../../src/modules/auth/infrastructure/oauth-accounts.repository';
import { IUsersRepository } from '../../src/modules/users/domain/interfaces/users.repository.interface';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { IProfileRepository } from '../../src/modules/users/domain/interfaces/user-profile.repository.interface';
import { ProfileRepository } from '../../src/modules/users/infrastructure/profile.repository';
import { IPasswordService } from '../../src/modules/users/application/interfaces/password.service.interface';
import { BcryptService } from '../../src/modules/users/infrastructure/password.service';
import { ISessionsRepository } from '../../src/modules/sessions/domain/interfaces/sessions.repository.interface';
import { PrismaSessionsRepository } from '../../src/modules/sessions/infrastructure/sessions.repository';
import { ISessionsQueryRepository } from '../../src/modules/sessions/domain/interfaces/sessions.query-repository.interface';
import { PrismaSessionsQueryRepository } from '../../src/modules/sessions/infrastructure/sessions.query-repository';
import { IJwtService } from '../../src/modules/auth/application/interfaces/jwt.service.interface';
import { JwtServiceImplementation } from '../../src/modules/auth/infrastructure/jwt.service';
import { GatewayConfig } from '../../src/core/gateway.config';
import { CoreConfig } from '../../../../libs/common/src/core.config';
import { SUPERADMIN_RUNTIME_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/runtime-type-defs';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { setupSuperadminHttp } from '../../src/modules/superadmin/api/superadmin-http-security';
import { COMMON_RABBITMQ_EXCHANGE } from '../../src/core/gateway-rabbitmq.constants';
import {
  USER_ACCESS_REVOKED_ROUTING_KEY,
  USER_ACCESS_REVOKED_EVENT_TYPE,
} from '../../../../libs/contracts/src/user-access-revoked';

const ORIGIN = 'https://enforcement.example.test';
const ADMIN_TOKEN = 'a'.repeat(43);
const NONCE = 'n'.repeat(43);
const PASSWORD = 'isolated-user-password';
const EMAIL = 'access-fixture@example.test';
const GOOGLE = { exchangeCodeForProfile: jest.fn() };

@Module({
  imports: [
    UserAccessModule,
    UserStateAuditModule,
    CqrsModule,
    PassportModule,
    JwtModule.register({ secret: 'isolated-user-jwt-only' }),
    GoogleRecaptchaModule.forRoot({
      secretKey: 'unused-fixture',
      response: (): string => '',
      skipIf: true,
    }),
    SuperadminModule.withRuntime({
      typeDefs: SUPERADMIN_RUNTIME_TYPE_DEFS,
      production: true,
      imports: [SuperadminAuthModule, SuperadminUsersModule, SuperadminModerationModule],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
    }),
  ],
  controllers: [AuthController, SessionsController],
  providers: [
    LocalStrategy,
    JwtStrategy,
    LoginUseCase,
    RefreshTokenUseCase,
    GoogleLoginUseCase,
    NotificationsGateway,
    NotificationRealtimePublisher,
    NotificationLiveEventConsumer,
    UserAccessRevokedConsumer,
    UserAccessRevokeRelay,
    { provide: AmqpConnection, useValue: null },
    { provide: IGoogleAuthAdapter, useValue: GOOGLE },
    { provide: IOAuthAccountsRepository, useClass: PrismaOAuthAccountsRepository },
    { provide: IUsersRepository, useClass: PrismaUsersRepository },
    { provide: IProfileRepository, useClass: ProfileRepository },
    { provide: IPasswordService, useClass: BcryptService },
    { provide: ISessionsRepository, useClass: PrismaSessionsRepository },
    { provide: ISessionsQueryRepository, useClass: PrismaSessionsQueryRepository },
    { provide: IJwtService, useClass: JwtServiceImplementation },
    { provide: CoreConfig, useValue: { env: 'test' } },
    {
      provide: GatewayConfig,
      useValue: {
        jwtSecret: 'isolated-user-jwt-only',
        accessTokenExpTime: 60,
        refreshTokenExpTime: 120,
      },
    },
  ],
})
class AccessFixtureModule {}

function barrier(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function socketEvent(input: { socket: Socket; name: string }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Missing socket event: ${input.name}`)),
      8000,
    );
    input.socket.once(input.name, (value: unknown) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
}

describe('4B real PostgreSQL/RabbitMQ, two local Gateway HTTP/WS instances', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  const rabbit = new IsolatedRabbit();
  const apps: INestApplication<Server>[] = [];
  const sockets: Socket[] = [];
  let prisma: PrismaService;
  let peer: PrismaService;
  let now: number;
  let userId: string;
  let adminSessionId: string;
  let passwordHash: string;

  async function createApp(connection: AmqpConnection): Promise<INestApplication<Server>> {
    const module = await Test.createTestingModule({ imports: [AccessFixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(apps.length ? peer : prisma)
      .overrideProvider(AmqpConnection)
      .useValue(connection)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(now) })
      .overrideProvider(UserAccessClock)
      .useValue({ now: (): Date => new Date(now) })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ NODE_ENV: 'test' }))
      .compile();
    const app: INestApplication<Server> = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, AccessFixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    await app.listen(0, '127.0.0.1');
    apps.push(app);
    return app;
  }

  function gql(input: {
    action?: 'BLOCK' | 'UNBLOCK' | 'DELETE';
    id?: string;
    query?: string;
    cookie?: string;
    csrf?: boolean;
  }): request.Test {
    const field =
      input.action === 'DELETE'
        ? 'superadminDeleteUser'
        : input.action === 'UNBLOCK'
          ? 'superadminUnblockUser'
          : 'superadminBlockUser';
    let test = request(apps[0].getHttpServer())
      .post('/api/v1/graphql')
      .set('Origin', ORIGIN)
      .set('Cookie', input.cookie ?? `superadminSession=${ADMIN_TOKEN}; superadminCsrf=${NONCE}`)
      .send({
        query:
          input.query ??
          `mutation($input: SuperadminUserIdInput!) { ${field}(input: $input) { userId outcome } }`,
        variables: { input: { userId: input.id ?? userId } },
      });
    if (input.csrf !== false) test = test.set('X-Superadmin-CSRF', NONCE);
    return test;
  }

  function command(
    action: 'BLOCK' | 'UNBLOCK' | 'DELETE',
  ): Promise<{ userId: string; action: string; outcome: string }> {
    return apps[0].get(ModerateUserUseCase).execute({ action, userId, adminSessionId });
  }

  async function login(
    input: { email?: string } = {},
  ): Promise<{ access: string; refreshCookie: string }> {
    const response = await request(apps[0].getHttpServer())
      .post('/api/v1/auth/login')
      .send({ usernameOrEmail: input.email ?? EMAIL, password: PASSWORD });
    expect(response.status).toBe(200);
    return {
      access: response.body.accessToken as string,
      refreshCookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    };
  }

  async function connect(input: { app?: number; access: string }): Promise<Socket> {
    const address = apps[input.app ?? 0].getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('No HTTP port');
    const socket = io(`http://127.0.0.1:${address.port}/notifications`, {
      transports: ['websocket'],
      reconnection: false,
      auth: { accessToken: input.access },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function blockedQueries(count: number): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await peer.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::integer AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FROM "User" WHERE "id"%'`;
      if (rows[0].count >= count) return;
    }
    throw new Error('Expected user row-lock wait was not observed');
  }

  beforeAll(async () => {
    await database.start({
      deployLastWithPrisma: true,
      beforeMigration: ({ name, database: isolated }) => {
        if (name === '20261018140000_add_user_access_revoke_outbox')
          isolated.sql(
            `INSERT INTO "AdminSession" ("id","tokenHash","createdAt","lastSeenAt","idleExpiresAt","absoluteExpiresAt") VALUES ('migration-admin','${'f'.repeat(64)}',now(),now(),now()+interval '30 minutes',now()+interval '8 hours');
             UPDATE "User" SET "isBanned" = true, "isConfirmed" = true, "accountType" = 'BUSINESS' WHERE "id" = 'migration-preserved-user';
             INSERT INTO "Profile" ("id","userId","username") VALUES ('migration-profile','migration-preserved-user','migration-profile');
             INSERT INTO "Session" ("id","userId","deviceId","deviceName","ip","iat","exp") VALUES ('migration-session','migration-preserved-user','migration-device','fixture','127.0.0.1',1700000000,1900000000);`,
          );
      },
    });
    prisma = database.client();
    peer = database.client();
    expect(
      await prisma.user.findUnique({ where: { id: 'migration-preserved-user' } }),
    ).toMatchObject({
      isBanned: true,
      isConfirmed: true,
      accountType: 'BUSINESS',
      deletedAt: null,
    });
    expect(
      await prisma.adminSession.findUnique({ where: { id: 'migration-admin' } }),
    ).not.toBeNull();
    expect(await prisma.profile.findUnique({ where: { id: 'migration-profile' } })).toMatchObject({
      userId: 'migration-preserved-user',
      username: 'migration-profile',
    });
    expect(await prisma.session.findUnique({ where: { id: 'migration-session' } })).toMatchObject({
      iat: 1700000000,
      exp: 1900000000,
      deletedAt: null,
    });
    const migration = await prisma.$queryRaw<
      { finished: boolean }[]
    >`SELECT finished_at IS NOT NULL AS finished FROM "_prisma_migrations" WHERE migration_name = '20261018140000_add_user_access_revoke_outbox'`;
    expect(migration).toEqual([{ finished: true }]);
    await rabbit.start();
    now = Date.now();
    passwordHash = await bcrypt.hash(PASSWORD, 10);
    await createApp(await rabbit.connection());
    await createApp(await rabbit.connection());
  });

  beforeEach(async () => {
    now = Date.now();
    await prisma.user.deleteMany();
    await prisma.adminUserActionAudit.deleteMany();
    await prisma.userAccessRevokeOutbox.deleteMany();
    await prisma.adminSession.deleteMany();
    const user = await prisma.user.create({
      data: { email: EMAIL, passwordHash, isConfirmed: true },
    });
    userId = user.id;
    const admin = await prisma.adminSession.create({
      data: {
        tokenHash: hashAdminToken(ADMIN_TOKEN),
        createdAt: new Date(now),
        lastSeenAt: new Date(now),
        idleExpiresAt: new Date(now + ADMIN_IDLE_MS),
        absoluteExpiresAt: new Date(now + ADMIN_ABSOLUTE_MS),
      },
    });
    adminSessionId = admin.id;
    GOOGLE.exchangeCodeForProfile.mockResolvedValue({
      email: EMAIL,
      email_verified: true,
      sub: 'fixture-google-subject',
    });
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await rabbit.stop();
    await database.stop();
  });

  it.each([false, true])(
    'SA05 deletes active/blocked=%s, retains data and distinguishes repeat/missing with one audit each',
    async (isBanned) => {
      await login();
      await login();
      await prisma.user.update({ where: { id: userId }, data: { isBanned } });
      const profile = await prisma.profile.create({
        data: {
          userId,
          username: 'retained-profile',
          avatarUrl: 'https://files.example.test/retained.jpg',
        },
      });
      const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const admins = await prisma.adminSession.findMany();
      const response = await gql({ action: 'DELETE' });
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.superadminDeleteUser).toEqual({ userId, outcome: 'DELETED' });
      const deleted = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(deleted).toEqual({ ...before, deletedAt: new Date(now), updatedAt: new Date(now) });
      expect(await prisma.profile.findUnique({ where: { userId } })).toEqual(profile);
      expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(0);
      expect(await prisma.session.count({ where: { userId } })).toBe(2);
      expect(await prisma.adminSession.findMany()).toEqual(admins);
      now += 1000;
      expect((await gql({ action: 'DELETE' })).body.data.superadminDeleteUser.outcome).toBe(
        'ALREADY_DELETED',
      );
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toEqual(
        deleted.deletedAt,
      );
      const missing = randomUUID();
      expect((await gql({ action: 'DELETE', id: missing })).body.data.superadminDeleteUser).toEqual(
        { userId: missing, outcome: 'NOT_FOUND' },
      );
      const audit = await prisma.adminUserActionAudit.findMany();
      expect(audit).toHaveLength(3);
      expect(
        audit.every((row) => row.action === 'DELETE' && row.adminSessionId === adminSessionId),
      ).toBe(true);
      expect(audit.map((row) => row.outcome).sort()).toEqual([
        'ALREADY_DELETED',
        'DELETED',
        'NOT_FOUND',
      ]);
      expect(await prisma.userAccessRevokeOutbox.count()).toBe(1);
      expect((await command('BLOCK')).outcome).toBe('USER_DELETED');
      expect((await command('UNBLOCK')).outcome).toBe('USER_DELETED');
    },
  );

  it('SA05 validates admin-only delete, UUID, CSRF and rejects caller-supplied actor ID', async () => {
    const browser = await login();
    expect((await gql({ action: 'DELETE', id: 'invalid' })).body.errors[0].extensions.code).toBe(
      'BAD_USER_INPUT',
    );
    expect(
      (await gql({ action: 'DELETE', cookie: '' }).set('Authorization', `Bearer ${browser.access}`))
        .body.errors[0].extensions.code,
    ).toBe('UNAUTHENTICATED');
    expect((await gql({ action: 'DELETE', csrf: false })).body.errors[0].extensions.code).toBe(
      'FORBIDDEN',
    );
    expect(
      (await gql({ action: 'DELETE' }).set('Origin', 'https://untrusted.example.test')).status,
    ).toBe(403);
    expect(
      (
        await gql({ action: 'DELETE' }).send({
          variables: { input: { userId, adminSessionId: randomUUID() } },
        })
      ).body.errors[0].extensions.code,
    ).toBe('BAD_USER_INPUT');
    await prisma.adminSession.updateMany({ data: { revokedAt: new Date(now) } });
    expect((await gql({ action: 'DELETE' })).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
  });

  it.each(['AdminUserActionAudit', 'UserAccessRevokeOutbox'])(
    'SA05 rolls the entire delete back when %s INSERT fails',
    async (table) => {
      await login();
      const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      database.sql(
        `ALTER TABLE "${table}" ADD CONSTRAINT "fixture_delete_failure" CHECK (false) NOT VALID`,
      );
      try {
        expect((await gql({ action: 'DELETE' })).body.errors[0].extensions.code).toBe(
          'INTERNAL_SERVER_ERROR',
        );
      } finally {
        database.sql(`ALTER TABLE "${table}" DROP CONSTRAINT "fixture_delete_failure"`);
      }
      expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toEqual(before);
      expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(1);
      expect(await prisma.adminUserActionAudit.count()).toBe(0);
      expect(await prisma.userAccessRevokeOutbox.count()).toBe(0);
    },
  );

  it('SA05 exposes neither state/audit/outbox nor revoke publication before commit', async () => {
    await login();
    const ready = barrier();
    const release = barrier();
    const writer = apps[0].get(AdminUserActionAuditWriter);
    const append = writer.append.bind(writer);
    jest.spyOn(writer, 'append').mockImplementationOnce(async (input) => {
      const result = await append(input);
      ready.release();
      await release.promise;
      return result;
    });
    const published = jest.spyOn(apps[0].get(AmqpConnection), 'publish');
    const pending = command('DELETE');
    try {
      await ready.promise;
      expect((await peer.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
      expect(await peer.session.count({ where: { userId, deletedAt: null } })).toBe(1);
      expect(await peer.adminUserActionAudit.count()).toBe(0);
      expect(await peer.userAccessRevokeOutbox.count()).toBe(0);
      await apps[0].get(UserAccessRevokeRelay).relay();
      expect(published).not.toHaveBeenCalled();
    } finally {
      release.release();
    }
    expect((await pending).outcome).toBe('DELETED');
    await apps[0].get(UserAccessRevokeRelay).relay();
    expect(published).toHaveBeenCalledTimes(1);
  });

  it.each(['DELETE', 'BLOCK', 'UNBLOCK'] as const)(
    'SA05 serializes delete/%s without restoration or lost audit',
    async (other) => {
      if (other === 'UNBLOCK')
        await prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
      const ready = barrier();
      const release = barrier();
      const holder = peer.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        ready.release();
        await release.promise;
      });
      await ready.promise;
      const pending = Promise.all([command('DELETE'), command(other)]);
      try {
        await blockedQueries(2);
      } finally {
        release.release();
      }
      await holder;
      const outcomes = (await pending).map((row) => row.outcome);
      if (other === 'DELETE') expect(outcomes.sort()).toEqual(['ALREADY_DELETED', 'DELETED']);
      else {
        expect(outcomes[0]).toBe('DELETED');
        expect([other === 'BLOCK' ? 'BLOCKED' : 'UNBLOCKED', 'USER_DELETED']).toContain(
          outcomes[1],
        );
      }
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt,
      ).not.toBeNull();
      expect(await prisma.adminUserActionAudit.count()).toBe(2);
      expect((await command('UNBLOCK')).outcome).toBe('USER_DELETED');
    },
  );

  it('SA05 excludes the user from catalogue/detail and ordinary User reads, retaining internal DELETED state', async () => {
    const query =
      '{ superadminUsers(input: { pageSize: 1 }) { items { userId } totalCount pageInfo { pagesCount hasNextPage } } }';
    expect((await gql({ query, csrf: false })).body.data.superadminUsers.totalCount).toBe(1);
    await command('DELETE');
    expect((await gql({ query, csrf: false })).body.data.superadminUsers).toEqual({
      items: [],
      totalCount: 0,
      pageInfo: { pagesCount: 0, hasNextPage: false },
    });
    expect(
      (
        await gql({
          query: `query { superadminUser(userId: "${userId}") { userId } }`,
          csrf: false,
        })
      ).body.data.superadminUser,
    ).toBeNull();
    expect(await apps[0].get(IUsersRepository).findById(userId)).toBeNull();
    expect(await apps[0].get(IUsersRepository).findByEmail(EMAIL)).toBeNull();
    expect(await new PrismaUsersQueryRepository(prisma).getUserById(userId)).toBeNull();
    expect(await apps[0].get(UserAccessStateQuery).findByUserId({ userId })).toBe('DELETED');
    expect(
      await apps[0].get(UserAccessStateQuery).findByUserId({ userId: randomUUID() }),
    ).toBeNull();
    expect(await prisma.profile.count()).toBe(0); // Reading a profileless user never creates Profile.
  });

  it('SA05 prevents a stale User entity update from restoring deletedAt, including an actual SQL wait', async () => {
    const repository = apps[0].get(IUsersRepository);
    const stale = await repository.findById(userId);
    if (!stale) throw new Error('Missing fixture');
    const ready = barrier();
    const release = barrier();
    const writer = apps[0].get(AdminUserActionAuditWriter);
    const append = writer.append.bind(writer);
    jest.spyOn(writer, 'append').mockImplementationOnce(async (input) => {
      const result = await append(input);
      ready.release();
      await release.promise;
      return result;
    });
    const deleting = command('DELETE');
    await ready.promise;
    const saving = repository.update(stale).then(
      () => 'UPDATED',
      (error: unknown) => error,
    );
    try {
      const deadline = Date.now() + 4000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const rows = await peer.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%UPDATE%User%') AS waiting`;
        waiting = rows[0].waiting;
      }
      expect(waiting).toBe(true);
    } finally {
      release.release();
    }
    await deleting;
    expect(await saving).toMatchObject({ code: 404 });
    const deletedAt = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt;
    await expect(repository.update(stale)).rejects.toMatchObject({ code: 404 });
    await expect(repository.save(stale)).rejects.toMatchObject({ code: 'P2002' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toEqual(
      deletedAt,
    );
  });

  it('SA05 denies old REST/refresh, new password/Google login, WS and later delivery; fan-out closes both Gateways', async () => {
    const browser = await login();
    const first = await connect({ access: browser.access });
    const second = await connect({ app: 1, access: browser.access });
    await command('DELETE');
    expect(
      (
        await request(apps[0].getHttpServer())
          .get('/api/v1/sessions/my-devices')
          .set('Authorization', `Bearer ${browser.access}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(apps[0].getHttpServer())
          .post('/api/v1/auth/refresh-token')
          .set('Cookie', browser.refreshCookie)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(apps[0].getHttpServer())
          .post('/api/v1/auth/login')
          .send({ usernameOrEmail: EMAIL, password: PASSWORD })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(apps[0].getHttpServer())
          .post('/api/v1/auth/google/login')
          .send({ code: 'fixture-code' })
      ).status,
    ).toBe(401);
    await expect(connect({ access: browser.access })).rejects.toMatchObject({
      message: 'Unauthorized',
    });
    const leaked = jest.fn();
    first.on('notifications.unseen-count', leaked);
    const firstClosed = socketEvent({ socket: first, name: 'disconnect' });
    await apps[0].get(NotificationRealtimePublisher).publishUnseenCount(userId, { unseenCount: 4 });
    await firstClosed;
    expect(leaked).not.toHaveBeenCalled();
    // Consumer must work even if another existing lifecycle operation removed the Session rows.
    await prisma.session.deleteMany({ where: { userId } });
    const secondClosed = socketEvent({ socket: second, name: 'disconnect' });
    await apps[0].get(UserAccessRevokeRelay).relay();
    await secondClosed;
    expect((await prisma.userAccessRevokeOutbox.findFirstOrThrow()).publishedAt).not.toBeNull();
    expect(
      (await gql({ query: '{ superadminSession { authenticated } }', csrf: false })).body.data
        .superadminSession.authenticated,
    ).toBe(true);
  });

  it('SA05 preserves Gateway entitlement records and publishes only access revoke, not payment commands (Payment MS not connected)', async () => {
    const subscriptionId = randomUUID();
    await prisma.paymentEntitlementCursor.create({
      data: { userId, lastSubscriptionSequence: 2, activeSubscriptionId: subscriptionId },
    });
    await prisma.paymentEntitlementInbox.create({
      data: {
        eventId: randomUUID(),
        userId,
        subscriptionId,
        eventType: 'subscription.activated',
        subscriptionSequence: 2,
        outcome: 'APPLIED',
      },
    });
    const before = {
      cursor: await prisma.paymentEntitlementCursor.findUnique({ where: { userId } }),
      inbox: await prisma.paymentEntitlementInbox.findMany({ where: { userId } }),
      avatar: await prisma.outboxEvent.findMany(),
    };
    const publish = jest.spyOn(apps[0].get(AmqpConnection), 'publish');
    await command('DELETE');
    await apps[0].get(UserAccessRevokeRelay).relay();
    expect(await prisma.paymentEntitlementCursor.findUnique({ where: { userId } })).toEqual(
      before.cursor,
    );
    expect(await prisma.paymentEntitlementInbox.findMany({ where: { userId } })).toEqual(
      before.inbox,
    );
    expect(await prisma.outboxEvent.findMany()).toEqual(before.avatar);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1]).toBe(USER_ACCESS_REVOKED_ROUTING_KEY);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
    await prisma.paymentEntitlementCursor.deleteMany({ where: { userId } });
    await prisma.paymentEntitlementInbox.deleteMany({ where: { userId } });
  });

  it('publishes exact 4B/05 schema and all block outcomes with one audit each, including missing/deleted', async () => {
    const initial = await login();
    await login(); // Both independent browser sessions must be revoked, not just the presented one.
    const other = await prisma.user.create({
      data: {
        email: 'unaffected@fixture.test',
        sessions: {
          create: {
            deviceId: randomUUID(),
            deviceName: 'fixture',
            ip: '127.0.0.1',
            iat: Math.floor(now / 1000),
            exp: Math.floor(now / 1000) + 120,
          },
        },
      },
    });
    const block = await gql({});
    expect(block.body.data.superadminBlockUser.outcome).toBe('BLOCKED');
    expect((await gql({})).body.data.superadminBlockUser.outcome).toBe('ALREADY_BLOCKED');
    expect((await gql({ action: 'UNBLOCK' })).body.data.superadminUnblockUser.outcome).toBe(
      'UNBLOCKED',
    );
    expect((await gql({ action: 'UNBLOCK' })).body.data.superadminUnblockUser.outcome).toBe(
      'ALREADY_ACTIVE',
    );
    const missing = randomUUID();
    for (const action of ['BLOCK', 'UNBLOCK'] as const)
      expect(
        (await gql({ action, id: missing })).body.data[
          action === 'BLOCK' ? 'superadminBlockUser' : 'superadminUnblockUser'
        ].outcome,
      ).toBe('NOT_FOUND');
    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(now), isBanned: true },
    });
    for (const action of ['BLOCK', 'UNBLOCK'] as const)
      expect((await command(action)).outcome).toBe('USER_DELETED');
    expect(await prisma.adminUserActionAudit.count()).toBe(8);
    const rows = await prisma.adminUserActionAudit.findMany();
    expect(rows.every((row) => row.adminSessionId === adminSessionId)).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual([
      'action',
      'adminSessionId',
      'id',
      'occurredAt',
      'outcome',
      'targetUserId',
    ]);
    expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: other.id, deletedAt: null } })).toBe(1);
    expect((await prisma.userAccessRevokeOutbox.findFirstOrThrow()).sessionIds).toHaveLength(2);
    expect(await prisma.userAccessRevokeOutbox.count()).toBe(1);
    expect(JSON.stringify(rows)).not.toContain(initial.access);
    const schema = apps[0].get(GraphQLSchemaHost).schema;
    expect(Object.keys(schema.getMutationType()!.getFields()).sort()).toEqual([
      'superadminBlockUser',
      'superadminDeleteUser',
      'superadminLogin',
      'superadminLogout',
      'superadminUnblockUser',
    ]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).isBanned).toBe(true);
  });

  it('validates UUID and fails closed for user JWT, absent admin session, CSRF and Origin', async () => {
    expect((await gql({ id: 'invalid' })).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await gql({ cookie: '' })).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const ordinary = await login();
    expect(
      (await gql({ cookie: '' }).set('Authorization', `Bearer ${ordinary.access}`)).body.errors[0]
        .extensions.code,
    ).toBe('UNAUTHENTICATED');
    expect((await gql({ csrf: false })).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect((await gql({}).set('Origin', 'https://untrusted.example.test')).status).toBe(403);
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).isBanned).toBe(false);
  });

  it('rolls state/session/outbox back if audit persistence fails', async () => {
    await login();
    database.sql(
      'ALTER TABLE "AdminUserActionAudit" ADD CONSTRAINT "fixture_audit_failure" CHECK (false) NOT VALID',
    );
    try {
      expect((await gql({})).body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    } finally {
      database.sql('ALTER TABLE "AdminUserActionAudit" DROP CONSTRAINT "fixture_audit_failure"');
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).isBanned).toBe(false);
    expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(1);
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    expect(await prisma.userAccessRevokeOutbox.count()).toBe(0);
  });

  it('serializes repeated and competing commands without losing no-op audit', async () => {
    async function pair(actions: ('BLOCK' | 'UNBLOCK')[]): Promise<{ outcome: string }[]> {
      const locked = barrier();
      const release = barrier();
      const holder = peer.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        locked.release();
        await release.promise;
      });
      await locked.promise;
      const pending = Promise.all(actions.map(command));
      try {
        await blockedQueries(2);
      } finally {
        release.release();
      }
      await holder;
      return pending;
    }
    expect((await pair(['BLOCK', 'BLOCK'])).map((row) => row.outcome).sort()).toEqual([
      'ALREADY_BLOCKED',
      'BLOCKED',
    ]);
    expect((await pair(['UNBLOCK', 'UNBLOCK'])).map((row) => row.outcome).sort()).toEqual([
      'ALREADY_ACTIVE',
      'UNBLOCKED',
    ]);
    const competing = await pair(['BLOCK', 'UNBLOCK']);
    expect(competing[0].outcome).toBe('BLOCKED');
    expect(['ALREADY_ACTIVE', 'UNBLOCKED']).toContain(competing[1].outcome);
    expect(await prisma.adminUserActionAudit.count()).toBe(6);
  });

  it('honors deleted priority when a fixture soft-delete owns the user lock first', async () => {
    const locked = barrier();
    const release = barrier();
    const deleting = peer.$transaction(async (transaction) => {
      await transaction.$executeRaw`UPDATE "User" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" = ${userId}`;
      locked.release();
      await release.promise;
    });
    await locked.promise;
    const pending = command('BLOCK');
    try {
      await blockedQueries(1);
    } finally {
      release.release();
    }
    await deleting;
    expect((await pending).outcome).toBe('USER_DELETED');
    expect(await prisma.userAccessRevokeOutbox.count()).toBe(0);
  });

  it('enforces real REST/login/refresh, leaves old tokens invalid after unblock and permits a new login', async () => {
    const old = await login();
    const devices = (): request.Test =>
      request(apps[0].getHttpServer())
        .get('/api/v1/sessions/my-devices')
        .set('Authorization', `Bearer ${old.access}`);
    expect((await devices()).status).toBe(200);
    await command('BLOCK');
    expect((await devices()).status).toBe(401);
    expect(
      (
        await request(apps[0].getHttpServer())
          .post('/api/v1/auth/login')
          .send({ usernameOrEmail: EMAIL, password: PASSWORD })
      ).status,
    ).toBe(401);
    const refreshed = await request(apps[0].getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', old.refreshCookie);
    expect(refreshed.status).toBe(401);
    expect(String(refreshed.headers['set-cookie'])).toContain('refreshToken=;');
    await command('UNBLOCK');
    expect((await devices()).status).toBe(401);
    expect(
      (
        await request(apps[0].getHttpServer())
          .post('/api/v1/auth/refresh-token')
          .set('Cookie', old.refreshCookie)
      ).status,
    ).toBe(401);
    const current = await login();
    expect(current.access).not.toBe(old.access);
    expect(
      (
        await request(apps[1].getHttpServer())
          .get('/api/v1/sessions/my-devices')
          .set('Authorization', `Bearer ${current.access}`)
      ).status,
    ).toBe(200);
    const state = await gql({
      query: '{ superadminUsers(input: {}) { items { state } } }',
      csrf: false,
    });
    expect(state.body.data.superadminUsers.items).toEqual([{ state: 'ACTIVE' }]);
  });

  it('checks session owner, token/session expiry boundaries and storage failure', async () => {
    const browser = await login();
    const jwt = apps[0].get(IJwtService);
    const payload = jwt.verifyAccessToken(browser.access);
    await expect(
      apps[0].get(UserAccessCheck).verify({ ...payload, userId: randomUUID() }),
    ).rejects.toMatchObject({ code: 401 });
    await expect(
      apps[0].get(UserAccessCheck).verify({ ...payload, exp: Math.floor(now / 1000) }),
    ).rejects.toMatchObject({ code: 401 });
    await prisma.session.updateMany({ data: { exp: Math.floor(now / 1000) } });
    await expect(apps[0].get(UserAccessCheck).verify(payload)).rejects.toMatchObject({ code: 401 });
    database.sql('ALTER TABLE "Session" RENAME TO "FixtureUnavailableSession"');
    try {
      const response = await request(apps[0].getHttpServer())
        .get('/api/v1/sessions/my-devices')
        .set('Authorization', `Bearer ${browser.access}`);
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toMatch(/Prisma|SELECT|password|stack/);
    } finally {
      database.sql('ALTER TABLE "FixtureUnavailableSession" RENAME TO "Session"');
    }
  });

  it('blocks existing and linked Google login without changing Google verification requirements', async () => {
    await command('BLOCK');
    const googleLogin = (): request.Test =>
      request(apps[0].getHttpServer())
        .post('/api/v1/auth/google/login')
        .send({ code: 'isolated-code' });
    expect((await googleLogin()).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
    await command('UNBLOCK');
    expect((await googleLogin()).status).toBe(200);
    await command('BLOCK');
    expect((await googleLogin()).status).toBe(401);
    GOOGLE.exchangeCodeForProfile.mockResolvedValue({
      email: EMAIL,
      email_verified: false,
      sub: 'fixture-google-subject',
    });
    await command('UNBLOCK');
    expect((await googleLogin()).status).toBe(401);
  });

  it.each(['BLOCKED', 'DELETED'] as const)(
    'denies %s independently of session revocation',
    async (state) => {
      const browser = await login();
      await prisma.user.update({
        where: { id: userId },
        data: state === 'BLOCKED' ? { isBanned: true } : { deletedAt: new Date(now) },
      });
      expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(1);
      expect(
        (
          await request(apps[0].getHttpServer())
            .get('/api/v1/sessions/my-devices')
            .set('Authorization', `Bearer ${browser.access}`)
        ).status,
      ).toBe(401);
      expect(
        (
          await request(apps[0].getHttpServer())
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', browser.refreshCookie)
        ).status,
      ).toBe(401);
      await expect(connect({ access: browser.access })).rejects.toMatchObject({
        message: 'Unauthorized',
      });
      expect(
        (
          await request(apps[0].getHttpServer())
            .post('/api/v1/auth/google/login')
            .send({ code: 'fixture-code' })
        ).status,
      ).toBe(401);
      expect(await prisma.oAuthAccount.count()).toBe(0);
    },
  );

  it('does not rotate or revoke a session owned by another user', async () => {
    const browser = await login();
    const jwt = apps[0].get(IJwtService);
    const payload = jwt.verifyAccessToken(browser.access);
    const other = await prisma.user.create({
      data: { email: 'other-owner@fixture.test', isConfirmed: true },
    });
    const foreign = jwt.createTokens(other.id, payload.deviceId);
    expect(
      (
        await request(apps[0].getHttpServer())
          .post('/api/v1/auth/refresh-token')
          .set('Cookie', `refreshToken=${foreign.refreshToken}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(apps[0].getHttpServer())
          .get('/api/v1/sessions/my-devices')
          .set('Authorization', `Bearer ${foreign.accessToken}`)
      ).status,
    ).toBe(401);
    expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(1);
  });

  it('recovers an abandoned publisher lease after its exact expiry, without duplicate claims', async () => {
    await command('BLOCK');
    const leaseUntil = new Date(now + 30000);
    await prisma.userAccessRevokeOutbox.updateMany({
      data: { leaseId: randomUUID(), leaseUntil, attempts: 1 },
    });
    const restarted = new UserAccessRevokeRelay(peer, await rabbit.connection(), {
      now: (): Date => new Date(now),
    });
    await restarted.relay();
    expect((await prisma.userAccessRevokeOutbox.findFirstOrThrow()).publishedAt).toBeNull();
    now = leaseUntil.getTime();
    await Promise.all([restarted.relay(), apps[0].get(UserAccessRevokeRelay).relay()]);
    const row = await prisma.userAccessRevokeOutbox.findFirstOrThrow();
    expect(row.publishedAt).not.toBeNull();
    expect(row.attempts).toBe(2);
    await restarted.relay();
    expect((await prisma.userAccessRevokeOutbox.findFirstOrThrow()).attempts).toBe(2);
  });

  describe.each(['BLOCK', 'DELETE'] as const)('session races with %s', (action) => {
    it.each(['login', 'refresh', 'google'] as const)(
      'serializes a pending %s behind moderation without issuing a usable session',
      async (kind) => {
        const old = await login();
        if (kind === 'google')
          await prisma.oAuthAccount.create({
            data: { userId, provider: 'google', providerId: 'fixture-google-subject' },
          });
        const locked = barrier();
        const release = barrier();
        const holder = peer.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
          locked.release();
          await release.promise;
        });
        await locked.promise;
        const block = command(action);
        let pending: Promise<request.Response> | undefined;
        try {
          await blockedQueries(1);
          const test =
            kind === 'login'
              ? request(apps[0].getHttpServer())
                  .post('/api/v1/auth/login')
                  .send({ usernameOrEmail: EMAIL, password: PASSWORD })
              : kind === 'google'
                ? request(apps[0].getHttpServer())
                    .post('/api/v1/auth/google/login')
                    .send({ code: 'fixture-code' })
                : request(apps[0].getHttpServer())
                    .post('/api/v1/auth/refresh-token')
                    .set('Cookie', old.refreshCookie);
          pending = test.then((response) => response);
          await blockedQueries(2);
        } finally {
          release.release();
        }
        await holder;
        expect((await block).outcome).toBe(action === 'DELETE' ? 'DELETED' : 'BLOCKED');
        expect((await pending).status).toBe(401);
        expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(0);
      },
    );
  });

  it('disconnects sockets on both Gateways via real revoke fan-out; handshake and delivery deny blocked users', async () => {
    const browser = await login();
    const first = await connect({ access: browser.access });
    const second = await connect({ app: 1, access: browser.access });
    const delivered = socketEvent({ socket: first, name: 'notifications.unseen-count' });
    await apps[0].get(NotificationRealtimePublisher).publishUnseenCount(userId, { unseenCount: 3 });
    expect(await delivered).toEqual({ unseenCount: 3 });
    const disconnected = [first, second].map((socket) =>
      socketEvent({ socket, name: 'disconnect' }),
    );
    await command('BLOCK');
    await apps[0].get(UserAccessRevokeRelay).relay();
    await Promise.all(disconnected);
    expect(first.connected).toBe(false);
    expect(second.connected).toBe(false);
    await expect(connect({ access: browser.access })).rejects.toMatchObject({
      message: 'Unauthorized',
    });
    const row = await prisma.userAccessRevokeOutbox.findFirstOrThrow();
    expect(row.publishedAt).not.toBeNull();
  });

  it('checks every socket session in the same room and fails closed on delivery DB failure', async () => {
    const firstBrowser = await login();
    const secondBrowser = await login();
    const first = await connect({ access: firstBrowser.access });
    const second = await connect({ access: secondBrowser.access });
    const payload = apps[0].get(IJwtService).verifyAccessToken(firstBrowser.access);
    await prisma.session.updateMany({
      where: { deviceId: payload.deviceId },
      data: { deletedAt: new Date(now) },
    });
    const disconnected = socketEvent({ socket: first, name: 'disconnect' });
    const delivered = socketEvent({ socket: second, name: 'notifications.unseen-count' });
    const leak = jest.fn();
    first.on('notifications.unseen-count', leak);
    await apps[0].get(NotificationRealtimePublisher).publishUnseenCount(userId, { unseenCount: 1 });
    await disconnected;
    expect(await delivered).toEqual({ unseenCount: 1 });
    expect(leak).not.toHaveBeenCalled();
    const deniedDelivery = jest.fn();
    second.on('notifications.unseen-count', deniedDelivery);
    const closed = socketEvent({ socket: second, name: 'disconnect' });
    database.sql('ALTER TABLE "Session" RENAME TO "FixtureUnavailableSession"');
    try {
      await apps[0]
        .get(NotificationRealtimePublisher)
        .publishUnseenCount(userId, { unseenCount: 99 });
      await closed;
      expect(deniedDelivery).not.toHaveBeenCalled();
    } finally {
      database.sql('ALTER TABLE "FixtureUnavailableSession" RENAME TO "Session"');
    }
  });

  it('revalidates existing sockets on actual broker reconnect if an ephemeral revoke was missed', async () => {
    const old = await login();
    const socket = await connect({ access: old.access });
    await command('BLOCK'); // Deliberately do NOT relay the outbox event in this fixture.
    const closed = socketEvent({ socket, name: 'disconnect' });
    apps[0].get(AmqpConnection).managedConnection.reconnect();
    await closed;
    expect(socket.connected).toBe(false);
    expect((await prisma.userAccessRevokeOutbox.findFirstOrThrow()).publishedAt).toBeNull();
  });

  it('disconnects orphan sockets even when ordinary logout already physically removed their sessions', async () => {
    const browser = await login();
    const first = await connect({ access: browser.access });
    const second = await connect({ app: 1, access: browser.access });
    await prisma.session.deleteMany({ where: { userId } }); // Isolated fixture of existing logout semantics.
    const closed = [first, second].map((socket) => socketEvent({ socket, name: 'disconnect' }));
    await command('BLOCK');
    expect((await prisma.userAccessRevokeOutbox.findFirstOrThrow()).sessionIds).toEqual([]);
    await apps[0].get(UserAccessRevokeRelay).relay();
    await Promise.all(closed);
  });

  it.each(['BLOCK', 'DELETE'] as const)(
    'persists %s retry through broker outage and publisher restart; duplicate revoke is safe',
    async (action) => {
      const old = await login();
      const oldSocket = await connect({ access: old.access });
      await command(action);
      await command('UNBLOCK');
      // DELETE never restores: for its delayed-event scenario use an independent permitted user.
      if (action === 'DELETE') {
        await prisma.user.create({
          data: { email: 'independent@fixture.test', passwordHash, isConfirmed: true },
        });
      }
      const fresh = await login({
        email: action === 'DELETE' ? 'independent@fixture.test' : EMAIL,
      });
      const freshSocket = await connect({ app: 1, access: fresh.access });
      const oldClosed = socketEvent({ socket: oldSocket, name: 'disconnect' });
      rabbit.pause(); // Actual broker outage: publish cannot obtain a broker confirmation.
      try {
        await apps[0].get(UserAccessRevokeRelay).relay();
      } finally {
        rabbit.resume();
      }
      let row = await prisma.userAccessRevokeOutbox.findFirstOrThrow();
      expect(row.publishedAt).toBeNull();
      expect(row.lastErrorCode).toBe('PUBLISH_FAILED');
      expect(row.attempts).toBe(1);
      const recoveredConnection = await rabbit.connection();
      const restarted = new UserAccessRevokeRelay(peer, recoveredConnection, {
        now: (): Date => new Date(now),
      });
      now = row.availableAt.getTime();
      // A fresh publisher reads the persisted obligation; both real Gateway queues remain independent.
      await Promise.all([restarted.relay(), apps[1].get(UserAccessRevokeRelay).relay()]);
      row = await prisma.userAccessRevokeOutbox.findFirstOrThrow();
      expect(row.publishedAt).not.toBeNull();
      expect(row.attempts).toBe(2);
      const publisher = apps[1].get(NotificationRealtimePublisher);
      const repeated = barrier();
      let calls = 0;
      const disconnect = publisher.disconnectSessions.bind(publisher);
      jest.spyOn(publisher, 'disconnectSessions').mockImplementation(async (input) => {
        await disconnect(input);
        if (++calls >= 2) repeated.release();
      });
      const duplicate = {
        eventId: row.id,
        version: 1,
        eventType: USER_ACCESS_REVOKED_EVENT_TYPE,
        userId,
        sessionIds: row.sessionIds,
        occurredAt: row.createdAt.toISOString(),
      };
      await recoveredConnection.publish(
        COMMON_RABBITMQ_EXCHANGE,
        USER_ACCESS_REVOKED_ROUTING_KEY,
        duplicate,
      );
      await recoveredConnection.publish(
        COMMON_RABBITMQ_EXCHANGE,
        USER_ACCESS_REVOKED_ROUTING_KEY,
        duplicate,
      );
      await repeated.promise;
      const freshUserId = apps[0].get(IJwtService).verifyAccessToken(fresh.access).userId;
      const delivered = socketEvent({ socket: freshSocket, name: 'notifications.unseen-count' });
      await publisher.publishUnseenCount(freshUserId, { unseenCount: 2 });
      expect(await delivered).toEqual({ unseenCount: 2 });
      expect(freshSocket.connected).toBe(true);
      await oldClosed;
    },
  );
});
