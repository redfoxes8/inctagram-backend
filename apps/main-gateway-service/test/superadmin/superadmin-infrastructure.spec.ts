import { Args, Mutation, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Controller, Get, INestApplication, Logger, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { buildSchema, parse, validate } from 'graphql';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import {
  SuperadminGuard,
  SuperadminSessionException,
} from '../../src/modules/superadmin/api/superadmin.guard';
import { DenyAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/deny-admin-principal.verifier';
import {
  setupSuperadminHttp,
  parseSuperadminOrigins,
} from '../../src/modules/superadmin/api/superadmin-http-security';
import { createSuperadminContext } from '../../src/modules/superadmin/api/superadmin-context';
import { PaginationInput } from '../../../../libs/common/src/graphql/pagination-input';
import { SUPERADMIN_COMMON_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/common-type-defs';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';
import { dateTimeScalar } from '../../../../libs/common/src/graphql/date-time.scalar';
import { formatSuperadminError } from '../../src/modules/superadmin/api/superadmin-errors';

const ORIGIN = 'https://admin.example.test';
const PATH = '/api/v1/graphql';
const schema = `${SUPERADMIN_COMMON_TYPE_DEFS}
 type Query { probe: Probe, page(input: PageInput!): Int!, connection(input: PageInput!): Probe, crash: String, domain: String, forbidden: String, upstream: String }
 type Mutation { probeWrite: Boolean!, superadminLogin: Boolean!, superadminLogout: Boolean! }
 type Probe { secret: String, child: Probe, items: [Probe!]! }
`;
const verifier = { verify: jest.fn() };

@Resolver('Query')
class ProbeResolver {
  @Query('probe') probe(): object {
    return {};
  }
  @Query('page') page(@Args('input') input: PaginationInput): number {
    return input.pageSize;
  }
  @Query('connection') connection(@Args('input') input: PaginationInput): object {
    void input;
    return {};
  }
  @Query('crash') crash(): never {
    throw new Error('password=private upstream token=secret');
  }
  @Query('domain') domain(): never {
    throw new DomainException({ code: DomainExceptionCode.BadRequest, message: 'private' });
  }
  @Query('forbidden') forbidden(): never {
    throw new DomainException({ code: DomainExceptionCode.Forbidden, message: 'private' });
  }
  @Query('upstream') upstream(): never {
    throw new DomainException({ code: DomainExceptionCode.ServiceUnavailable, message: 'private' });
  }
}
@Resolver('Probe')
class ProbeFields {
  @ResolveField('secret') secret(): string {
    return 'fixture';
  }
  @ResolveField('child') child(): object {
    return {};
  }
  @ResolveField('items') items(): object[] {
    return [{}];
  }
}
@Resolver('Mutation')
class ProbeMutations {
  @Mutation('probeWrite') write(): boolean {
    return true;
  }
  @SuperadminSessionException('login')
  @Mutation('superadminLogin')
  login(): boolean {
    return true;
  }
  @SuperadminSessionException('logout')
  @Mutation('superadminLogout')
  logout(): boolean {
    return true;
  }
}
@Controller('fixture-rest')
class RestFixture {
  @Get() get(): object {
    return { ok: true };
  }
  @Get('error') error(): never {
    throw new DomainException({ code: DomainExceptionCode.BadRequest, message: 'REST unchanged' });
  }
}
@Module({
  imports: [SuperadminModule.withRuntime({ typeDefs: schema, production: true })],
  providers: [ProbeResolver, ProbeFields, ProbeMutations],
  controllers: [RestFixture],
})
class FixtureModule {}

describe('Superadmin infrastructure (isolated schema, no external services)', () => {
  let app: INestApplication<Server>;
  const post = (query: string): request.Test =>
    request(app.getHttpServer()).post(PATH).set('Origin', ORIGIN).send({ query });
  const authenticated = (query: string): request.Test =>
    post(query)
      .set('Cookie', 'superadminSession=fixture; superadminCsrf=nonce')
      .set('X-Superadmin-CSRF', 'nonce');
  beforeAll(async (): Promise<void> => {
    const module = await Test.createTestingModule({ imports: [FixtureModule] })
      .overrideProvider(AdminPrincipalVerifier)
      .useValue(verifier)
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, FixtureModule, {
      httpConfig: {
        enabled: true,
        enableCookies: true,
        enableGlobalPrefix: true,
        enableCors: true,
        corsOptions: { origin: ['https://main.example.test'], credentials: true },
      },
    });
    await app.init();
  });
  beforeEach((): void => {
    verifier.verify.mockReset();
    verifier.verify.mockResolvedValue({ role: 'SUPERADMIN', sessionId: 'fixture' });
  });
  afterAll(async (): Promise<void> => {
    await app.close();
  });

  it('builds the versioned target contract without publishing it', async (): Promise<void> => {
    const target = readFileSync(
      join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/target.graphql'),
      'utf8',
    );
    expect(
      validate(buildSchema(target), parse('{ superadminUser(userId: "fixture") { userId } }')),
    ).toEqual([]);
    const result = await authenticated('{ superadminUsers(input: {}) { totalCount } }');
    expect(result.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
  });
  it('denies absent cookie, ordinary JWT, null principal and verifier failure', async (): Promise<void> => {
    for (const authorization of ['', 'Bearer ordinary-user-token']) {
      const result = await post('{ probe { secret } }').set('Authorization', authorization);
      expect(result.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    }
    verifier.verify.mockResolvedValue(null);
    expect((await authenticated('{ probe { secret } }')).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    verifier.verify.mockRejectedValue(new Error('token=private'));
    expect(JSON.stringify((await authenticated('{ probe { secret } }')).body)).not.toContain(
      'private',
    );
  });
  it('fails closed with the default verifier and a missing DI binding', async (): Promise<void> => {
    expect(await new DenyAdminPrincipalVerifier().verify({ sessionToken: 'fixture' })).toBeNull();
    const context = new ExecutionContextHost(
      [
        null,
        {},
        { req: { cookies: { superadminSession: 'fixture' } }, principal: null },
        { parentType: { name: 'Query' }, fieldName: 'probe' },
      ],
      ProbeResolver,
      (): void => undefined,
    );
    context.setType('graphql');
    await expect(new SuperadminGuard(new Reflector()).canActivate(context)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });
  it('runs guard on nested field resolvers, not only root', async (): Promise<void> => {
    verifier.verify
      .mockResolvedValueOnce({ role: 'SUPERADMIN', sessionId: 'fixture' })
      .mockResolvedValue(null);
    const result = await authenticated('{ probe { secret } }');
    expect(result.body.data.probe.secret).toBeNull();
    expect(result.body.errors[0].path).toEqual(['probe', 'secret']);
    expect(verifier.verify).toHaveBeenCalledTimes(2);
  });
  it('creates request context without trusting user JWT', (): void => {
    const context = createSuperadminContext({ req: {} as never, res: {} as never });
    expect(context.principal).toBeNull();
  });
  it('applies DTO validation and defaults to pagination', async (): Promise<void> => {
    expect((await authenticated('{ page(input: {}) }')).body.data.page).toBe(8);
    expect((await authenticated('{ page(input: {page:10000,pageSize:50}) }')).body.data.page).toBe(
      50,
    );
    for (const input of ['page:0', 'page:10001', 'pageSize:0', 'pageSize:51', 'page:1.5']) {
      const result = await authenticated(`{ page(input: {${input}}) }`);
      expect(result.body.errors).toBeDefined();
      expect(JSON.stringify(result.body)).not.toContain('stack');
    }
  });
  it('sanitizes application, validation and unexpected errors with original REST setup', async (): Promise<void> => {
    const logger = jest.spyOn(Logger.prototype, 'error');
    for (const [field, code] of [
      ['domain', 'BAD_USER_INPUT'],
      ['crash', 'INTERNAL_SERVER_ERROR'],
      ['forbidden', 'FORBIDDEN'],
      ['upstream', 'UPSTREAM_UNAVAILABLE'],
    ]) {
      const result = await authenticated(`{ ${field} }`);
      expect(result.body.errors[0].extensions).toEqual({ code });
      expect(JSON.stringify(result.body)).not.toMatch(/private|password|token|stacktrace/);
    }
    expect((await post('{')).body.errors[0].extensions.code).toBe('GRAPHQL_PARSE_FAILED');
    expect((await post('{ unknown }')).body.errors[0].extensions.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/password=private|token=secret/);
    logger.mockRestore();
  });
  it('enforces POST, JSON, body bound and rejects batching', async (): Promise<void> => {
    expect((await request(app.getHttpServer()).get(PATH).set('Origin', ORIGIN)).status).toBe(405);
    expect(
      (await request(app.getHttpServer()).post(PATH).set('Origin', ORIGIN).send('query=x')).status,
    ).toBe(415);
    const batch = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .send([{ query: '{ probe { secret } }' }]);
    expect(batch.status).toBe(400);
    const oversized = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .send({ query: ' '.repeat(256 * 1024) });
    expect(oversized.status).toBe(413);
    const underLimit = await post('#' + 'x'.repeat(110 * 1024) + '\n{ page(input:{}) }');
    expect(underLimit.status).not.toBe(413);
    expect(
      (
        await request(app.getHttpServer())
          .get(PATH + '/')
          .set('Origin', ORIGIN)
      ).status,
    ).toBe(405);
  });
  it('bounds depth, aliases and repeated fragments', async (): Promise<void> => {
    expect(
      (
        await authenticated(
          '{ probe { child { child { child { child { child { child { child { secret } } } } } } } } }',
        )
      ).body.errors,
    ).toBeDefined();
    expect(
      (
        await post(
          `{ ${Array.from({ length: 201 }, (_, index) => `alias${index}:crash`).join(' ')} }`,
        )
      ).body.errors,
    ).toBeDefined();
    const fragmented = await post(
      `{ ${Array.from({ length: 101 }, (_, index) => `a${index}:probe { ...Shared }`).join(' ')} } fragment Shared on Probe { secret }`,
    );
    expect(fragmented.body.errors).toBeDefined();
    const aliased = (count: number): string =>
      `{ ${Array.from({ length: count }, (_, index) => `a${index}:page(input:{})`).join(' ')} }`;
    expect((await authenticated(aliased(200))).body.errors).toBeUndefined();
    expect((await authenticated(aliased(201))).body.errors).toBeDefined();
    const variables = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .set('Cookie', 'superadminSession=fixture')
      .send({
        query:
          'query($input: PageInput!) { connection(input:$input) { items { secret child { secret } } } }',
        variables: { input: { pageSize: 50 } },
      });
    // 2 + 50 * 3 = 152, still within budget.
    expect(variables.body.errors).toBeUndefined();
    const overBudget = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', ORIGIN)
      .send({
        query:
          'query($input: PageInput!) { connection(input:$input) { items { secret child { secret child { secret } } } } }',
        variables: { input: { pageSize: 50 } },
      });
    expect(overBudget.body.errors).toBeDefined();
    const defaultVariable = await post(
      'query($input: PageInput! = {pageSize:50}) { connection(input:$input) { items { secret child { secret child { secret } } } } }',
    );
    expect(defaultVariable.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
  it('validates origin, CORS and CSRF independently', async (): Promise<void> => {
    expect(
      (await request(app.getHttpServer()).post(PATH).send({ query: '{ crash }' })).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .post(PATH)
          .set('Origin', 'https://evil.example.test')
          .send({ query: '{ crash }' })
      ).status,
    ).toBe(403);
    const preflight = await request(app.getHttpServer()).options(PATH).set('Origin', ORIGIN);
    expect(preflight.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    expect(
      (await post('mutation { probeWrite }').set('Cookie', 'superadminSession=fixture')).body
        .errors,
    ).toBeDefined();
    expect(
      (await post('mutation { probeWrite }').set('Cookie', 'superadminSession=fixture')).body
        .errors[0].extensions.code,
    ).toBe('FORBIDDEN');
    expect((await authenticated('mutation { probeWrite }')).body.data.probeWrite).toBe(true);
    // Only test-schema operations use the future session exceptions.
    expect((await post('mutation { superadminLogin }')).body.data.superadminLogin).toBe(true);
    expect((await post('mutation { superadminLogout }')).body.data.superadminLogout).toBe(true);
    verifier.verify.mockRejectedValue(new Error('expired'));
    expect((await authenticated('mutation { superadminLogout }')).body.data.superadminLogout).toBe(
      true,
    );
  });
  it('keeps the default production module endpoint disabled without a Query root', async (): Promise<void> => {
    const disabled = await Test.createTestingModule({ imports: [SuperadminModule] }).compile();
    const isolated: INestApplication<Server> = disabled.createNestApplication();
    isolated.setGlobalPrefix('api/v1');
    await isolated.init();
    try {
      expect(
        (
          await request(isolated.getHttpServer())
            .post(PATH)
            .send({ query: '{ superadminUser(userId:"fixture") { userId } }' })
        ).status,
      ).toBe(404);
    } finally {
      await isolated.close();
    }
  });
  it('rejects a mutation-only schema through the actual Nest Apollo runtime', async (): Promise<void> => {
    const mutationOnly = await Test.createTestingModule({
      imports: [
        SuperadminModule.withRuntime({
          typeDefs: `${SUPERADMIN_COMMON_TYPE_DEFS} type Mutation { superadminLogout: Boolean! }`,
          production: true,
        }),
      ],
    }).compile();
    const isolated: INestApplication<Server> = mutationOnly.createNestApplication();
    isolated.setGlobalPrefix('api/v1');
    try {
      await expect(isolated.init()).rejects.toThrow('Query root type must be provided');
    } finally {
      await isolated.close();
    }
  });
  it('rejects requests with an empty configured origin allow-list', async (): Promise<void> => {
    const disabled = await Test.createTestingModule({ imports: [SuperadminModule] }).compile();
    const isolated: INestApplication<Server> = disabled.createNestApplication();
    setupSuperadminHttp({
      app: isolated,
      policy: { allowedOrigins: parseSuperadminOrigins(undefined) },
    });
    await isolated.init();
    try {
      const result = await request(isolated.getHttpServer())
        .post(PATH)
        .set('Origin', ORIGIN)
        .send({ query: '{ __typename }' });
      expect(result.status).toBe(403);
      expect(result.body).toEqual({
        errors: [{ message: 'Request rejected', extensions: { code: 'FORBIDDEN' } }],
      });
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await isolated.close();
    }
  });
  it('disables production introspection and IDE, mounts the prefix exactly once', async (): Promise<void> => {
    expect((await post('{ __schema { queryType { name } } }')).body.errors).toBeDefined();
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/api/v1/graphql')
          .send({ query: '{ crash }' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get(PATH)
          .set('Origin', ORIGIN)
          .set('Accept', 'text/html')
      ).status,
    ).toBe(405);
  });
  it('keeps existing REST prefix and error response format', async (): Promise<void> => {
    expect((await request(app.getHttpServer()).get('/api/v1/fixture-rest')).body).toEqual({
      ok: true,
    });
    const result = await request(app.getHttpServer()).get('/api/v1/fixture-rest/error');
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 400, message: 'REST unchanged', extensions: [] });
  });
  it('validates origins and DateTime, masking unknown error codes', (): void => {
    expect(parseSuperadminOrigins(undefined)).toEqual([]);
    expect(() => parseSuperadminOrigins('*')).toThrow();
    expect(() => parseSuperadminOrigins('https://example.test/path')).toThrow();
    expect(dateTimeScalar.parseValue('2026-10-18T12:00:00Z')).toBe('2026-10-18T12:00:00.000Z');
    expect(() => dateTimeScalar.parseValue('2026-02-30T00:00:00Z')).toThrow();
    expect(
      formatSuperadminError({
        formatted: { message: 'private', extensions: { code: 'UNKNOWN', token: 'secret' } },
        error: new Error('secret'),
      }).extensions,
    ).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
