import { INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSchema,
  isObjectType,
  printType,
  printSchema,
  lexicographicSortSchema,
} from 'graphql';
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
import { SuperadminFollowZeroResolver } from '../../src/modules/superadmin/api/superadmin-follow-zero.resolver';
import { GetSuperadminUserQuery } from '../../src/modules/users/application/queries/get-superadmin-user.query';
import { PaymentGrpcClient } from '../../src/modules/payments/infrastructure/payment-grpc.client';
import { SUPERADMIN_CONTRACT_VERSION } from '../../../../libs/contracts/src/graphql/superadmin/v1/common-type-defs';
import * as followZero from '../../src/modules/superadmin/application/get-temporary-follow-zero';
import { SuperadminUsersQueryRepository } from '../../src/modules/users/domain/interfaces/superadmin-users.query-repository';

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
const FOLLOW_ZERO = `query($userId: ID!, $input: PageInput!) {
  superadminUser(userId: $userId) {
    followers(input:$input) { ...Zero }
    following(input:$input) { ...Zero }
  }
} fragment Zero on SuperadminFollowConnection {
  items { userId } totalCount pageInfo { page pageSize pagesCount hasNextPage }
}`;

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

  it('preserves legacy input without banFilter: ALL, newest eight, blocked/unconfirmed/profileless, no deleted', async () => {
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

  it.each([
    { banFilter: 'ALL', indices: [0, 1, 2, 3, 4, 5] },
    { banFilter: 'BLOCKED', indices: [1, 3, 5] },
    { banFilter: 'NOT_BLOCKED', indices: [0, 2, 4] },
  ])(
    'filters $banFilter independently of email confirmation and Profile',
    async ({ banFilter, indices }) => {
      const users = [
        { username: 'active', confirmed: true },
        { username: 'blocked', banned: true, confirmed: true },
        { username: 'unconfirmed' },
        { username: 'blocked-unconfirmed', banned: true },
        { confirmed: true },
        { banned: true, confirmed: true },
        { deleted: true },
        { deleted: true, banned: true },
      ];
      const ids: string[] = [];
      for (const [index, user] of users.entries())
        ids.push(await fixture({ ...user, time: NOW + index }));
      const result = await post({ variables: { input: { banFilter } } });
      expect(result.body.errors).toBeUndefined();
      const page = result.body.data.superadminUsers;
      expect(page.items.map((item: { userId: string }) => item.userId)).toEqual(
        indices.map((index) => ids[index]).reverse(),
      );
      expect(page).toMatchObject({
        totalCount: indices.length,
        pageInfo: { page: 1, pageSize: 8, pagesCount: 1, hasNextPage: false },
      });
    },
  );

  it('applies banFilter and normalized username search before count and pagination', async () => {
    const expected = await fixture({ username: 'match-one', banned: true, time: NOW });
    await fixture({ username: 'MATCH-two', banned: true, time: NOW + 1 });
    await fixture({ username: 'match-three', banned: true, time: NOW + 2 });
    await fixture({ username: 'match-active', time: NOW + 3 });
    await fixture({ username: 'unrelated', banned: true, time: NOW + 4 });
    await fixture({ username: 'match-deleted', banned: true, deleted: true, time: NOW + 5 });
    await fixture({ banned: true, time: NOW + 6 });
    const result = await post({
      variables: {
        input: {
          banFilter: 'BLOCKED',
          searchUsername: ' MaTcH ',
          page: 2,
          pageSize: 2,
          sort: 'CREATED_AT_DESC',
        },
      },
    });
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.superadminUsers).toMatchObject({
      items: [{ userId: expected }],
      totalCount: 3,
      pageInfo: { page: 2, pageSize: 2, pagesCount: 2, hasNextPage: false },
    });
    expect(result.body.data.superadminUsers.items).toHaveLength(1);
  });

  it('rejects an invalid banFilter enum before reading the catalogue', async () => {
    const read = jest.spyOn(app.get(SuperadminUsersQueryRepository), 'findPage');
    const result = await post({ variables: { input: { banFilter: 'CONFIRMED' } } });
    expect(result.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(read).not.toHaveBeenCalled();
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

  it('publishes implemented fields only, including FOLLOW-ZERO-1, and keeps secrets out', async () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    const exported = buildSchema(
      readFileSync(
        join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
        'utf8',
      ),
    );
    expect(printSchema(lexicographicSortSchema(schema))).toBe(
      printSchema(lexicographicSortSchema(exported)),
    );
    const target = buildSchema(
      readFileSync(
        join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/target.graphql'),
        'utf8',
      ),
    );
    for (const name of ['SuperadminUsersBanFilter', 'SuperadminUsersInput']) {
      expect(printType(schema.getType(name)!)).toBe(printType(target.getType(name)!));
    }
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
      'followers',
      'following',
      'isEmailConfirmed',
      'payments',
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

  describe('SA-GQL-08 temporary FOLLOW-ZERO-1 over actual GraphQL HTTP/admin verifier', () => {
    function empty(input: { page: number; pageSize: number }): object {
      return {
        items: [],
        totalCount: 0,
        pageInfo: { ...input, pagesCount: 0, hasNextPage: false },
      };
    }

    it('matches target 1.3.0 exactly, only userId item and no new root operations', () => {
      expect(SUPERADMIN_CONTRACT_VERSION).toBe('1.3.0');
      const schema = app.get(GraphQLSchemaHost).schema;
      const target = buildSchema(
        readFileSync(
          join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/target.graphql'),
          'utf8',
        ),
      );
      for (const name of [
        'SuperadminFollowItem',
        'SuperadminFollowConnection',
        'PageInput',
        'PageInfo',
      ]) {
        expect(printType(schema.getType(name)!)).toBe(printType(target.getType(name)!));
      }
      const user = schema.getType('SuperadminUser');
      const item = schema.getType('SuperadminFollowItem');
      if (!isObjectType(user) || !isObjectType(item)) throw new Error('Missing follow types');
      expect(Object.keys(item.getFields())).toEqual(['userId']);
      expect(String(item.getFields().userId.type)).toBe('ID!');
      for (const field of ['followers', 'following']) {
        expect(String(user.getFields()[field].type)).toBe('SuperadminFollowConnection');
        expect(
          user.getFields()[field].args.map((argument) => [argument.name, String(argument.type)]),
        ).toEqual([['input', 'PageInput!']]);
      }
      expect(
        Object.keys(schema.getMutationType()!.getFields()).some((name) => /follow/i.test(name)),
      ).toBe(false);
    });

    it.each([
      {},
      { page: 1, pageSize: 1 },
      { page: 2, pageSize: 8 },
      { page: 10000, pageSize: 50 },
    ])('returns both zero connections for valid input %j, without mutation CSRF', async (input) => {
      const userId = await fixture({ banned: true }); // Existing detail rules: blocked/unconfirmed/profileless parent is readable by admin.
      const response = await post({ query: FOLLOW_ZERO, variables: { userId, input } });
      expect(response.body.errors).toBeUndefined();
      const expected = empty({ page: input.page ?? 1, pageSize: input.pageSize ?? 8 });
      expect(response.body.data.superadminUser).toEqual({
        followers: expected,
        following: expected,
      });
    });

    it.each([
      { page: 0 },
      { page: -1 },
      { page: 10001 },
      { pageSize: 0 },
      { pageSize: 51 },
      { page: 1.5 },
      { pageSize: '8' },
      { page: null },
    ])('rejects invalid input %j as BAD_USER_INPUT before temporary component', async (input) => {
      const userId = await fixture();
      const spy = jest.spyOn(followZero, 'getTemporaryFollowZero');
      const response = await post({ query: FOLLOW_ZERO, variables: { userId, input } });
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(spy).not.toHaveBeenCalled();
    });

    it('requires PageInput, rejecting null or omitted required arguments', async () => {
      const userId = await fixture();
      const response = await post({ query: FOLLOW_ZERO, variables: { userId, input: null } });
      expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      const missing = await post({
        query: 'query($userId:ID!){superadminUser(userId:$userId){followers{totalCount}}}',
        variables: { userId },
      });
      expect(missing.body.errors).toBeDefined(); // GraphQL validation rejects absent required argument before resolvers.
    });

    it('keeps independent pageInfo for aliases, fragments, both directions and different parents', async () => {
      const one = await fixture();
      const two = await fixture({ username: 'second-parent' });
      const response = await post({
        query: `query($one:ID!,$two:ID!){
        one:superadminUser(userId:$one){ ...Tabs }
        two:superadminUser(userId:$two){ later:followers(input:{page:9,pageSize:1}){...Zero} }
      } fragment Tabs on SuperadminUser {
        first:followers(input:{page:1,pageSize:8}){...Zero}
        second:followers(input:{page:2,pageSize:3}){...Zero}
        outgoing:following(input:{page:10000,pageSize:50}){...Zero}
      } fragment Zero on SuperadminFollowConnection {items{userId} totalCount pageInfo{page pageSize pagesCount hasNextPage}}`,
        variables: { one, two },
      });
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data).toEqual({
        one: {
          first: empty({ page: 1, pageSize: 8 }),
          second: empty({ page: 2, pageSize: 3 }),
          outgoing: empty({ page: 10000, pageSize: 50 }),
        },
        two: { later: empty({ page: 9, pageSize: 1 }) },
      });
    });

    it.each(['missing', 'user-jwt', 'idle-expired', 'absolute-expired', 'revoked'])(
      'denies %s session for both fields',
      async (mode) => {
        const userId = await fixture();
        if (mode === 'idle-expired')
          await prisma.adminSession.updateMany({
            data: {
              createdAt: new Date(NOW - ADMIN_IDLE_MS),
              lastSeenAt: new Date(NOW - ADMIN_IDLE_MS),
              idleExpiresAt: new Date(NOW),
            },
          });
        if (mode === 'absolute-expired')
          await prisma.adminSession.updateMany({
            data: {
              createdAt: new Date(NOW - ADMIN_ABSOLUTE_MS),
              lastSeenAt: new Date(NOW - 60000),
              idleExpiresAt: new Date(NOW),
              absoluteExpiresAt: new Date(NOW),
            },
          });
        if (mode === 'revoked')
          await prisma.adminSession.updateMany({ data: { revokedAt: new Date(NOW) } });
        const spy = jest.spyOn(followZero, 'getTemporaryFollowZero');
        const jwt = new JwtService({ secret: 'isolated-user-fixture-only' }).sign({
          userId,
          deviceId: randomUUID(),
          tokenType: 'ACCESS',
        });
        const response = await post({
          query: FOLLOW_ZERO,
          variables: { userId, input: {} },
          cookie:
            mode === 'missing' || mode === 'user-jwt'
              ? 'refreshToken=ordinary-user-token'
              : undefined,
        }).set('Authorization', `Bearer ${jwt}`);
        expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
        expect(spy).not.toHaveBeenCalled();
      },
    );

    it.each(['followers', 'following'])(
      'rechecks nested %s after parent, with no public exception or fragment bypass',
      async (field) => {
        const userId = await fixture();
        const query = app.get(GetSuperadminUserQuery);
        const execute = query.execute.bind(query);
        jest.spyOn(query, 'execute').mockImplementation(async (input) => {
          const user = await execute(input);
          await prisma.adminSession.updateMany({ data: { revokedAt: new Date(NOW) } });
          return user;
        });
        const spy = jest.spyOn(followZero, 'getTemporaryFollowZero');
        const response = await post({
          query: `query($userId:ID!){parent:superadminUser(userId:$userId){userId ...Tab}} fragment Tab on SuperadminUser{tab:${field}(input:{}){totalCount}}`,
          variables: { userId },
        });
        expect(response.body.data.parent).toEqual({ userId, tab: null });
        expect(response.body.errors).toEqual([
          {
            message: 'Authentication required',
            path: ['parent', 'tab'],
            extensions: { code: 'UNAUTHENTICATED' },
          },
        ]);
        expect(spy).not.toHaveBeenCalled();
        expect(
          Reflect.getMetadata(
            'superadmin:session-exception',
            SuperadminFollowZeroResolver.prototype[field as 'followers' | 'following'],
          ),
        ).toBeUndefined();
      },
    );

    it('does not execute nested fields for missing/deleted parent or when not selected', async () => {
      const userId = await fixture();
      const deleted = await fixture({ deleted: true });
      const spy = jest.spyOn(followZero, 'getTemporaryFollowZero');
      for (const id of [randomUUID(), deleted]) {
        expect(
          (await post({ query: FOLLOW_ZERO, variables: { userId: id, input: {} } })).body.data
            .superadminUser,
        ).toBeNull();
      }
      expect((await post({ query: DETAIL, variables: { userId } })).body.errors).toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });

    it('uses only existing parent/admin reads, no Payment RPC and no writes beyond auth touch', async () => {
      const userId = await fixture({ username: 'unchanged' });
      await prisma.adminSession.updateMany({
        data: {
          createdAt: new Date(NOW - 120000),
          lastSeenAt: new Date(NOW - 61000),
          idleExpiresAt: new Date(NOW + ADMIN_IDLE_MS - 61000),
        },
      });
      const before = {
        users: await prisma.user.findMany(),
        profiles: await prisma.profile.findMany(),
        sessions: await prisma.session.findMany(),
        audit: await prisma.adminUserActionAudit.findMany(),
        outbox: await prisma.userAccessRevokeOutbox.findMany(),
        admins: await prisma.adminSession.findMany(),
      };
      const query = jest.spyOn(prisma, '$queryRaw');
      const rpc = jest.spyOn(PaymentGrpcClient.prototype, 'getPaymentHistoryWithTimeout');
      const response = await post({ query: FOLLOW_ZERO, variables: { userId, input: {} } });
      expect(response.body.errors).toBeUndefined();
      expect(query).toHaveBeenCalledTimes(1); // One joined parent SELECT; temporary component has no clients/repositories/DI dependencies.
      expect(rpc).not.toHaveBeenCalled();
      expect(await prisma.user.findMany()).toEqual(before.users);
      expect(await prisma.profile.findMany()).toEqual(before.profiles);
      expect(await prisma.session.findMany()).toEqual(before.sessions);
      expect(await prisma.adminUserActionAudit.findMany()).toEqual(before.audit);
      expect(await prisma.userAccessRevokeOutbox.findMany()).toEqual(before.outbox);
      expect(await prisma.adminSession.findMany()).toEqual([
        {
          ...before.admins[0],
          lastSeenAt: new Date(NOW),
          idleExpiresAt: new Date(NOW + ADMIN_IDLE_MS),
        },
      ]);
    });

    it('retains exact Origin/CORS and the shared query budget for temporary fields', async () => {
      const userId = await fixture();
      const spy = jest.spyOn(followZero, 'getTemporaryFollowZero');
      const forbidden = await post({ query: FOLLOW_ZERO, variables: { userId, input: {} } }).set(
        'Origin',
        'https://untrusted.example.test',
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.errors[0].extensions.code).toBe('FORBIDDEN');
      // Static field count is small; pageSize multiplication crosses the execution budget.
      const aliases = Array.from(
        { length: 4 },
        (_, index) => `field${index}:followers(input:{pageSize:50}){items{userId}totalCount}`,
      ).join(' ');
      const expensive = await post({
        query: `query($userId:ID!){superadminUser(userId:$userId){${aliases}}}`,
        variables: { userId },
      });
      expect(expensive.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(spy).not.toHaveBeenCalled();
      const allowed = await post({ query: FOLLOW_ZERO, variables: { userId, input: {} } });
      expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    });

    it('keeps safe nullable field errors instead of hiding unexpected failures as zero', async () => {
      const userId = await fixture();
      jest.spyOn(followZero, 'getTemporaryFollowZero').mockImplementationOnce(() => {
        throw new Error('private database URL token cookie');
      });
      const response = await post({
        query:
          'query($userId:ID!){superadminUser(userId:$userId){userId broken:followers(input:{}){totalCount}}}',
        variables: { userId },
      });
      expect(response.body.data.superadminUser).toEqual({ userId, broken: null });
      expect(response.body.errors).toEqual([
        {
          message: 'Internal server error',
          path: ['superadminUser', 'broken'],
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ]);
    });
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
