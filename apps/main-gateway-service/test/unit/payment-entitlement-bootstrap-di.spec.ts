import { MODULE_METADATA } from '@nestjs/common/constants';
import { DynamicModule, Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AmqpConnection, RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import type { AppModule as AppModuleType } from '../../src/app.module';
import type { GatewayConfig } from '../../src/core/gateway.config';
import type { PrismaModule as PrismaModuleType } from '../../src/core/prisma/prisma.module';
import type { PrismaService as PrismaServiceType } from '../../src/core/prisma/prisma.service';
import type { UsersModule as UsersModuleType } from '../../src/modules/users/users.module';
import type { PaymentRabbitConsumer as PaymentRabbitConsumerType } from '../../src/modules/users/infrastructure/payment.rabbit.consumer';

describe('PaymentRabbitConsumer bootstrap DI', () => {
  let AppModule: typeof AppModuleType;
  let PrismaModule: typeof PrismaModuleType;
  let PrismaService: typeof PrismaServiceType;
  let UsersModule: typeof UsersModuleType;
  let PaymentRabbitConsumer: typeof PaymentRabbitConsumerType;
  const config = {
    includeTestingModule: false,
    rabbitmqUrl: 'amqp://127.0.0.1:1',
  } as GatewayConfig;

  beforeAll(() => {
    process.env.PAYMENT_ACCOUNT_QUEUE_NAME = 'gateway-payment-account-bootstrap-test';
    AppModule = jest.requireActual('../../src/app.module').AppModule;
    PrismaModule = jest.requireActual('../../src/core/prisma/prisma.module').PrismaModule;
    PrismaService = jest.requireActual('../../src/core/prisma/prisma.service').PrismaService;
    UsersModule = jest.requireActual('../../src/modules/users/users.module').UsersModule;
    PaymentRabbitConsumer = jest.requireActual(
      '../../src/modules/users/infrastructure/payment.rabbit.consumer',
    ).PaymentRabbitConsumer;
  });

  it('registers the consumer once beside the single configured RabbitMQ module', async () => {
    const dynamicAppModule = AppModule.forRoot(config);
    const dynamicProviders: Provider[] = dynamicAppModule.providers ?? [];
    const usersProviders: Provider[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UsersModule) ?? [];
    const staticImports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];
    const rabbitImports = (dynamicAppModule.imports ?? []).filter(
      (module) => (module as DynamicModule).module === RabbitMQModule,
    );

    expect(dynamicProviders.filter((provider) => provider === PaymentRabbitConsumer)).toHaveLength(
      1,
    );
    expect(usersProviders).not.toContain(PaymentRabbitConsumer);
    expect(staticImports).not.toContain(RabbitMQModule);
    expect(rabbitImports).toHaveLength(1);

    const testRabbitModule: DynamicModule = {
      module: class TestRabbitModule {},
      providers: [{ provide: AmqpConnection, useValue: { publish: jest.fn() } }],
      exports: [AmqpConnection],
    };
    const testingModule = await Test.createTestingModule({
      imports: [PrismaModule, testRabbitModule],
      providers: [PaymentRabbitConsumer],
    })
      .overrideProvider(PrismaService)
      .useValue({ $transaction: jest.fn() })
      .compile();

    expect(testingModule.get(PaymentRabbitConsumer)).toBeInstanceOf(PaymentRabbitConsumer);
    expect(testingModule.get(AmqpConnection)).toBeDefined();
    expect(testingModule.get(PrismaService)).toBeDefined();
    await testingModule.close();
  });
});
