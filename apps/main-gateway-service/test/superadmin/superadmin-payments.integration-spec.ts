import type {
  PaymentProvider as ProtoPaymentProvider,
  SuperadminPaymentsSort as ProtoSuperadminPaymentsSort,
} from '../../../../libs/contracts/src/generated/payment';
import { GetSuperadminPaymentsPageHandler } from '../../../micro-payment-service/src/modules/payment/application/queries/get-superadmin-payments-page.query';
import { ISuperadminPaymentsQueryPort } from '../../../micro-payment-service/src/modules/payment/application/ports/superadmin-payments-query.port';
import { SuperadminPaymentsQueryRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/superadmin-payments.query-repository';
import { PaymentConfig } from '../../../micro-payment-service/src/core/payment.config';
import { assertSuperadminBudget } from '../../src/modules/superadmin/api/superadmin-query-budget';
import { type INestApplication, Module, type INestMicroservice } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import bcrypt from 'bcrypt';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { type ServerUnaryCall } from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildSchema,
  printType,
  printSchema,
  lexicographicSortSchema,
  parse,
  validate,
  Kind,
} from 'graphql';
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
import { AuthController } from '../../src/modules/auth/api/auth.controller';
import { LocalStrategy } from '../../src/common/strategies/local.strategy';
import { LoginUseCase } from '../../src/modules/auth/application/use-cases/login.use-case';
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
import { CoreConfig } from '../../../../libs/common/src/core.config';

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
    CqrsModule,
    PaymentsModule,
    UserAccessModule,
    PassportModule,
    GoogleRecaptchaModule.forRoot({
      secretKey: 'unused-fixture',
      response: (): string => '',
      skipIf: true,
    }),
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
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    LocalStrategy,
    LoginUseCase,
    { provide: CoreConfig, useValue: { env: 'test' } },
    { provide: IUsersRepository, useClass: PrismaUsersRepository },
    { provide: IProfileRepository, useClass: ProfileRepository },
    { provide: IPasswordService, useClass: BcryptService },
    { provide: ISessionsRepository, useClass: PrismaSessionsRepository },
    { provide: IJwtService, useClass: JwtServiceImplementation },
  ],
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
  let globalPayments: GetSuperadminPaymentsPageHandler;
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
        GetSuperadminPaymentsPageHandler,
        { provide: ISuperadminPaymentsQueryPort, useClass: SuperadminPaymentsQueryRepository },
        { provide: PaymentConfig, useValue: { userProjectionSyncEnabled: true } },
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
    globalPayments = paymentModule.get(GetSuperadminPaymentsPageHandler);
    const module = await Test.createTestingModule({ imports: [PaymentsFixtureModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AdminClock)
      .useValue({ now: (): Date => new Date(NOW) })
      .overrideProvider(GatewayConfig)
      .useValue({
        paymentServiceGrpcUrl: `127.0.0.1:${port}`,
        jwtSecret: 'payment-rest-fixture-only',
        accessTokenExpTime: 300,
        refreshTokenExpTime: 3600,
      })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          NODE_ENV: 'test',
          SUPERADMIN_PAYMENTS_TIMEOUT_MS: 3000,
          SUPERADMIN_EMAIL: 'acceptance-admin@example.test',
          SUPERADMIN_PASSWORD_HASH: await bcrypt.hash('isolated-final-admin', 10),
        }),
      )
      .compile();
    app = module.createNestApplication();
    setupSuperadminHttp({ app, policy: { allowedOrigins: [ORIGIN] } });
    appSetup(app, PaymentsFixtureModule, {
      httpConfig: { enabled: true, enableGlobalPrefix: true, enableCookies: true },
    });
    await app.init();
  });

  beforeEach(async () => {
    await payment.adminUserProfileReadModel.deleteMany();
    await payment.adminUserProjectionSync.update({
      where: { id: 'payment-user-profile-v1' },
      data: { phase: 'READY' },
    });
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

  it('publishes Payments and FOLLOW-ZERO-1 only, keeps query budget and Origin protection', async () => {
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
      'SuperadminFollowItem',
      'SuperadminFollowConnection',
    ]) {
      expect(printType(schema.getType(name)!)).toBe(printType(target.getType(name)!));
    }
    expect(String(schema.getType('SuperadminUser'))).toBe('SuperadminUser');
    expect(schema.getType('PaymentConnection')).toBeDefined();
    expect(printType(schema.getType('SuperadminUser')!)).toBe(
      printType(target.getType('SuperadminUser')!),
    );
    const spy = jest.spyOn(history, 'execute');
    expect((await post({ origin: 'https://untrusted.example.test' })).status).toBe(403);
    const response = await post({ variables: { id: userId, input: { pageSize: 50 } } });
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT'); // 16 fields x 50 exceeds budget 200.
    expect(spy).not.toHaveBeenCalled();
  });

  it('F connected HTTP journey: login, reason/filter/unblock/new login, global payments, delete, audit and logout', async () => {
    const userPassword = 'isolated-final-user';
    const account = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(userPassword, 10),
        isConfirmed: true,
        profile: { create: { username: 'final-journey-user' } },
      },
    });
    const paymentId = await transaction({ linked: true });
    // Acceptance fixture: READY is seeded in beforeEach, not obtained by bootstrap/rollout.
    await payment.adminUserProfileReadModel.create({
      data: {
        userId,
        sourceVersion: 0n,
        username: 'final-journey-user',
        profileExists: true,
        isDeleted: false,
      },
    });
    const userLogin = (): request.Test =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ usernameOrEmail: account.email, password: userPassword });
    const initialLogin = await userLogin();
    expect(initialLogin.status).toBe(200);
    expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(1);
    const oldAccess: string = initialLogin.body.accessToken;
    const protectedRead = (access: string): request.Test =>
      request(app.getHttpServer())
        .get('/api/v1/payments/history')
        .set('Authorization', `Bearer ${access}`);
    expect((await protectedRead(oldAccess)).status).toBe(200);

    const signIn = await post({
      cookie: '',
      query: 'mutation($input:SuperadminLoginInput!){superadminLogin(input:$input){authenticated}}',
      variables: {
        input: { email: 'acceptance-admin@example.test', password: 'isolated-final-admin' },
      },
    });
    expect(signIn.body).toEqual({ data: { superadminLogin: { authenticated: true } } });
    let cookies = (signIn.headers['set-cookie'] as unknown as string[]).map(
      (value) => value.split(';')[0],
    );
    let csrf = String(signIn.headers['x-superadmin-csrf']);
    const admin = (input: { query: string; variables?: object }): request.Test =>
      post({ ...input, cookie: cookies.join('; ') }).set('X-Superadmin-CSRF', csrf);
    const session = await admin({ query: '{superadminSession{authenticated}}' });
    expect(session.body.data.superadminSession.authenticated).toBe(true);
    // HTTP reload/bootstrap: frontend gets nonce from exposed header, never by reading another host's cookie.
    csrf = String(session.headers['x-superadmin-csrf']);
    const csrfCookie = (session.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    cookies = [...cookies.filter((cookie) => !cookie.startsWith('superadminCsrf=')), csrfCookie];
    const catalogQuery =
      'query($input:SuperadminUsersInput!){superadminUsers(input:$input){items{userId username}totalCount pageInfo{page pageSize pagesCount hasNextPage}}}';
    const catalog = await admin({
      query: catalogQuery,
      variables: { input: { searchUsername: ' JOURNEY ' } },
    });
    expect(catalog.body.data.superadminUsers).toMatchObject({
      totalCount: 1,
      items: [{ userId, username: 'final-journey-user' }],
      pageInfo: { page: 1, pageSize: 8 },
    });
    const detailQuery = `query($userId:ID!){superadminUser(userId:$userId){
      userId username profileUrl state
      payments(input:{}){items{transactionId amountMinor currency}totalCount}
      followers(input:{}){items{userId}totalCount pageInfo{page pageSize pagesCount hasNextPage}}
      following(input:{page:2,pageSize:3}){items{userId}totalCount pageInfo{page pageSize pagesCount hasNextPage}}
    }}`;
    const detail = await admin({ query: detailQuery, variables: { userId } });
    expect(detail.body.errors).toBeUndefined();
    expect(detail.body.data.superadminUser).toEqual({
      userId,
      username: 'final-journey-user',
      profileUrl: null,
      state: 'ACTIVE',
      payments: {
        items: [{ transactionId: paymentId, amountMinor: 899, currency: 'EUR' }],
        totalCount: 1,
      },
      followers: {
        items: [],
        totalCount: 0,
        pageInfo: { page: 1, pageSize: 8, pagesCount: 0, hasNextPage: false },
      },
      following: {
        items: [],
        totalCount: 0,
        pageInfo: { page: 2, pageSize: 3, pagesCount: 0, hasNextPage: false },
      },
    });
    const mutate = async (input: { operation: string; outcome: string }): Promise<void> => {
      const response = await admin({
        query: `mutation($input:SuperadminUserIdInput!){${input.operation}(input:$input){userId outcome}}`,
        variables: { input: { userId } },
      });
      expect(response.body).toEqual({
        data: { [input.operation]: { userId, outcome: input.outcome } },
      });
    };
    const blocked = await admin({
      query:
        'mutation($input:SuperadminUserIdInput!, $reason:SuperadminBanReasonInput){superadminBlockUser(input:$input,reason:$reason){userId outcome}}',
      variables: {
        input: { userId },
        reason: { code: 'ANOTHER_REASON', text: '  Acceptance fixture reason  ' },
      },
    });
    expect(blocked.body).toEqual({ data: { superadminBlockUser: { userId, outcome: 'BLOCKED' } } });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      isBanned: true,
      banReasonCode: 'ANOTHER_REASON',
      banReasonText: 'Acceptance fixture reason',
    });
    expect(
      (
        await admin({
          query: catalogQuery,
          variables: { input: { searchUsername: 'journey', banFilter: 'BLOCKED' } },
        })
      ).body.data.superadminUsers,
    ).toMatchObject({ totalCount: 1, items: [{ userId }], pageInfo: { pageSize: 8 } });
    expect((await protectedRead(oldAccess)).status).toBe(401);
    await mutate({ operation: 'superadminUnblockUser', outcome: 'UNBLOCKED' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      isBanned: false,
      banReasonCode: null,
      banReasonText: null,
    });
    expect(
      (
        await admin({
          query: catalogQuery,
          variables: { input: { searchUsername: 'journey', banFilter: 'NOT_BLOCKED' } },
        })
      ).body.data.superadminUsers,
    ).toMatchObject({ totalCount: 1, items: [{ userId }], pageInfo: { pageSize: 8 } });
    expect((await protectedRead(oldAccess)).status).toBe(401);
    const renewed = await userLogin();
    expect(renewed.status).toBe(200);
    const renewedAccess: string = renewed.body.accessToken;
    expect((await protectedRead(renewedAccess)).status).toBe(200);
    for (let index = 0; index < 6; index++) await transaction({ amount: 100 + index });
    const globalPage = await admin({ query: GLOBAL_QUERY, variables: { input: {} } });
    expect(globalPage.body.errors).toBeUndefined();
    expect(globalPage.body.data.result).toMatchObject({
      totalCount: 7,
      pageInfo: { page: 1, pageSize: 6, pagesCount: 2, hasNextPage: true },
    });
    expect(globalPage.body.data.result.items).toHaveLength(6);
    const nextPayments = await admin({
      query: GLOBAL_QUERY,
      variables: { input: { page: 2, searchUsername: ' JOURNEY ', sort: 'AMOUNT_ASC' } },
    });
    expect(nextPayments.body.errors).toBeUndefined();
    expect(nextPayments.body.data.result).toMatchObject({
      totalCount: 7,
      pageInfo: { page: 2, pageSize: 6, hasNextPage: false },
      items: [
        {
          transactionId: paymentId,
          username: 'final-journey-user',
          amountMinor: 899,
          provider: 'PAYPAL',
        },
      ],
    });
    await mutate({ operation: 'superadminDeleteUser', outcome: 'DELETED' });
    expect((await protectedRead(renewedAccess)).status).toBe(401);
    expect((await userLogin()).status).toBe(401);
    expect(
      (await admin({ query: catalogQuery, variables: { input: { searchUsername: 'journey' } } }))
        .body.data.superadminUsers.totalCount,
    ).toBe(0);
    expect(
      (await admin({ query: detailQuery, variables: { userId } })).body.data.superadminUser,
    ).toBeNull();
    await mutate({ operation: 'superadminDeleteUser', outcome: 'ALREADY_DELETED' });
    const rows = await prisma.adminUserActionAudit.findMany({
      where: { targetUserId: userId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(rows.map((row) => `${row.action}:${row.outcome}`).sort()).toEqual(
      ['BLOCK:BLOCKED', 'UNBLOCK:UNBLOCKED', 'DELETE:DELETED', 'DELETE:ALREADY_DELETED'].sort(),
    );
    expect(new Set(rows.map((row) => row.adminSessionId)).size).toBe(1);
    expect(rows.filter((row) => row.action === 'BLOCK' || row.action === 'UNBLOCK')).toEqual([
      expect.objectContaining({
        action: 'BLOCK',
        banReasonCode: 'ANOTHER_REASON',
        banReasonText: 'Acceptance fixture reason',
      }),
      expect.objectContaining({
        action: 'UNBLOCK',
        banReasonCode: 'ANOTHER_REASON',
        banReasonText: 'Acceptance fixture reason',
      }),
    ]);
    expect(rows[0].adminSessionId).not.toBe(sessionId); // Actor is the actual login session, not seeded fixture principal.
    expect(await payment.paymentTransaction.count({ where: { id: paymentId } })).toBe(1);
    expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(0);
    const signedOut = await admin({ query: 'mutation{superadminLogout{loggedOut}}' });
    expect(signedOut.body.data.superadminLogout.loggedOut).toBe(true);
    expect(
      (await admin({ query: '{superadminSession{authenticated}}' })).body.errors[0].extensions.code,
    ).toBe('UNAUTHENTICATED');
  });

  const GLOBAL_QUERY = `query GlobalPayments($input: SuperadminPaymentsInput!) {
    result: superadminPayments(input: $input) {
      items { transactionId userId username avatarUrl createdAt amountMinor currency productName billingInterval billingIntervalCount provider status }
      totalCount pageInfo { page pageSize pagesCount hasNextPage }
    }
  }`;
  async function globalFixture(): Promise<void> {
    await prisma.profile.create({
      data: { userId, username: 'Fresh_Name', avatarUrl: 'https://avatar.example.test/current' },
    });
    await payment.adminUserProfileReadModel.create({
      data: {
        userId,
        sourceVersion: 9007199254740993n,
        username: 'Snapshot_Alpha',
        profileExists: true,
        isDeleted: false,
      },
    });
    for (let index = 0; index < 7; index++)
      await transaction({
        amount: index + 100,
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      });
    const deletedId = randomUUID(),
      missingId = randomUUID();
    await prisma.user.create({
      data: {
        id: deletedId,
        email: 'deleted-global@fixture.test',
        deletedAt: new Date(NOW),
        profile: {
          create: { username: 'Deleted_Name', avatarUrl: 'https://avatar.example.test/deleted' },
        },
      },
    });
    for (const otherId of [deletedId, missingId]) {
      await payment.adminUserProfileReadModel.create({
        data: {
          userId: otherId,
          sourceVersion: 1n,
          username: 'Stale_' + otherId,
          profileExists: true,
          isDeleted: false,
        },
      });
      const id = await transaction({
        id:
          otherId === deletedId
            ? 'ffffffff-ffff-4fff-8fff-fffffffffff1'
            : 'ffffffff-ffff-4fff-8fff-fffffffffff2',
      });
      await payment.paymentTransaction.update({ where: { id }, data: { userId: otherId } });
    }
  }

  it('P2 global page uses real HTTP/gRPC/DB, enriches once and suppresses deleted/missing user facts', async () => {
    await globalFixture();
    const rpc = jest.spyOn(globalPayments, 'execute');
    const lookup = jest.spyOn(prisma, '$queryRaw');
    const response = await post({ query: GLOBAL_QUERY, variables: { input: {} } });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.result).toMatchObject({
      totalCount: 9,
      pageInfo: { page: 1, pageSize: 6, pagesCount: 2, hasNextPage: true },
    });
    expect(response.body.data.result.items).toHaveLength(6);
    expect(rpc).toHaveBeenCalledTimes(1);
    // Other admin verification queries use Prisma models; this is the sole profile batch SELECT.
    expect(lookup).toHaveBeenCalledTimes(1);
    for (const item of response.body.data.result.items) {
      if (item.userId === userId)
        expect(item).toMatchObject({
          username: 'Snapshot_Alpha',
          avatarUrl: 'https://avatar.example.test/current',
          productName: 'Fixture product',
          billingInterval: 'MONTH',
          billingIntervalCount: 2,
          provider: 'STRIPE',
          status: 'PENDING',
        });
      else expect(item).toMatchObject({ username: null, avatarUrl: null });
    }
    const combined = await post({
      query: GLOBAL_QUERY,
      variables: { input: { page: 2, searchUsername: ' snapshot_alpha ', sort: 'AMOUNT_ASC' } },
    });
    expect(combined.body.errors).toBeUndefined();
    expect(combined.body.data.result).toMatchObject({
      totalCount: 7,
      pageInfo: { page: 2, hasNextPage: false },
      items: [{ amountMinor: 106, username: 'Snapshot_Alpha' }],
    });
    expect(rpc.mock.calls[1][0].input).toMatchObject({
      page: 2,
      searchUsername: 'snapshot_alpha',
      sort: 'AMOUNT_ASC',
    });
  });

  it('P2 global auth/input fail before RPC; query needs no mutation CSRF and fixed-six budget is retained', async () => {
    const rpc = jest.spyOn(globalPayments, 'execute');
    for (const token of [null, app.get(JwtService).sign({ userId })]) {
      const queryRequest = post({ query: GLOBAL_QUERY, variables: { input: {} }, cookie: '' });
      if (token) queryRequest.set('Authorization', 'Bearer ' + token);
      expect((await queryRequest).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    }
    for (const input of [
      { page: 0 },
      { searchUsername: 'x'.repeat(101) },
      { sort: 'INVALID' },
      { pageSize: 6 },
    ]) {
      const response = await post({ query: GLOBAL_QUERY, variables: { input } });
      expect(['BAD_USER_INPUT', 'GRAPHQL_VALIDATION_FAILED']).toContain(
        response.body.errors[0].extensions.code,
      );
    }
    expect(rpc).not.toHaveBeenCalled();
    // 30 item selections cost 180 with six rows, but would exceed 200 with an incorrect default 8.
    const fields = Array.from({ length: 30 }, (_, index) => `a${index}: userId`).join(' ');
    expect(() =>
      assertSuperadminBudget({
        document: parse(`{ alias: superadminPayments(input: {}) { items { ${fields} } } }`),
      }),
    ).not.toThrow();
    expect(() =>
      assertSuperadminBudget({
        document: parse(
          `{ alias: superadminPayments(input: {}) { items { ${fields} extra1:userId extra2:userId extra3:userId extra4:userId } } }`,
        ),
      }),
    ).toThrow();
  });

  it('P2 NOT_READY is null + UPSTREAM_UNAVAILABLE at alias path and preserves other roots', async () => {
    await payment.adminUserProjectionSync.update({
      where: { id: 'payment-user-profile-v1' },
      data: { phase: 'NOT_READY' },
    });
    const response = await post({
      query:
        '{ superadminSession { authenticated } unavailable: superadminPayments(input: {}) { totalCount } }',
      variables: {},
    });
    expect(response.body.data).toEqual({
      superadminSession: { authenticated: true },
      unavailable: null,
    });
    expect(response.body.errors).toEqual([
      {
        message: 'Service unavailable',
        path: ['unavailable'],
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      },
    ]);
  });

  it('P2 malformed response is safe and rejected before enrichment', async () => {
    await globalFixture();
    const client = app.get(PaymentGrpcClient);
    const baseline = await client.getSuperadminPaymentsPageWithTimeout({
      request: { page: 1, sort: 0 },
      timeoutMs: 3000,
    });
    const lookup = jest.spyOn(prisma, '$queryRaw');
    const call = jest.spyOn(client, 'getSuperadminPaymentsPageWithTimeout');
    for (const mode of ['enum', 'date', 'amount', 'snapshot', 'metadata', 'cap']) {
      const corrupt = structuredClone(baseline);
      if (mode === 'enum') corrupt.items[0].paymentProvider = 999 as ProtoPaymentProvider;
      if (mode === 'date') corrupt.items[0].createdAt = undefined;
      if (mode === 'amount') corrupt.items[0].amountMinor = 2147483648;
      if (mode === 'snapshot') corrupt.items[0].userSnapshot!.sourceVersion = '01';
      if (mode === 'metadata') corrupt.pagesCount = 99;
      if (mode === 'cap') corrupt.items.push(corrupt.items[0]);
      call.mockResolvedValue(corrupt);
      const response = await post({ query: GLOBAL_QUERY, variables: { input: {} } });
      expect(response.body.data.result).toBeNull();
      expect(response.body.errors).toEqual([
        {
          message: 'Service unavailable',
          path: ['result'],
          extensions: { code: 'UPSTREAM_UNAVAILABLE' },
        },
      ]);
    }
    expect(lookup).not.toHaveBeenCalled();
    call.mockRejectedValue(new Error('private-programming-fixture'));
    const unexpected = await post({ query: GLOBAL_QUERY, variables: { input: {} } });
    expect(unexpected.body.errors).toEqual([
      {
        message: 'Internal server error',
        path: ['result'],
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      },
    ]);
  });

  it('P2 RPC rejects invalid page and unknown numeric sort, without bypassing query validation', async () => {
    const client = app.get(PaymentGrpcClient);
    await expect(
      client.getSuperadminPaymentsPageWithTimeout({
        request: { page: 0, sort: 0 },
        timeoutMs: 3000,
      }),
    ).rejects.toMatchObject({ code: 400 });
    await expect(
      client.getSuperadminPaymentsPageWithTimeout({
        request: { page: 1, sort: 999 as ProtoSuperadminPaymentsSort },
        timeoutMs: 3000,
      }),
    ).rejects.toMatchObject({ code: 400 });
  });

  it('P2 timeout cancels the real unary call and preserves the nullable root', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cancel!: () => void;
    const cancellation = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    cancelled = cancel;
    const execute = globalPayments.execute.bind(globalPayments);
    jest.spyOn(globalPayments, 'execute').mockImplementation(async (query) => {
      await held;
      return execute(query);
    });
    jest.spyOn(app.get(SuperadminPaymentsConfig), 'timeoutMs', 'get').mockReturnValue(75);
    try {
      const response = await post({ query: GLOBAL_QUERY, variables: { input: {} } });
      expect(response.body.data.result).toBeNull();
      expect(response.body.errors[0]).toMatchObject({
        path: ['result'],
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      });
      await cancellation;
    } finally {
      release();
    }
  });

  it('validates every executable FE guide GraphQL example and checks reproducible runtime export', () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    if (process.env.UPDATE_SUPERADMIN_RUNTIME === 'true')
      writeFileSync(
        join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
        printSchema(lexicographicSortSchema(schema)) + '\n',
      );
    const artifact = readFileSync(
      join(process.cwd(), 'libs/contracts/src/graphql/superadmin/v1/runtime.graphql'),
      'utf8',
    );
    // Compare canonical SDL, not Prettier's block-string layout.
    expect(printSchema(lexicographicSortSchema(schema))).toBe(
      printSchema(lexicographicSortSchema(buildSchema(artifact))),
    );
    const guide = readFileSync(join(process.cwd(), 'GRAPHQL_SUPERADMIN_FRONTEND_API.md'), 'utf8');
    let examples = 0;
    for (const match of guide.matchAll(/```graphql\s*\n([\s\S]*?)```/g)) {
      const document = parse(match[1]);
      if (
        document.definitions.some((definition) => definition.kind === Kind.OPERATION_DEFINITION)
      ) {
        expect(validate(schema, document)).toEqual([]);
        examples++;
      }
    }
    expect(examples).toBeGreaterThanOrEqual(9);
  });

  it('handles a genuinely stopped gRPC server as null payments, not empty history', async () => {
    await microservice.close();
    const global = await post({ query: GLOBAL_QUERY, variables: { input: {} } });
    expect(global.body.data.result).toBeNull();
    expect(global.body.errors[0]).toMatchObject({
      path: ['result'],
      extensions: { code: 'UPSTREAM_UNAVAILABLE' },
    });
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
