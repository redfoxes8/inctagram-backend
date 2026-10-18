import { INestApplication, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import type { Server } from 'node:http';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { buildSchema, printSchema, printType, lexicographicSortSchema } from 'graphql';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { UserStateAuditModule } from '../../src/modules/users/user-state-audit.module';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import { SessionAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/session-admin-principal.verifier';
import { AdminAuthConfig } from '../../src/modules/superadmin/infrastructure/admin-auth.config';
import {
  AdminClock,
  ADMIN_ABSOLUTE_MS,
  ADMIN_IDLE_MS,
  ADMIN_TOUCH_MS,
  ADMIN_LOGIN_WINDOW_MS,
} from '../../src/modules/superadmin/domain/admin-clock';
import {
  AdminSessionRepository,
  AdminLoginRateLimiter,
} from '../../src/modules/superadmin/domain/admin-session.repository';
import { PrismaAdminSessionRepository } from '../../src/modules/superadmin/infrastructure/prisma-admin-session.repository';
import { PrismaAdminLoginRateLimiter } from '../../src/modules/superadmin/infrastructure/prisma-admin-login-rate-limiter';
import { hashAdminToken } from '../../src/modules/superadmin/application/admin-token';
import { AuthController } from '../../src/modules/auth/api/auth.controller';
import { LocalStrategy } from '../../src/common/strategies/local.strategy';
import { JwtStrategy } from '../../src/common/strategies/jwt.strategy';
import { LoginUseCase } from '../../src/modules/auth/application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../src/modules/auth/application/use-cases/refresh-token.use-case';
import { IUsersRepository } from '../../src/modules/users/domain/interfaces/users.repository.interface';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { IProfileRepository } from '../../src/modules/users/domain/interfaces/user-profile.repository.interface';
import { ProfileRepository } from '../../src/modules/users/infrastructure/profile.repository';
import { IPasswordService } from '../../src/modules/users/application/interfaces/password.service.interface';
import { BcryptService } from '../../src/modules/users/infrastructure/password.service';
import { ISessionsRepository } from '../../src/modules/sessions/domain/interfaces/sessions.repository.interface';
import { PrismaSessionsRepository } from '../../src/modules/sessions/infrastructure/sessions.repository';
import { IJwtService } from '../../src/modules/auth/application/interfaces/jwt.service.interface';
import { JwtServiceImplementation } from '../../src/modules/auth/infrastructure/jwt.service';
import { GatewayConfig } from '../../src/core/gateway.config';
import { CoreConfig } from '../../../../libs/common/src/core.config';
import { SUPERADMIN_AUTH_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/auth-type-defs';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { setupSuperadminHttp } from '../../src/modules/superadmin/api/superadmin-http-security';

const ORIGIN = 'https://admin.frontend.example.test';
const PATH = '/api/v1/graphql';
const EMAIL = 'fixture-admin@example.test';
const PASSWORD = 'isolated-auth-fixture-only';
const LOGIN =
  'mutation Login($input: SuperadminLoginInput!) { superadminLogin(input: $input) { authenticated } }';
const SESSION = '{ superadminSession { authenticated } }';
const LOGOUT = 'mutation { superadminLogout { loggedOut } }';
const INITIAL_TIME = Date.parse('2026-10-18T12:00:00.000Z');

type Browser = { cookie: string; token: string; nonce: string };

@Module({
  imports: [
    UserStateAuditModule,
    CqrsModule,
    PassportModule,
    JwtModule.register({ secret: 'isolated-user-jwt-fixture-only' }),
    GoogleRecaptchaModule.forRoot({
      secretKey: 'isolated-unused-fixture',
      response: (): string => '',
      skipIf: true,
    }),
    SuperadminModule.withRuntime({
      typeDefs: SUPERADMIN_AUTH_TYPE_DEFS,
      production: true,
      imports: [SuperadminAuthModule],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LocalStrategy,
    JwtStrategy,
    LoginUseCase,
    RefreshTokenUseCase,
    { provide: IUsersRepository, useClass: PrismaUsersRepository },
    { provide: IProfileRepository, useClass: ProfileRepository },
    { provide: IPasswordService, useClass: BcryptService },
    { provide: ISessionsRepository, useClass: PrismaSessionsRepository },
    { provide: IJwtService, useClass: JwtServiceImplementation },
    { provide: CoreConfig, useValue: { env: 'test' } },
    {
      provide: GatewayConfig,
      useValue: {
        jwtSecret: 'isolated-user-jwt-fixture-only',
        accessTokenExpTime: 60,
        refreshTokenExpTime: 120,
      },
    },
  ],
})
class AdminFixtureModule {}

function browser(response: request.Response): Browser {
  const header = response.headers['set-cookie'] as unknown as string[];
  const cookies = header.map((value) => value.split(';')[0]);
  const token =
    cookies.find((value) => value.startsWith('superadminSession='))?.split('=')[1] ?? '';
  return {
    cookie: cookies.join('; '),
    token,
    nonce: String(response.headers['x-superadmin-csrf']),
  };
}

describe('SA-GQL-02 HTTP + real isolated PostgreSQL', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let peerPrisma: PrismaService;
  let app: INestApplication<Server>;
  let peer: INestApplication<Server>;
  let now = INITIAL_TIME;
  let passwordHash: string;
  const clock = { now: (): Date => new Date(now) };
  const apps: INestApplication<Server>[] = [];

  async function createApp(
    config: { enabled?: boolean; sameSite?: string; production?: boolean } = {},
  ): Promise<INestApplication<Server>> {
    const connection = apps.length === 0 ? prisma : peerPrisma;
    const module = await Test.createTestingModule({ imports: [AdminFixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(connection)
      .overrideProvider(AdminClock)
      .useValue(clock)
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          NODE_ENV: config.production ? 'production' : 'test',
          SUPERADMIN_EMAIL: config.enabled === false ? '' : EMAIL,
          SUPERADMIN_PASSWORD_HASH: config.enabled === false ? '' : passwordHash,
          SUPERADMIN_COOKIE_SAME_SITE: config.sameSite ?? 'lax',
        }),
      )
      .compile();
    const application: INestApplication<Server> = module.createNestApplication();
    setupSuperadminHttp({ app: application, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(application, AdminFixtureModule, {
      httpConfig: {
        enabled: true,
        enableGlobalPrefix: true,
        enableCookies: true,
        enableCors: true,
        corsOptions: {
          origin: ['https://main.example.test'],
          credentials: true,
          exposedHeaders: ['X-Superadmin-CSRF'],
        },
      },
    });
    await application.init();
    apps.push(application);
    return application;
  }

  function post(input: {
    query: string;
    browser?: Browser;
    target?: INestApplication<Server>;
    variables?: object;
    csrf?: boolean;
  }): request.Test {
    let test = request((input.target ?? app).getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .send({ query: input.query, variables: input.variables });
    if (input.browser) {
      test = test.set('Cookie', input.browser.cookie);
      if (input.csrf !== false) test = test.set('X-Superadmin-CSRF', input.browser.nonce);
    }
    return test;
  }

  function login(
    input: {
      previous?: Browser;
      email?: string;
      password?: string;
      target?: INestApplication<Server>;
    } = {},
  ): request.Test {
    return post({
      query: LOGIN,
      browser: input.previous,
      target: input.target,
      variables: { input: { email: input.email ?? EMAIL, password: input.password ?? PASSWORD } },
    });
  }

  beforeAll(async (): Promise<void> => {
    try {
      await database.start();
      prisma = database.client();
      peerPrisma = database.client();
      passwordHash = await bcrypt.hash(PASSWORD, 10);
      app = await createApp();
      peer = await createApp();
    } catch (error) {
      await Promise.all(apps.map((application) => application.close()));
      await database.stop();
      throw error;
    }
  });

  beforeEach(async (): Promise<void> => {
    now = INITIAL_TIME;
    await prisma.adminSession.deleteMany();
    await prisma.adminLoginRateLimit.deleteMany();
  });

  afterAll(async (): Promise<void> => {
    await Promise.all(apps.map((application) => application.close()));
    await database.stop();
  });

  it('applies migration over the existing schema without changing an existing User', async (): Promise<void> => {
    expect(
      await prisma.user.findUnique({ where: { id: 'migration-preserved-user' } }),
    ).toMatchObject({ email: 'preserved@example.test', isConfirmed: false });
    const columns = await prisma.$queryRaw<
      { column_name: string }[]
    >`SELECT column_name FROM information_schema.columns WHERE table_name = 'AdminSession' ORDER BY ordinal_position`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'tokenHash',
      'createdAt',
      'lastSeenAt',
      'idleExpiresAt',
      'absoluteExpiresAt',
      'revokedAt',
    ]);
    expect(await prisma.session.count()).toBe(0);
  });

  it('logs in without session/nonce, stores only a digest and issues separate cookies', async (): Promise<void> => {
    const result = await login({ email: '  FIXTURE-ADMIN@EXAMPLE.TEST  ' });
    expect(result.body).toEqual({ data: { superadminLogin: { authenticated: true } } });
    const current = browser(result);
    expect(Buffer.from(current.token, 'base64url')).toHaveLength(32);
    expect(current.nonce).not.toBe(current.token);
    const record = await prisma.adminSession.findFirstOrThrow();
    expect(record.tokenHash).toBe(hashAdminToken(current.token));
    expect(record.tokenHash).not.toBe(current.token);
    expect(record.idleExpiresAt.getTime() - record.createdAt.getTime()).toBe(ADMIN_IDLE_MS);
    expect(record.absoluteExpiresAt.getTime() - record.createdAt.getTime()).toBe(ADMIN_ABSOLUTE_MS);
    for (const cookie of result.headers['set-cookie'] as unknown as string[]) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/graphql');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toMatch(/Domain=|refreshToken/);
    }
    expect((result.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=28800');
    expect(JSON.stringify(result.body)).not.toMatch(/token|cookie|hash|password/i);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(result.headers['access-control-expose-headers']).toContain('X-Superadmin-CSRF');
  });

  it('uses indistinguishable safe errors for wrong email/password; missing config closes only login', async (): Promise<void> => {
    const wrongEmail = await login({ email: 'wrong@example.test' });
    const wrongPassword = await login({ password: 'wrong-fixture-only' });
    expect(wrongEmail.body).toEqual(wrongPassword.body);
    expect(wrongEmail.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(await prisma.adminSession.count()).toBe(0);
    const disabled = await createApp({ enabled: false });
    const result = await login({ target: disabled });
    expect(result.body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(
      (await post({ query: LOGOUT, target: disabled })).body.data.superadminLogout.loggedOut,
    ).toBe(true);
    for (const config of [
      {},
      { SUPERADMIN_EMAIL: EMAIL, SUPERADMIN_PASSWORD_HASH: 'malformed' },
      {
        SUPERADMIN_EMAIL: EMAIL,
        SUPERADMIN_PASSWORD_HASH: passwordHash,
        SUPERADMIN_COOKIE_SAME_SITE: 'invalid',
      },
    ]) {
      expect(new AdminAuthConfig(new ConfigService(config)).enabled).toBe(false);
    }
  });

  it('guards the real session query, ignores JWT, and boots CSRF after a reload across origins', async (): Promise<void> => {
    expect((await post({ query: SESSION })).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(
      (
        await post({ query: SESSION })
          .set('Authorization', 'Bearer ordinary-user-jwt')
          .set('Cookie', 'refreshToken=ordinary-refresh')
      ).body.errors[0].extensions.code,
    ).toBe('UNAUTHENTICATED');
    const current = browser(await login());
    const reloaded = await post({ query: SESSION, browser: current, target: peer, csrf: false });
    expect(reloaded.body).toEqual({ data: { superadminSession: { authenticated: true } } });
    expect(reloaded.headers['x-superadmin-csrf']).toBeDefined();
    const newNonce = String(reloaded.headers['x-superadmin-csrf']);
    expect(newNonce).not.toBe(current.nonce);
    const reloadedBrowser = {
      ...current,
      nonce: newNonce,
      cookie: `superadminSession=${current.token}; superadminCsrf=${newNonce}`,
    };
    expect(
      (await post({ query: LOGOUT, browser: reloadedBrowser })).body.data.superadminLogout
        .loggedOut,
    ).toBe(true);
  });

  it('requires CSRF for active logout and revokes only that browser; repeat logout clears safely', async (): Promise<void> => {
    const first = browser(await login());
    const second = browser(await login());
    const refused = await post({ query: LOGOUT, browser: first, csrf: false });
    expect(refused.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(
      (await post({ query: SESSION, browser: first })).body.data.superadminSession.authenticated,
    ).toBe(true);
    const loggedOut = await post({ query: LOGOUT, browser: first });
    expect(loggedOut.body).toEqual({ data: { superadminLogout: { loggedOut: true } } });
    for (const cookie of loggedOut.headers['set-cookie'] as unknown as string[])
      expect(cookie).toMatch(/Path=\/api\/v1\/graphql; Expires=Thu, 01 Jan 1970/);
    expect((await post({ query: SESSION, browser: first })).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(
      (await post({ query: SESSION, browser: second })).body.data.superadminSession.authenticated,
    ).toBe(true);
    for (const old of [
      first,
      undefined,
      { ...first, token: 'malformed', cookie: 'superadminSession=malformed' },
    ]) {
      expect(
        (await post({ query: LOGOUT, browser: old, csrf: false })).body.data.superadminLogout
          .loggedOut,
      ).toBe(true);
    }
  });

  it('replaces only the presented session in one transaction and old cookie cannot authenticate', async (): Promise<void> => {
    const first = browser(await login());
    const otherBrowser = browser(await login());
    expect(
      (await login({ previous: first, password: 'wrong-fixture-only' })).body.errors[0].extensions
        .code,
    ).toBe('UNAUTHENTICATED');
    expect(
      (await post({ query: SESSION, browser: first })).body.data.superadminSession.authenticated,
    ).toBe(true);
    const replacement = browser(await login({ previous: first }));
    expect(replacement.token).not.toBe(first.token);
    expect(
      (
        await prisma.adminSession.findUniqueOrThrow({
          where: { tokenHash: hashAdminToken(first.token) },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect((await post({ query: SESSION, browser: first })).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    for (const current of [replacement, otherBrowser])
      expect(
        (await post({ query: SESSION, browser: current, target: peer })).body.data.superadminSession
          .authenticated,
      ).toBe(true);
    const repository = new PrismaAdminSessionRepository(prisma);
    const duplicate = await prisma.adminSession.findUniqueOrThrow({
      where: { tokenHash: hashAdminToken(replacement.token) },
    });
    await expect(
      repository.replace({
        session: { ...duplicate, id: randomUUID() },
        previousTokenHash: hashAdminToken(otherBrowser.token),
      }),
    ).rejects.toMatchObject({ code: 503 });
    expect(
      (
        await prisma.adminSession.findUniqueOrThrow({
          where: { tokenHash: hashAdminToken(otherBrowser.token) },
        })
      ).revokedAt,
    ).toBeNull();
  });

  it('enforces exact idle/absolute boundaries and caps touches at one per minute', async (): Promise<void> => {
    const current = browser(await login());
    const where = { tokenHash: hashAdminToken(current.token) };
    now += ADMIN_TOUCH_MS - 1;
    await post({ query: SESSION, browser: current });
    expect((await prisma.adminSession.findUniqueOrThrow({ where })).lastSeenAt.getTime()).toBe(
      INITIAL_TIME,
    );
    now++;
    const updates = jest.spyOn(prisma.adminSession, 'updateMany');
    await post({
      query: '{ a:superadminSession { authenticated } b:superadminSession { authenticated } }',
      browser: current,
    });
    const aliased = await post({
      query: '{ a:superadminSession { authenticated } b:superadminSession { authenticated } }',
      browser: current,
    });
    expect(aliased.headers['set-cookie']).toHaveLength(1);
    expect((await prisma.adminSession.findUniqueOrThrow({ where })).lastSeenAt.getTime()).toBe(now);
    // Parallel roots can attempt conditional writes, but only one persisted touch wins.
    const count = updates.mock.calls.length;
    await post({ query: SESSION, browser: current });
    expect(updates).toHaveBeenCalledTimes(count);
    updates.mockRestore();
    now += ADMIN_IDLE_MS;
    expect((await post({ query: SESSION, browser: current })).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(
      (await post({ query: LOGOUT, browser: current, csrf: false })).body.data.superadminLogout
        .loggedOut,
    ).toBe(true);
    now = INITIAL_TIME;
    const absolute = browser(await login());
    const absoluteWhere = { tokenHash: hashAdminToken(absolute.token) };
    // Simulate continuous valid activity without waiting eight hours.
    for (
      now = INITIAL_TIME + 20 * 60 * 1000;
      now < INITIAL_TIME + ADMIN_ABSOLUTE_MS;
      now += 20 * 60 * 1000
    ) {
      expect(
        (await post({ query: SESSION, browser: absolute })).body.data.superadminSession
          .authenticated,
      ).toBe(true);
    }
    now = INITIAL_TIME + ADMIN_ABSOLUTE_MS - 1;
    expect(
      (await post({ query: SESSION, browser: absolute })).body.data.superadminSession.authenticated,
    ).toBe(true);
    const beforeExpiry = await prisma.adminSession.findUniqueOrThrow({ where: absoluteWhere });
    expect(beforeExpiry.idleExpiresAt.getTime()).toBe(INITIAL_TIME + ADMIN_ABSOLUTE_MS);
    expect(beforeExpiry.absoluteExpiresAt.getTime()).toBe(INITIAL_TIME + ADMIN_ABSOLUTE_MS);
    now++;
    expect((await post({ query: SESSION, browser: absolute })).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('cannot resurrect a revoked session during concurrent touch/logout', async (): Promise<void> => {
    const current = browser(await login());
    now += ADMIN_TOUCH_MS;
    await Promise.all([
      post({ query: SESSION, browser: current }),
      post({ query: LOGOUT, browser: current, target: peer }),
    ]);
    const after = await prisma.adminSession.findUniqueOrThrow({
      where: { tokenHash: hashAdminToken(current.token) },
    });
    expect(after.revokedAt).not.toBeNull();
    expect((await post({ query: SESSION, browser: current })).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(
      (await prisma.adminSession.findUniqueOrThrow({ where: { id: after.id } })).revokedAt,
    ).toEqual(after.revokedAt);
  });

  it('loses a deterministic touch/revoke race without clearing revokedAt or granting access', async (): Promise<void> => {
    const current = browser(await login());
    now += ADMIN_TOUCH_MS;
    const update = prisma.adminSession.updateMany.bind(prisma.adminSession);
    const peerRepository = new PrismaAdminSessionRepository(peerPrisma);
    const spy = jest
      .spyOn(prisma.adminSession, 'updateMany')
      .mockImplementationOnce((input): ReturnType<typeof prisma.adminSession.updateMany> => {
        const pending = peerRepository
          .revoke({ tokenHash: hashAdminToken(current.token), now: clock.now() })
          .then(() => update(input));
        return Object.defineProperty(pending, Symbol.toStringTag, {
          value: 'PrismaPromise',
        }) as ReturnType<typeof prisma.adminSession.updateMany>;
      });
    try {
      expect(
        (await post({ query: SESSION, browser: current })).body.errors[0].extensions.code,
      ).toBe('UNAUTHENTICATED');
      const record = await prisma.adminSession.findUniqueOrThrow({
        where: { tokenHash: hashAdminToken(current.token) },
      });
      expect(record.revokedAt?.getTime()).toBe(now);
      expect(record.lastSeenAt.getTime()).toBe(INITIAL_TIME);
    } finally {
      spy.mockRestore();
    }
  });

  it('preserves ordinary user login/refresh cookies and REST errors with admin GraphQL enabled', async (): Promise<void> => {
    const userPassword = 'FixtureUser@2026';
    const user = await prisma.user.create({
      data: {
        email: 'user-fixture@example.test',
        passwordHash: await bcrypt.hash(userPassword, 10),
        isConfirmed: true,
      },
    });
    try {
      const loggedIn = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ usernameOrEmail: user.email, password: userPassword });
      expect(loggedIn.status).toBe(200);
      expect(loggedIn.body).toEqual({ accessToken: expect.any(String) });
      const refreshCookies = loggedIn.headers['set-cookie'] as unknown as string[];
      expect(refreshCookies).toHaveLength(1);
      expect(refreshCookies[0]).toMatch(/^refreshToken=/);
      expect(refreshCookies[0]).toContain('HttpOnly');
      expect(refreshCookies[0]).toContain('Secure');
      expect(refreshCookies[0]).toContain('SameSite=None');
      expect(refreshCookies[0]).not.toContain('superadmin');
      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh-token')
        .set('Cookie', refreshCookies[0].split(';')[0]);
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      const tokens = app.get(IJwtService);
      expect(tokens.verifyAccessToken(String(refreshed.body.accessToken)).userId).toBe(user.id);
      expect(
        (
          await post({ query: SESSION }).set(
            'Authorization',
            `Bearer ${String(refreshed.body.accessToken)}`,
          )
        ).body.errors[0].extensions.code,
      ).toBe('UNAUTHENTICATED');
      const badLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ usernameOrEmail: user.email, password: 'wrong-fixture' });
      expect(badLogin.status).toBe(401);
      expect(badLogin.body).toEqual({ code: 401, message: 'Invalid credentials', extensions: [] });
      const configDisabled = await createApp({ enabled: false });
      expect(
        (
          await request(configDisabled.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ usernameOrEmail: user.email, password: userPassword })
        ).status,
      ).toBe(200);
      const missingRefresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh-token')
        .send({});
      expect(missingRefresh.status).toBe(401);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('shares the 5-attempt sliding window between two Gateway instances and ignores forged proxy IP', async (): Promise<void> => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        login({ password: 'wrong-fixture-only', target: index % 2 ? app : peer }).set(
          'X-Forwarded-For',
          `192.0.2.${index}`,
        ),
      ),
    );
    expect(
      results.filter((result) => result.body.errors[0].extensions.code === 'UNAUTHENTICATED'),
    ).toHaveLength(5);
    expect(
      results.filter((result) => result.body.errors[0].extensions.code === 'TOO_MANY_REQUESTS'),
    ).toHaveLength(3);
    expect(await prisma.adminSession.count()).toBe(0);
    expect(await prisma.adminLoginRateLimit.count()).toBe(1);
    expect((await prisma.adminLoginRateLimit.findFirstOrThrow()).attempts).toHaveLength(5);
    now += ADMIN_LOGIN_WINDOW_MS - 1;
    expect((await login()).body.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
    now++;
    expect((await login({ target: peer })).body.data.superadminLogin.authenticated).toBe(true);
  });

  it('rate-limits normalized account keys consistently across instances', async (): Promise<void> => {
    const first = new PrismaAdminLoginRateLimiter(prisma);
    const second = new PrismaAdminLoginRateLimiter(peerPrisma);
    const keyHash = hashAdminToken('fixture-rate-key');
    const allowed = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? first : second).consume({ keyHash, now: clock.now() }),
      ),
    );
    expect(allowed.filter(Boolean)).toHaveLength(5);
    const result = await login({
      email: '  FIXTURE-ADMIN@EXAMPLE.TEST ',
      password: 'wrong-fixture-only',
    });
    expect(result.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    for (let attempt = 0; attempt < 4; attempt++)
      await login({ password: 'wrong-fixture-only', target: peer });
    expect((await login()).body.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
  });

  it('fails closed on real storage outages, including verifier, login rate storage and revoke', async (): Promise<void> => {
    const current = browser(await login());
    database.sql('ALTER TABLE "AdminLoginRateLimit" RENAME TO "UnavailableAdminLoginRateLimit";');
    try {
      const result = await login();
      expect(result.body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(result.headers['set-cookie']).toBeUndefined();
    } finally {
      database.sql('ALTER TABLE "UnavailableAdminLoginRateLimit" RENAME TO "AdminLoginRateLimit";');
    }
    database.sql('ALTER TABLE "AdminSession" RENAME TO "UnavailableAdminSession";');
    try {
      for (const query of [SESSION, LOGOUT]) {
        const result = await post({ query, browser: current });
        expect(result.body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
        expect(result.headers['set-cookie']).toBeUndefined();
      }
      expect((await login()).body.errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
    } finally {
      database.sql('ALTER TABLE "UnavailableAdminSession" RENAME TO "AdminSession";');
    }
    const revoke = jest
      .spyOn(app.get(AdminSessionRepository), 'revoke')
      .mockRejectedValueOnce(new Error('private-db-revoke'));
    const failed = await post({ query: LOGOUT, browser: current });
    expect(failed.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(failed.headers['set-cookie']).toBeUndefined();
    revoke.mockRestore();
    expect(
      (await post({ query: SESSION, browser: current })).body.data.superadminSession.authenticated,
    ).toBe(true);
  });

  it('validates inputs and masks credentials, cookies, upstream messages and stacks in errors/logs', async (): Promise<void> => {
    const errors = jest.spyOn(Logger.prototype, 'error');
    for (const input of [
      { email: 'invalid', password: PASSWORD },
      { email: EMAIL, password: '' },
      { email: EMAIL, password: 'x'.repeat(73) },
    ]) {
      expect(
        (await post({ query: LOGIN, variables: { input } })).body.errors[0].extensions.code,
      ).toBe('BAD_USER_INPUT');
    }
    const limiter = jest
      .spyOn(app.get(AdminLoginRateLimiter), 'consume')
      .mockRejectedValueOnce(new Error(`private ${PASSWORD} ${passwordHash}`));
    const result = await login();
    expect(result.body.errors[0].extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
    expect(JSON.stringify(result.body) + JSON.stringify(errors.mock.calls)).not.toContain(PASSWORD);
    expect(JSON.stringify(result.body) + JSON.stringify(errors.mock.calls)).not.toContain(
      passwordHash,
    );
    expect(JSON.stringify(result.body)).not.toMatch(/stacktrace|cookie|tokenHash|private/);
    limiter.mockRestore();
    errors.mockRestore();
  });

  it('sets Secure in production and for cross-site None, with matching cookie clearing', async (): Promise<void> => {
    for (const config of [{ production: true }, { sameSite: 'none' }]) {
      const target = await createApp(config);
      const result = await login({ target });
      const cookies = result.headers['set-cookie'] as unknown as string[];
      for (const cookie of cookies) expect(cookie).toContain('Secure');
      expect(cookies[0]).toContain(config.sameSite === 'none' ? 'SameSite=None' : 'SameSite=Lax');
      const loggedOut = await post({ query: LOGOUT, browser: browser(result), target });
      for (const cookie of loggedOut.headers['set-cookie'] as unknown as string[]) {
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Path=/api/v1/graphql');
      }
    }
  });

  it('preserves Origin/JSON/CORS boundaries and publishes exactly the three implemented operations', async (): Promise<void> => {
    const preflight = await request(app.getHttpServer())
      .options(PATH)
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Headers', 'Content-Type,X-Superadmin-CSRF');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    expect(preflight.headers['access-control-allow-headers']).toContain('X-Superadmin-CSRF');
    for (const origin of ['', 'https://untrusted.example.test']) {
      expect(
        (await request(app.getHttpServer()).post(PATH).set('Origin', origin).send({ query: LOGIN }))
          .status,
      ).toBe(403);
    }
    expect(
      (
        await request(app.getHttpServer())
          .post(PATH)
          .set('Origin', ORIGIN)
          .type('form')
          .send({ query: LOGOUT })
      ).status,
    ).toBe(415);
    expect(
      (await request(app.getHttpServer()).post('/api/v1/api/v1/graphql').send({ query: SESSION }))
        .status,
    ).toBe(404);
    const schema = app.get(GraphQLSchemaHost).schema;
    expect(Object.keys(schema.getQueryType()!.getFields())).toEqual(['superadminSession']);
    expect(Object.keys(schema.getMutationType()!.getFields()).sort()).toEqual([
      'superadminLogin',
      'superadminLogout',
    ]);
    const target = buildSchema(
      readFileSync(
        join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/target.graphql'),
        'utf8',
      ),
    );
    for (const name of [
      'SuperadminLoginInput',
      'SuperadminSessionPayload',
      'SuperadminLoginPayload',
      'SuperadminLogoutPayload',
    ]) {
      expect(printType(schema.getType(name)!)).toBe(printType(target.getType(name)!));
    }
    expect(printSchema(lexicographicSortSchema(schema))).not.toMatch(
      /SuperadminUser|PaymentConnection|Following|Followers/,
    );
    expect(
      (await post({ query: '{ __schema { queryType { name } } }' })).body.errors,
    ).toBeDefined();
    expect(
      (await post({ query: '{ superadminUsers(input:{}) { totalCount } }' })).body.errors[0]
        .extensions.code,
    ).toBe('GRAPHQL_VALIDATION_FAILED');
  });
});
