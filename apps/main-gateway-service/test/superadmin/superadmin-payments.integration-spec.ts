import { type INestApplication, Module, type INestMicroservice } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { type ServerUnaryCall } from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildSchema, printType } from 'graphql';
import request from 'supertest';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { createIsolatedPaymentDatabase } from './isolated-payment-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { GatewayConfig } from '../../src/core/gateway.config';
import { SuperadminModule } from '../../src/modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from '../../src/modules/superadmin/superadmin-auth.module';
import { SuperadminUsersModule } from '../../src/modules/superadmin/superadmin-users.module';
import { SuperadminPaymentsModule } from '../../src/modules/superadmin/superadmin-payments.module';
import { SuperadminModerationModule } from '../../src/modules/superadmin/superadmin-moderation.module';
import { AdminPrincipalVerifier } from '../../src/modules/superadmin/domain/admin-principal';
import { SessionAdminPrincipalVerifier } from '../../src/modules/superadmin/infrastructure/session-admin-principal.verifier';
import {
  AdminClock,
  ADMIN_IDLE_MS,
  ADMIN_ABSOLUTE_MS,
} from '../../src/modules/superadmin/domain/admin-clock';
import { hashAdminToken } from '../../src/modules/superadmin/application/admin-token';
import { GetSuperadminUserQuery } from '../../src/modules/users/application/queries/get-superadmin-user.query';
import { ModerateUserUseCase } from '../../src/modules/users/application/commands/moderate-user.usecase';
import { PaymentGrpcClient } from '../../src/modules/payments/infrastructure/payment-grpc.client';
import { PaymentGrpcAdapter } from '../../src/modules/payments/infrastructure/payment-grpc.adapter';
import { PaymentsModule } from '../../src/modules/payments/payments.module';
import { JwtStrategy } from '../../src/common/strategies/jwt.strategy';
import { UserAccessModule } from '../../src/modules/sessions/user-access.module';
import { SuperadminPaymentsConfig } from '../../src/modules/superadmin/infrastructure/superadmin-payments.config';
import { SUPERADMIN_RUNTIME_TYPE_DEFS } from '../../../../libs/contracts/src/graphql/superadmin/v1/runtime-type-defs';
import { INCTAGRAM_PAYMENT_V1_PACKAGE_NAME } from '../../../../libs/contracts/src/generated/payment';
import { appSetup } from '../../../../libs/common/src/setup/app-setup';
import { setupSuperadminHttp } from '../../src/modules/superadmin/api/superadmin-http-security';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentGrpcController } from '../../../micro-payment-service/src/modules/payment/api/grpc/payment-grpc.controller';
import { GetPaymentHistoryHandler } from '../../../micro-payment-service/src/modules/payment/application/queries/get-payment-history.query';
import { IPaymentHistoryQueryPort } from '../../../micro-payment-service/src/modules/payment/application/ports/payment-query.port';
import { PaymentQueryRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/payment-query.repository';
import { PrismaService as PaymentPrismaService } from '../../../micro-payment-service/src/core/prisma/prisma.service';
import type { PrismaClient as PaymentPrismaClient } from '../../../micro-payment-service/src/core/prisma/client';
import { PaymentGrpcResponseMapper } from '../../../micro-payment-service/src/modules/payment/api/grpc/mappers/payment-grpc-response.mapper';

const ORIGIN = 'https://payments-admin.example.test';
const PATH = '/api/v1/graphql';
const NOW = Date.parse('2026-10-19T12:00:00Z');
const TOKEN = 'p'.repeat(43);
const QUERY = `query($id: ID!, $input: PageInput!) { superadminUser(userId: $id) {
  userId username payments(input: $input) { items {
    transactionId createdAt paidAt amountMinor currency productId productName billingInterval
    billingIntervalCount provider kind status checkoutPurpose subscriptionId subscriptionEndsAt
  } totalCount pageInfo { page pageSize pagesCount hasNextPage } }
} }`;

@Module({
  imports: [
    PaymentsModule,
    UserAccessModule,
    JwtModule.register({ secret: 'payment-rest-fixture-only' }),
    SuperadminModule.withRuntime({
      typeDefs: SUPERADMIN_RUNTIME_TYPE_DEFS,
      production: true,
      imports: [
        SuperadminAuthModule,
        SuperadminUsersModule,
        SuperadminModerationModule,
        SuperadminPaymentsModule,
      ],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
    }),
  ],
  providers: [JwtStrategy],
})
class PaymentsFixtureModule {}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('SA-GQL-06 HTTP + real Nest Payment gRPC controller/handler + separate PostgreSQL DB', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let payment: PaymentPrismaClient;
  let app: INestApplication<Server>;
  let microservice: INestMicroservice;
  let history: GetPaymentHistoryHandler;
  let userId: string;
  let productId: string;
  let sessionId: string;
  let cancelled: (() => void) | null = null;

  function post(
    input: { query?: string; variables?: object; cookie?: string; origin?: string } = {},
  ): request.Test {
    return request(app.getHttpServer())
      .post(PATH)
      .set('Origin', input.origin ?? ORIGIN)
      .set('Cookie', input.cookie ?? `superadminSession=${TOKEN}`)
      .send({
        query: input.query ?? QUERY,
        variables: input.variables ?? { id: userId, input: {} },
      });
  }

  async function transaction(
    input: { amount?: number; id?: string; createdAt?: Date; linked?: boolean } = {},
  ): Promise<string> {
    const subscription = input.linked
      ? await payment.subscription.create({
          data: {
            userId,
            productId,
            provider: 'PAYPAL',
            sequence: 1,
            status: 'ACTIVE',
            autoRenew: true,
            startsAt: new Date(NOW),
            endsAt: new Date(NOW + 86400000),
          },
        })
      : null;
    const checkout = input.linked
      ? await payment.checkoutSession.create({
          data: {
            userId,
            productId,
            provider: 'PAYPAL',
            purpose: 'ADDITIONAL_SUBSCRIPTION',
            idempotencyKey: randomUUID(),
          },
        })
      : null;
    return (
      await payment.paymentTransaction.create({
        data: {
          id: input.id ?? randomUUID(),
          userId,
          productId,
          provider: input.linked ? 'PAYPAL' : 'STRIPE',
          kind: input.linked ? 'PURCHASE' : 'RENEWAL',
          status: input.linked ? 'SUCCEEDED' : 'PENDING',
          amountMinor: input.amount ?? 899,
          currency: 'EUR',
          idempotencyKey: randomUUID(),
          createdAt: input.createdAt ?? new Date(NOW),
          paidAt: input.linked ? new Date(NOW) : null,
          subscriptionId: subscription?.id,
          checkoutSessionId: checkout?.id,
          providerTransactionId: input.linked ? randomUUID() : null,
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await database.start();
    prisma = database.client();
    payment = createIsolatedPaymentDatabase(database);
    const paymentModule = await Test.createTestingModule({
      imports: [CqrsModule.forRoot()],
      controllers: [PaymentGrpcController],
      providers: [
        GetPaymentHistoryHandler,
        { provide: IPaymentHistoryQueryPort, useClass: PaymentQueryRepository },
        { provide: PaymentPrismaService, useValue: payment },
      ],
    }).compile();
    const port = await unusedPort();
    microservice = paymentModule.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: INCTAGRAM_PAYMENT_V1_PACKAGE_NAME,
        protoPath: join(process.cwd(), 'libs/contracts/src/proto/payment.proto'),
        url: `127.0.0.1:${port}`,
      },
    });
    microservice.useGlobalInterceptors({
      intercept(context, next) {
        const call = context.getArgByIndex<ServerUnaryCall<unknown, unknown>>(2);
        call.on('cancelled', () => cancelled?.());
        // Credentials are never forwarded to the internal channel.
        expect(call.metadata.get('cookie')).toEqual([]);
        expect(call.metadata.get('authorization')).toEqual([]);
        return next.handle();
      },
    });
    await microservice.listen();
    history = paymentModule.get(GetPaymentHistoryHandler);
    const module = await Test.createTestingModule({ imports: [PaymentsFixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(NOW) })
      .overrideProvider(GatewayConfig)
      .useValue({
        paymentServiceGrpcUrl: `127.0.0.1:${port}`,
        jwtSecret: 'payment-rest-fixture-only',
      })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ NODE_ENV: 'test', SUPERADMIN_PAYMENTS_TIMEOUT_MS: 3000 }))
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, PaymentsFixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    await app.init();
  });

  beforeEach(async () => {
    await payment.paymentTransaction.deleteMany();
    await payment.checkoutSession.deleteMany();
    await payment.subscription.deleteMany();
    await payment.product.deleteMany();
    await prisma.user.deleteMany();
    await prisma.adminSession.deleteMany();
    userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@fixture.test` } });
    productId = (
      await payment.product.create({
        data: {
          code: randomUUID(),
          name: 'Fixture product',
          billingInterval: 'MONTH',
          billingIntervalCount: 2,
          priceMinor: 899,
          currency: 'EUR',
        },
      })
    ).id;
    sessionId = (
      await prisma.adminSession.create({
        data: {
          tokenHash: hashAdminToken(TOKEN),
          createdAt: new Date(NOW),
          lastSeenAt: new Date(NOW),
          idleExpiresAt: new Date(NOW + ADMIN_IDLE_MS),
          absoluteExpiresAt: new Date(NOW + ADMIN_ABSOLUTE_MS),
        },
      })
    ).id;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    cancelled = null;
  });
  afterAll(async () => {
    await app?.close();
    await microservice?.close();
    await payment?.$disconnect();
    await database.stop();
  });

  it('uses selected parent ID/default pagination and maps actual Payment rows, dates, enums and nullable fields', async () => {
    const id = await transaction({ linked: true });
    await transaction({ amount: 1, createdAt: new Date(NOW - 1000) });
    const spy = jest.spyOn(history, 'execute');
    const response = await post();
    expect(response.body.errors).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ input: { userId, page: 1, pageSize: 8 } }),
    );
    const result = response.body.data.superadminUser.payments;
    expect(result).toMatchObject({
      totalCount: 2,
      pageInfo: { page: 1, pageSize: 8, pagesCount: 1, hasNextPage: false },
    });
    expect(result.items[0]).toMatchObject({
      transactionId: id,
      amountMinor: 899,
      currency: 'EUR',
      productId,
      productName: 'Fixture product',
      billingInterval: 'MONTH',
      billingIntervalCount: 2,
      provider: 'PAYPAL',
      kind: 'PURCHASE',
      status: 'SUCCEEDED',
      checkoutPurpose: 'ADDITIONAL_SUBSCRIPTION',
      createdAt: new Date(NOW).toISOString(),
      paidAt: new Date(NOW).toISOString(),
      subscriptionEndsAt: new Date(NOW + 86400000).toISOString(),
    });
    expect(result.items[0].subscriptionId).toBeTruthy();
    expect(result.items[1]).toMatchObject({
      amountMinor: 1,
      provider: 'STRIPE',
      kind: 'RENEWAL',
      status: 'PENDING',
      paidAt: null,
      checkoutPurpose: null,
      subscriptionId: null,
      subscriptionEndsAt: null,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|tokenHash|idempotency|failureMessage/,
    );
  });

  it('preserves createdAt DESC / ID DESC and alias pages without caching collisions', async () => {
    const ids = ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'];
    for (const id of ids) await transaction({ id });
    const spy = jest.spyOn(history, 'execute');
    const response = await post({
      query: `query($id:ID!) { superadminUser(userId:$id) { ...History } }
      fragment History on SuperadminUser { first:payments(input:{page:1,pageSize:1}){items{transactionId} pageInfo{hasNextPage}} second:payments(input:{page:2,pageSize:1}){items{transactionId} pageInfo{hasNextPage}} }`,
      variables: { id: userId },
    });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.superadminUser).toMatchObject({
      first: { items: [{ transactionId: ids[1] }], pageInfo: { hasNextPage: true } },
      second: { items: [{ transactionId: ids[0] }], pageInfo: { hasNextPage: false } },
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns empty history and preserves count metadata beyond last page', async () => {
    expect((await post()).body.data.superadminUser.payments).toEqual({
      items: [],
      totalCount: 0,
      pageInfo: { page: 1, pageSize: 8, pagesCount: 0, hasNextPage: false },
    });
    await transaction();
    expect(
      (
        await post({
          query:
            'query($id:ID!,$input:PageInput!){superadminUser(userId:$id){payments(input:$input){items{transactionId} totalCount pageInfo{page pageSize pagesCount hasNextPage}}}}',
          variables: { id: userId, input: { page: 10000, pageSize: 50 } },
        })
      ).body.data.superadminUser.payments,
    ).toEqual({
      items: [],
      totalCount: 1,
      pageInfo: { page: 10000, pageSize: 50, pagesCount: 1, hasNextPage: false },
    });
  });

  it('does not mix different parents and forwards each selected UUID, not ordinary JWT subject', async () => {
    await transaction();
    const otherId = randomUUID();
    await prisma.user.create({ data: { id: otherId, email: `${otherId}@fixture.test` } });
    const spy = jest.spyOn(history, 'execute');
    const response = await post({
      query: `query($one:ID!,$two:ID!){one:superadminUser(userId:$one){payments(input:{}){totalCount}} two:superadminUser(userId:$two){payments(input:{}){totalCount}}}`,
      variables: { one: userId, two: otherId },
    });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toEqual({
      one: { payments: { totalCount: 1 } },
      two: { payments: { totalCount: 0 } },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ input: { userId, page: 1, pageSize: 8 } }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ input: { userId: otherId, page: 1, pageSize: 8 } }),
    );
  });

  it.each([
    { page: 0 },
    { page: 10001 },
    { pageSize: 0 },
    { pageSize: 51 },
    { page: 1.1 },
    { page: null },
  ])('rejects invalid pagination before RPC: %j', async (input) => {
    const spy = jest.spyOn(history, 'execute');
    const response = await post({ variables: { id: userId, input } });
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not call RPC for absent selection, missing or deleted parent', async () => {
    const spy = jest.spyOn(history, 'execute');
    expect(
      (
        await post({
          query: 'query($id:ID!){superadminUser(userId:$id){userId}}',
          variables: { id: userId },
        })
      ).body.errors,
    ).toBeUndefined();
    expect(
      (await post({ variables: { id: randomUUID(), input: {} } })).body.data.superadminUser,
    ).toBeNull();
    await app
      .get(ModerateUserUseCase)
      .execute({ action: 'DELETE', userId, adminSessionId: sessionId });
    expect((await post()).body.data.superadminUser).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['missing', 'user-jwt', 'expired', 'revoked'])(
    'rejects %s administrative authorization before RPC',
    async (mode) => {
      if (mode === 'expired')
        await prisma.adminSession.update({
          where: { id: sessionId },
          data: {
            createdAt: new Date(NOW - 3600000),
            lastSeenAt: new Date(NOW - 60000),
            idleExpiresAt: new Date(NOW),
          },
        });
      if (mode === 'revoked')
        await prisma.adminSession.update({
          where: { id: sessionId },
          data: { revokedAt: new Date(NOW) },
        });
      const spy = jest.spyOn(history, 'execute');
      const response = await post({
        cookie:
          mode === 'missing' || mode === 'user-jwt'
            ? 'refreshToken=ordinary-user-token'
            : undefined,
      }).set('Authorization', 'Bearer ordinary-user-jwt');
      expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it('rechecks admin authorization on protected field after loading parent (alias + fragment)', async () => {
    const query = app.get(GetSuperadminUserQuery);
    const original = query.execute.bind(query);
    jest.spyOn(query, 'execute').mockImplementation(async (input) => {
      const user = await original(input);
      await prisma.adminSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(NOW) },
      });
      return user;
    });
    const spy = jest.spyOn(history, 'execute');
    const response = await post({
      query: `query($id:ID!){person:superadminUser(userId:$id){userId ...P}} fragment P on SuperadminUser{history:payments(input:{}){totalCount}}`,
      variables: { id: userId },
    });
    expect(response.body.data.person).toEqual({ userId, history: null });
    expect(response.body.errors[0]).toMatchObject({
      path: ['person', 'history'],
      extensions: { code: 'UNAUTHENTICATED' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps real gRPC UNAVAILABLE to nullable boundary, preserving parent and alias path without leaks', async () => {
    const failure = new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'private upstream host / secret',
    });
    jest.spyOn(history, 'execute').mockRejectedValue(failure);
    const response = await post({
      query: `query($id:ID!){person:superadminUser(userId:$id){userId history:payments(input:{}){totalCount}}}`,
      variables: { id: userId },
    });
    expect(response.body.data.person).toEqual({ userId, history: null });
    expect(response.body.errors).toEqual([
      {
        message: 'Service unavailable',
        path: ['person', 'history'],
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      },
    ]);
  });

  it('times out a controlled pending real gRPC call and cancels it at server', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cancel!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    cancelled = cancel;
    const execute = history.execute.bind(history);
    jest.spyOn(history, 'execute').mockImplementation(async (query) => {
      await held;
      return execute(query);
    });
    jest.spyOn(app.get(SuperadminPaymentsConfig), 'timeoutMs', 'get').mockReturnValue(75);
    try {
      const response = await post();
      expect(response.body.data.superadminUser).toMatchObject({ userId, payments: null });
      expect(response.body.errors[0]).toMatchObject({
        path: ['superadminUser', 'payments'],
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      });
      await cancellation;
    } finally {
      release();
    }
  });

  it.each(['enum', 'date', 'required', 'metadata'])(
    'rejects corrupt %s upstream response safely',
    async (mode) => {
      await transaction();
      const original = PaymentGrpcResponseMapper.getPaymentHistory.bind(PaymentGrpcResponseMapper);
      jest.spyOn(PaymentGrpcResponseMapper, 'getPaymentHistory').mockImplementation((result) => {
        const response = original(result);
        if (mode === 'enum') response.items[0].paymentProvider = 999;
        if (mode === 'date') response.items[0].createdAt = undefined;
        if (mode === 'required') response.items[0].productName = '';
        if (mode === 'metadata') response.pagesCount = 999;
        return response;
      });
      const response = await post();
      expect(response.body.data.superadminUser).toMatchObject({ userId, payments: null });
      expect(response.body.errors).toEqual([
        {
          message: 'Internal server error',
          path: ['superadminUser', 'payments'],
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        },
      ]);
    },
  );

  it('keeps actual Payment DB history after working soft-delete and hides administrative parent', async () => {
    await transaction({ linked: true });
    const before = await payment.paymentTransaction.findMany();
    const subscriptions = await payment.subscription.findMany();
    await app
      .get(ModerateUserUseCase)
      .execute({ action: 'DELETE', userId, adminSessionId: sessionId });
    expect(await payment.paymentTransaction.findMany()).toEqual(before);
    expect(await payment.subscription.findMany()).toEqual(subscriptions);
    expect(
      (await app.get(PaymentGrpcClient).getPaymentHistory({ userId, page: 1, pageSize: 8 }))
        .totalCount,
    ).toBe(1);
    expect((await post()).body.data.superadminUser).toBeNull();
  });

  it('preserves existing REST history adapter mapping over the same real client', async () => {
    const id = await transaction({ linked: true });
    const adapter = new PaymentGrpcAdapter(app.get(PaymentGrpcClient));
    const response = await adapter.getPaymentHistory({ userId, page: 1, pageSize: 8 });
    expect(response).toMatchObject({
      totalCount: 1,
      page: 1,
      pageSize: 8,
      items: [
        {
          transactionId: id,
          amountMinor: 899,
          currency: 'EUR',
          paidAt: new Date(NOW).toISOString(),
        },
      ],
    });
  });

  it('keeps real REST history endpoint scoped to authenticated user and its existing defaults/errors', async () => {
    const transactionId = await transaction({ linked: true });
    const deviceId = randomUUID();
    const seconds = Math.floor(Date.now() / 1000);
    await prisma.session.create({
      data: {
        userId,
        deviceId,
        deviceName: 'fixture',
        ip: '127.0.0.1',
        iat: seconds,
        exp: seconds + 3600,
      },
    });
    const jwt = app
      .get(JwtService)
      .sign({ userId, deviceId, tokenType: 'ACCESS' }, { expiresIn: 300 });
    const http = (): request.Test =>
      request(app.getHttpServer())
        .get('/api/v1/payments/history')
        .set('Authorization', `Bearer ${jwt}`);
    const spy = jest.spyOn(history, 'execute');
    const response = await http();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      totalCount: 1,
      page: 1,
      pageSize: 10,
      items: [{ transactionId }],
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ input: { userId, page: 1, pageSize: 10 } }),
    );
    spy.mockClear();
    const bad = await http().query({ pageSize: 51 });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 400, message: 'Validation failed' });
    expect(spy).not.toHaveBeenCalled();
    expect((await request(app.getHttpServer()).get('/api/v1/payments/history')).status).toBe(401);
    // Even a valid signed user JWT/session is not administrative authorization.
    expect(
      (await post({ cookie: 'refreshToken=fixture' }).set('Authorization', `Bearer ${jwt}`)).body
        .errors[0].extensions.code,
    ).toBe('UNAUTHENTICATED');
  });

  it('publishes Payments but no social fields, keeps query budget and Origin protection', async () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    const target = buildSchema(
      readFileSync(
        join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/target.graphql'),
        'utf8',
      ),
    );
    for (const name of [
      'PaymentConnection',
      'PaymentHistoryItem',
      'PaymentProvider',
      'PaymentBillingInterval',
      'PaymentKind',
      'PaymentStatus',
      'CheckoutPurpose',
      'PageInput',
      'PageInfo',
    ]) {
      expect(printType(schema.getType(name)!)).toBe(printType(target.getType(name)!));
    }
    expect(String(schema.getType('SuperadminUser'))).toBe('SuperadminUser');
    expect(schema.getType('PaymentConnection')).toBeDefined();
    expect(schema.getType('Followers')).toBeUndefined();
    expect(schema.getType('Following')).toBeUndefined();
    const spy = jest.spyOn(history, 'execute');
    expect((await post({ origin: 'https://untrusted.example.test' })).status).toBe(403);
    const response = await post({ variables: { id: userId, input: { pageSize: 50 } } });
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT'); // 16 fields x 50 exceeds budget 200.
    expect(spy).not.toHaveBeenCalled();
  });

  it('handles a genuinely stopped gRPC server as null payments, not empty history', async () => {
    await microservice.close();
    const response = await post();
    expect(response.body.data.superadminUser).toMatchObject({ userId, payments: null });
    expect(response.body.errors).toEqual([
      {
        message: 'Service unavailable',
        path: ['superadminUser', 'payments'],
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      },
    ]);
  });
});
