import { Module } from '@nestjs/common';
import { ClientsModule, ClientProviderOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';

import { GatewayConfigModule } from '../../core/gateway-config.module';
import { GatewayConfig } from '../../core/gateway.config';
import { IEmailAdapter } from '../auth/application/interfaces/email.adapter.interface';
import { NOTIFICATION_CLIENT, NOTIFICATION_SERVICE_GRPC_CLIENT } from './notification.constants';
import { RabbitNotificationAdapter } from './infrastructure/rabbit-notification.adapter';
import { INCTAGRAM_NOTIFICATION_V1_PACKAGE_NAME } from '../../../../../libs/contracts/src';
import { NotificationGrpcClient } from './infrastructure/notification-grpc.client';
import { AuthTokenModule } from '../auth/auth-token.module';
import { NotificationsGateway } from './api/ws/notifications.gateway';
import { NotificationRealtimePublisher } from './realtime/notification-realtime.publisher';

@Module({
  imports: [
    GatewayConfigModule,
    AuthTokenModule,
    ClientsModule.registerAsync([
      {
        name: NOTIFICATION_CLIENT,
        imports: [GatewayConfigModule],
        inject: [GatewayConfig],
        useFactory: (config: GatewayConfig): ClientProviderOptions => ({
          name: NOTIFICATION_CLIENT,
          transport: Transport.RMQ,
          options: {
            urls: [config.rabbitmqUrl],
            queue: config.notificationQueueName,
            queueOptions: {
              durable: true,
            },
          },
        }),
      },
      {
        name: NOTIFICATION_SERVICE_GRPC_CLIENT,
        imports: [GatewayConfigModule],
        inject: [GatewayConfig],
        useFactory: (config: GatewayConfig): ClientProviderOptions => ({
          name: NOTIFICATION_SERVICE_GRPC_CLIENT,
          transport: Transport.GRPC,
          options: {
            package: INCTAGRAM_NOTIFICATION_V1_PACKAGE_NAME,
            protoPath: join(
              process.cwd(),
              'libs/contracts/src/proto/inctagram/notification/v1/notification.proto',
            ),
            url: config.notificationServiceGrpcUrl,
          },
        }),
      },
    ]),
  ],
  providers: [
    { provide: IEmailAdapter, useClass: RabbitNotificationAdapter },
    NotificationGrpcClient,
    NotificationsGateway,
    NotificationRealtimePublisher,
  ],
  exports: [IEmailAdapter, NotificationGrpcClient, NotificationRealtimePublisher],
})
export class NotificationsModule {}
