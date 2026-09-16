import { MODULE_METADATA } from '@nestjs/common/constants';
import { DynamicModule, Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AmqpConnection, RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import type { AppModule as AppModuleType } from '../../src/app.module';
import type { GatewayConfig } from '../../src/core/gateway.config';
import type { GatewayRabbitMqModule as GatewayRabbitMqModuleType } from '../../src/core/gateway-rabbitmq.module';
import type { PrismaModule as PrismaModuleType } from '../../src/core/prisma/prisma.module';
import type { PrismaService as PrismaServiceType } from '../../src/core/prisma/prisma.service';
import type { UsersModule as UsersModuleType } from '../../src/modules/users/users.module';
import type { PaymentRabbitConsumer as PaymentRabbitConsumerType } from '../../src/modules/users/infrastructure/payment.rabbit.consumer';
import type { NotificationLiveEventConsumer as NotificationLiveEventConsumerType } from '../../src/modules/notifications/infrastructure/notification-live-event.consumer';
import type { NotificationLiveEventPublisher as NotificationLiveEventPublisherType } from '../../src/modules/notifications/infrastructure/notification-live-event.publisher';
import type { NotificationRealtimePublisher as NotificationRealtimePublisherType } from '../../src/modules/notifications/realtime/notification-realtime.publisher';

describe('PaymentRabbitConsumer bootstrap DI', () => {
  let AppModule: typeof AppModuleType;
  let PrismaModule: typeof PrismaModuleType;
  let PrismaService: typeof PrismaServiceType;
  let UsersModule: typeof UsersModuleType;
  let PaymentRabbitConsumer: typeof PaymentRabbitConsumerType;
  let NotificationLiveEventConsumer: typeof NotificationLiveEventConsumerType;
  let NotificationLiveEventPublisher: typeof NotificationLiveEventPublisherType;
  let NotificationRealtimePublisher: typeof NotificationRealtimePublisherType;
  let GatewayRabbitMqModule: typeof GatewayRabbitMqModuleType;
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
    NotificationLiveEventConsumer = jest.requireActual(
      '../../src/modules/notifications/infrastructure/notification-live-event.consumer',
    ).NotificationLiveEventConsumer;
    NotificationLiveEventPublisher = jest.requireActual(
      '../../src/modules/notifications/infrastructure/notification-live-event.publisher',
    ).NotificationLiveEventPublisher;
    NotificationRealtimePublisher = jest.requireActual(
      '../../src/modules/notifications/realtime/notification-realtime.publisher',
    ).NotificationRealtimePublisher;
    GatewayRabbitMqModule = jest.requireActual(
      '../../src/core/gateway-rabbitmq.module',
    ).GatewayRabbitMqModule;
  });

  it('registers both consumers beside one configured RabbitMQ module', async () => {
    const dynamicAppModule = AppModule.forRoot(config);
    const dynamicProviders: Provider[] = dynamicAppModule.providers ?? [];
    const usersProviders: Provider[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UsersModule) ?? [];
    const staticImports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];
    const gatewayRabbitImports = (dynamicAppModule.imports ?? []).filter(
      (module) => (module as DynamicModule).module === GatewayRabbitMqModule,
    );
    const rabbitImports = ((gatewayRabbitImports[0] as DynamicModule).imports ?? []).filter(
      (module) => (module as DynamicModule).module === RabbitMQModule,
    );

    expect(dynamicProviders.filter((provider) => provider === PaymentRabbitConsumer)).toHaveLength(
      1,
    );
    expect(
      dynamicProviders.filter((provider) => provider === NotificationLiveEventConsumer),
    ).toHaveLength(1);
    expect(
      dynamicProviders.filter((provider) => provider === NotificationLiveEventPublisher),
    ).toHaveLength(1);
    expect(usersProviders).not.toContain(PaymentRabbitConsumer);
    expect(staticImports).not.toContain(RabbitMQModule);
    expect(gatewayRabbitImports).toHaveLength(1);
    expect(rabbitImports).toHaveLength(1);

    const testRabbitModule: DynamicModule = {
      module: class TestRabbitModule {},
      providers: [{ provide: AmqpConnection, useValue: { publish: jest.fn() } }],
      exports: [AmqpConnection],
    };
    const testingModule = await Test.createTestingModule({
      imports: [PrismaModule, testRabbitModule],
      providers: [
        PaymentRabbitConsumer,
        NotificationLiveEventConsumer,
        NotificationLiveEventPublisher,
        NotificationRealtimePublisher,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ $transaction: jest.fn() })
      .compile();

    expect(testingModule.get(PaymentRabbitConsumer)).toBeInstanceOf(PaymentRabbitConsumer);
    expect(testingModule.get(NotificationLiveEventConsumer)).toBeInstanceOf(
      NotificationLiveEventConsumer,
    );
    expect(testingModule.get(AmqpConnection)).toBeDefined();
    expect(testingModule.get(PrismaService)).toBeDefined();
    await testingModule.close();
  });
});
