import { Module } from '@nestjs/common';
import { ClientsModule, ClientProviderOptions, Transport } from '@nestjs/microservices';

import { GatewayConfigModule } from '../../core/gateway-config.module';
import { GatewayConfig } from '../../core/gateway.config';
import { IEmailAdapter } from '../auth/application/interfaces/email.adapter.interface';
import { NOTIFICATION_CLIENT } from './notification.constants';
import { RabbitNotificationAdapter } from './infrastructure/rabbit-notification.adapter';

@Module({
  imports: [
    GatewayConfigModule,
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
    ]),
  ],
  providers: [{ provide: IEmailAdapter, useClass: RabbitNotificationAdapter }],
  exports: [IEmailAdapter],
})
export class NotificationsModule {}
