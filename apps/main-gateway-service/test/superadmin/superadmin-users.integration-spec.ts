import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { SuperadminUsersModule } from '../../src/modules/superadmin/superadmin-users.module';
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
const DETAIL = `query($userId: ID!) { superadminUser(userId: $userId) {
  userId username avatarUrl profileUrl createdAt state isEmailConfirmed
} }`;

@Module({
  imports: [
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
})
class CatalogueFixtureModule {}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('SA-GQL-03 real isolated PostgreSQL + GraphQL HTTP', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let peer: PrismaService;
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
    peer = database.client();
    const module = await Test.createTestingModule({ imports: [CatalogueFixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(NOW) })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ NODE_ENV: 'test' }))
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, CatalogueFixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    await app.init();
  });

  beforeEach(async () => {
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

  it('defaults to newest eight, includes blocked/unconfirmed/profileless and excludes deleted', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 10; index++)
      ids.push(await fixture({ time: NOW + index, banned: index === 9 }));
    await fixture({ username: 'deleted', deleted: true, time: NOW + 100 });
    const response = await post({});
    expect(response.body.errors).toBeUndefined();
    const page = response.body.data.superadminUsers;
    expect(page.items.map((item: { userId: string }) => item.userId)).toEqual(
      ids.slice(2).reverse(),
    );
    expect(page).toMatchObject({
      totalCount: 10,
      pageInfo: { page: 1, pageSize: 8, pagesCount: 2, hasNextPage: true },
    });
    expect(page.items[0]).toMatchObject({
      username: null,
      profileUrl: null,
      state: 'BLOCKED',
      isEmailConfirmed: false,
    });
    expect(page.items[1].state).toBe('ACTIVE');
  });

  it('returns nullable profile fields without creating a Profile, and hides deleted/missing details', async () => {
    const id = await fixture();
    const deleted = await fixture({ deleted: true, banned: true });
    const profiled = await fixture({ username: 'confirmed', confirmed: true, banned: true });
    expect(
      (await post({ query: DETAIL, variables: { userId: id } })).body.data.superadminUser,
    ).toMatchObject({
      userId: id,
      username: null,
      avatarUrl: null,
      profileUrl: null,
      state: 'ACTIVE',
      isEmailConfirmed: false,
    });
    expect(
      (await post({ query: DETAIL, variables: { userId: profiled } })).body.data.superadminUser,
    ).toMatchObject({
      username: 'confirmed',
      avatarUrl: 'https://files.example.test/avatar.jpg',
      state: 'BLOCKED',
      isEmailConfirmed: true,
    });
    for (const userId of [deleted, randomUUID()]) {
      expect(
        (await post({ query: DETAIL, variables: { userId } })).body.data.superadminUser,
      ).toBeNull();
    }
    expect(
      (await post({ query: DETAIL, variables: { userId: 'not-a-uuid' } })).body.errors[0].extensions
        .code,
    ).toBe('BAD_USER_INPUT');
    expect(await prisma.profile.count()).toBe(1);
  });

  it('normalizes substring search before filtering/count/pagination; limits normalized length', async () => {
    await fixture({ username: 'FirstALphaLast' });
    await fixture();
    await fixture({ username: 'other' });
    const matched = await post({
      variables: { input: { searchUsername: '  aLpHa  ', pageSize: 1 } },
    });
    expect(matched.body.data.superadminUsers.totalCount).toBe(1);
    expect(matched.body.data.superadminUsers.items[0].username).toBe('FirstALphaLast');
    expect(
      (await post({ variables: { input: { searchUsername: '   ' } } })).body.data.superadminUsers
        .totalCount,
    ).toBe(3);
    expect(
      (await post({ variables: { input: { searchUsername: null } } })).body.data.superadminUsers
        .totalCount,
    ).toBe(3);
    expect(
      (await post({ variables: { input: { searchUsername: ` ${'x'.repeat(100)} ` } } })).body
        .errors,
    ).toBeUndefined();
    expect(
      (await post({ variables: { input: { searchUsername: 'x'.repeat(101) } } })).body.errors[0]
        .extensions.code,
    ).toBe('BAD_USER_INPUT');
  });

  it.each(['%', '_', '\\', "'", "' OR 1=1 --"])(
    'treats search %s as literal text, not SQL/wildcards',
    async (text) => {
      await fixture({ username: `before${text}after` });
      await fixture({ username: 'unrelated' });
      const result = await post({ variables: { input: { searchUsername: text } } });
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.superadminUsers.totalCount).toBe(1);
      expect(result.body.data.superadminUsers.items[0].username).toBe(`before${text}after`);
    },
  );

  it('sorts all four ways in DB, ID ties follow direction and NULL username is always last', async () => {
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
    ];
    await fixture({ id: ids[0], username: 'alpha' });
    await fixture({ id: ids[1], username: 'zulu' });
    await fixture({ id: ids[2] });
    await fixture({ id: ids[3] });
    const orders: Record<string, string[]> = {
      USERNAME_ASC: ids,
      USERNAME_DESC: [ids[1], ids[0], ids[3], ids[2]],
      CREATED_AT_ASC: ids,
      CREATED_AT_DESC: [...ids].reverse(),
    };
    for (const [sort, expected] of Object.entries(orders)) {
      const response = await post({ variables: { input: { sort } } });
      expect(response.body.errors).toBeUndefined();
      expect(
        response.body.data.superadminUsers.items.map((item: { userId: string }) => item.userId),
      ).toEqual(expected);
    }
    const locale = await prisma.$queryRaw<{ collate: string; ctype: string }[]>`
      SELECT datcollate AS collate, datctype AS ctype FROM pg_database WHERE datname = current_database()`;
    console.info('Isolated catalogue DB locale:', locale[0]);
    expect(locale[0].collate).toBeTruthy();
    // Non-null username is UNIQUE; repeated nullable keys above exercise its actual possible ties.
  });

  it('validates pagination and enum values, preserves empty/out-of-range metadata', async () => {
    for (const input of [
      { page: 0 },
      { page: 10001 },
      { pageSize: 0 },
      { pageSize: 51 },
      { page: 1.5 },
      { sort: 'INVALID' },
    ]) {
      expect((await post({ variables: { input } })).body.errors[0].extensions.code).toBe(
        'BAD_USER_INPUT',
      );
    }
    expect((await post({})).body.data.superadminUsers).toMatchObject({
      items: [],
      totalCount: 0,
      pageInfo: { pagesCount: 0, hasNextPage: false },
    });
    await fixture();
    const result = await post({ variables: { input: { page: 10000, pageSize: 1 } } });
    expect(result.body.data.superadminUsers).toMatchObject({
      items: [],
      totalCount: 1,
      pageInfo: { pagesCount: 1, hasNextPage: false },
    });
    const minimal =
      'query($input: SuperadminUsersInput!) { superadminUsers(input: $input) { items { userId } } }';
    expect(
      (await post({ query: minimal, variables: { input: { pageSize: 50 } } })).body.errors,
    ).toBeUndefined();
  });

  it('uses one joined SQL statement regardless of page size, reads do not mutate domain data', async () => {
    await fixture({ username: 'one' });
    const query = jest.spyOn(prisma, '$queryRaw');
    const before = {
      users: await prisma.user.findMany(),
      profiles: await prisma.profile.findMany(),
      sessions: await prisma.session.findMany(),
      audit: await prisma.adminUserActionAudit.findMany(),
    };
    await post({});
    expect(query).toHaveBeenCalledTimes(1);
    query.mockClear();
    for (let index = 0; index < 7; index++) await fixture({ username: `next${index}` });
    const allUsers = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const allProfiles = await prisma.profile.findMany({ orderBy: { id: 'asc' } });
    await post({});
    expect(query).toHaveBeenCalledTimes(1);
    query.mockClear();
    await post({ query: DETAIL, variables: { userId: before.users[0].id } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(await prisma.user.findUnique({ where: { id: before.users[0].id } })).toEqual(
      before.users[0],
    );
    expect(await prisma.profile.findMany({ where: { userId: before.users[0].id } })).toEqual(
      before.profiles,
    );
    expect(await prisma.session.findMany()).toEqual(before.sessions);
    expect(await prisma.adminUserActionAudit.findMany()).toEqual(before.audit);
    expect(await prisma.user.findMany({ orderBy: { id: 'asc' } })).toEqual(allUsers);
    expect(await prisma.profile.findMany({ orderBy: { id: 'asc' } })).toEqual(allProfiles);
    query.mockRestore();
  });

  it('rejects missing/ordinary JWT/expired/revoked sessions, including aliases and fragments; queries need no CSRF', async () => {
    const query =
      'query { alias: superadminUsers(input: {}) { ...Rows } } fragment Rows on SuperadminUsersPage { items { userId } }';
    for (const cookie of ['', 'refreshToken=ordinary-user-jwt']) {
      const response = await post({ query, cookie });
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    }
    const userJwt = new JwtService({ secret: 'isolated-user-fixture-only' }).sign({
      userId: randomUUID(),
      tokenType: 'access',
    });
    expect(
      (await post({ query, cookie: '' }).set('Authorization', `Bearer ${userJwt}`)).body.errors[0]
        .extensions.code,
    ).toBe('UNAUTHENTICATED');
    expect(
      (await post({ query: DETAIL, variables: { userId: randomUUID() }, cookie: '' })).body
        .errors[0].extensions.code,
    ).toBe('UNAUTHENTICATED');
    expect((await post({ query })).body.errors).toBeUndefined();
    await prisma.adminSession.updateMany({
      data: {
        createdAt: new Date(NOW - ADMIN_IDLE_MS),
        lastSeenAt: new Date(NOW - ADMIN_IDLE_MS),
        idleExpiresAt: new Date(NOW),
      },
    });
    expect((await post({})).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    await prisma.adminSession.updateMany({
      data: { idleExpiresAt: new Date(NOW + ADMIN_IDLE_MS), revokedAt: new Date(NOW) },
    });
    expect(
      (await post({ query: DETAIL, variables: { userId: randomUUID() } })).body.errors[0].extensions
        .code,
    ).toBe('UNAUTHENTICATED');
  });

  it('publishes only auth/catalogue fields and keeps secrets out of outputs', async () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    expect(Object.keys(schema.getQueryType()!.getFields()).sort()).toEqual([
      'superadminSession',
      'superadminUser',
      'superadminUsers',
    ]);
    expect(Object.keys(schema.getMutationType()!.getFields()).sort()).toEqual([
      'superadminBlockUser',
      'superadminDeleteUser',
      'superadminLogin',
      'superadminLogout',
      'superadminUnblockUser',
    ]);
    const response = await post({
      query: '{ __type(name: "SuperadminUser") { fields { name } } }',
    });
    expect(response.body.errors).toBeDefined(); // Production introspection remains disabled.
    const type = schema.getType('SuperadminUser');
    expect(type && 'getFields' in type && Object.keys(type.getFields()).sort()).toEqual([
      'avatarUrl',
      'createdAt',
      'isEmailConfirmed',
      'profileUrl',
      'state',
      'userId',
      'username',
    ]);
    await fixture({ username: 'visible' });
    expect(JSON.stringify((await post({})).body)).not.toMatch(
      /passwordHash|never-return|@fixture|tokenHash|revokedAt/,
    );
  });

  it('maps DB failures safely instead of returning an empty list or missing user', async () => {
    database.sql('ALTER TABLE "Profile" RENAME TO "UnavailableProfile"');
    try {
      for (const input of [{}, { query: DETAIL, variables: { userId: randomUUID() } }]) {
        const response = await post(input);
        expect(response.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
        expect(JSON.stringify(response.body.errors)).not.toMatch(
          /Prisma|SELECT|relation|stack|password|UnavailableProfile/,
        );
      }
    } finally {
      database.sql('ALTER TABLE "UnavailableProfile" RENAME TO "Profile"');
    }
  });

  it('keeps count/items on one real snapshot while a second connection commits a user', async () => {
    const initial = await fixture({ username: 'snapshot-fixture' });
    database.sql(`ALTER TABLE "Profile" RENAME TO "FixtureProfile";
      CREATE FUNCTION catalog_snapshot_gate() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
      BEGIN PERFORM pg_advisory_xact_lock(734031); RETURN true; END $$;
      CREATE VIEW "Profile" AS SELECT * FROM "FixtureProfile" WHERE catalog_snapshot_gate();`);
    const held = deferred();
    const release = deferred();
    const holder = peer.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(734031)::text`;
        held.resolve();
        await release.promise;
      },
      { timeout: 30000 },
    );
    let pending: Promise<request.Response> | undefined;
    try {
      await held.promise;
      pending = post({}).then((response) => response);
      let waiting = false;
      const deadline = Date.now() + 15000;
      while (!waiting && Date.now() < deadline) {
        const rows = await peer.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE wait_event = 'advisory'
          AND query LIKE '%superadmin users catalog%') AS waiting`;
        waiting = rows[0].waiting;
      }
      expect(waiting).toBe(true); // Deterministic DB barrier, not a timing-based sleep.
      await peer.user.create({ data: { email: 'concurrent@fixture.test' } });
      release.resolve();
      await holder;
      const response = await pending;
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.superadminUsers).toMatchObject({
        totalCount: 1,
        items: [{ userId: initial }],
      });
      expect((await post({})).body.data.superadminUsers.totalCount).toBe(2);
    } finally {
      release.resolve();
      await holder;
      await pending;
      database.sql(
        'DROP VIEW "Profile"; ALTER TABLE "FixtureProfile" RENAME TO "Profile"; DROP FUNCTION catalog_snapshot_gate()',
      );
    }
  });
});
