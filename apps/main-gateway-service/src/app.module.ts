import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GatewayConfig } from './core/gateway.config';
import { CoreModule } from '../../../libs/common/src/core.module';
import { CommonModule } from '../../../libs/common/src';
import { GatewayConfigModule } from './core/gateway-config.module';
import { GatewayController } from './modules/testing/api/gateway.controller';
import { FilesHttpClient } from './modules/testing/infrastructure/files-http.client';
import { PrismaModule } from './core/prisma/prisma.module';
import { PrismaTestController } from './modules/testing/api/prisma-test.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { CoreConfig } from '../../../libs/common/src/core.config';
import { PostsModule } from './modules/posts/posts.module';
import { FilesModule } from './modules/files/files.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import {
  PAYMENT_ENTITLEMENT_DLQ_NAME,
  PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY,
  PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY,
  PAYMENT_ENTITLEMENT_RETRY_QUEUE_NAME,
  PAYMENT_ENTITLEMENT_RETRY_READY_ROUTING_KEY,
  PaymentRabbitConsumer,
} from './modules/users/infrastructure/payment.rabbit.consumer';

@Module({
  imports: [
    CommonModule,
    CoreModule,
    GatewayConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    PostsModule,
    FilesModule,
    PaymentsModule,
    GoogleRecaptchaModule.forRootAsync({
      inject: [GatewayConfig, CoreConfig],
      useFactory: (config: GatewayConfig, coreConfig: CoreConfig) => {
        return {
          secretKey: config.recaptchaSecret,
          response: (req) => req.headers.recaptcha,
          skipIf: coreConfig.env !== 'production',
        };
      },
    }),
  ],
  controllers: [GatewayController, PrismaTestController],
  providers: [FilesHttpClient],
})
export class AppModule {
  // лучше чтобы все инфраструктурные подключения
  // (RabbitMQ, gRPC и т.д.) находились только внутри forRoot()
  static forRoot(config: GatewayConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [
        RabbitMQModule.forRoot({
          exchanges: [
            {
              name: 'common_exchange',
              type: 'topic',
            },
          ],

          uri: config.rabbitmqUrl,

          queues: [
            {
              name: PAYMENT_ENTITLEMENT_RETRY_QUEUE_NAME,
              options: {
                durable: true,
                arguments: {
                  'x-dead-letter-exchange': 'common_exchange',
                  'x-dead-letter-routing-key': PAYMENT_ENTITLEMENT_RETRY_READY_ROUTING_KEY,
                },
              },
              exchange: 'common_exchange',
              routingKey: PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY,
            },
            {
              name: PAYMENT_ENTITLEMENT_DLQ_NAME,
              options: { durable: true },
              exchange: 'common_exchange',
              routingKey: PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY,
            },
          ],

          connectionInitOptions: { wait: false },
        }),
      ],
      controllers: [GatewayController],
      providers: [FilesHttpClient, PaymentRabbitConsumer],
    };
  }
}
