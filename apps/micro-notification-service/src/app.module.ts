import { DynamicModule, Module } from '@nestjs/common';

import { CoreModule } from '../../../libs/common/src/core.module';

import { MicroNotificationServiceController } from './micro-notification-service.controller';
import { MicroNotificationServiceService } from './micro-notification-service.service';
import { NotificationConfig } from './core/notification.config';
import { NotificationConfigModule } from './core/notification-config.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [CoreModule, NotificationConfigModule],
  controllers: [MicroNotificationServiceController],
  providers: [MicroNotificationServiceService],
})
export class AppModule {
  static forRoot(config: NotificationConfig): DynamicModule {
    void config;
    return {
      module: AppModule,
      imports: [
        CoreModule,
        NotificationConfigModule,
        RabbitMQModule.forRoot({
          exchanges: [{ name: 'common_exchange', type: 'topic' }],
          uri: process.env.RABBITMQ_URL || '',
          queues: [
            {
              name: process.env.PAYMENT_NOTIFICATION_QUEUE_NAME || 'payment-notification-queue',
              options: {
                durable: true,
                arguments: {
                  'x-dead-letter-exchange': 'common_exchange',
                  'x-dead-letter-routing-key': 'notification.payment.dlq',
                },
              },
              exchange: 'common_exchange',
              routingKey: [
                'payment.succeeded',
                'payment.failed',
                'subscription.queued',
                'subscription.activated',
                'payment.subscription.expired',
                'subscription.auto-renew.changed',
              ],
            },
            {
              name: process.env.PAYMENT_NOTIFICATION_DLQ_NAME || 'payment-notification-dlq',
              options: { durable: true },
              exchange: 'common_exchange',
              routingKey: 'notification.payment.dlq',
            },
          ],
          connectionInitOptions: { wait: false },
        }),
        NotificationsModule,
      ],
      controllers: [MicroNotificationServiceController],
      providers: [MicroNotificationServiceService],
    };
  }
}
