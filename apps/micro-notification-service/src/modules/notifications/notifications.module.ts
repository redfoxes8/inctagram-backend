import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { IMailAdapter } from '../../application/interfaces/mail-adapter.interface';
import { NotificationConfigModule } from '../../core/notification-config.module';
import { NotificationsController } from './api/rabbit/notifications.controller';
import { NotificationsService } from './application/notifications.service';
import { NodemailerMailAdapter } from '../../infrastructure/adapters/email/nodemailer-mail.adapter';
import { UserGrpcClientModule } from './infrastructure/grpc/user/user-grpc-client.module';
import { SendPaymentSucceededEmailHandler } from './application/commands/send-payment-succeeded-email.command';
import { SendPaymentFailedEmailHandler } from './application/commands/send-payment-failed-email.command';
import { SendSubscriptionExpiredEmailHandler } from './application/commands/send-subscription-expired-email.command';
import { PaymentEventsConsumer } from './api/rabbit/payment-events.consumer';
import { NotificationPrismaService } from '../../core/prisma/prisma.service';
import { INotificationPersistencePort } from './application/ports/notification-persistence.port';
import { PersistRequestedNotificationService } from './application/services/persist-requested-notification.service';
import { PrismaNotificationPersistenceRepository } from './infrastructure/repositories/prisma-notification-persistence.repository';
import { PersistedPaymentNotificationConsumer } from './api/rabbit/persisted-payment-notification.consumer';
import { NotificationOutboxRepository } from './infrastructure/repositories/notification-outbox.repository';
import { NotificationOutboxPublisher } from './infrastructure/messaging/notification-outbox.publisher';
import { NotificationOutboxRecoveryService } from './infrastructure/messaging/notification-outbox-recovery.service';
import { INotificationHistoryPort } from './application/ports/notification-history.port';
import { PrismaNotificationHistoryRepository } from './infrastructure/repositories/prisma-notification-history.repository';
import { NotificationClock } from './application/ports/notification-clock.port';
import { SystemNotificationClock } from './infrastructure/clock/system-notification.clock';
import { GetNotificationsService } from './application/services/get-notifications.service';
import { GetUnseenNotificationCountService } from './application/services/get-unseen-notification-count.service';
import { MarkNotificationsSeenService } from './application/services/mark-notifications-seen.service';
import { NotificationGrpcController } from './api/grpc/notification-grpc.controller';
import {
  PERSISTED_NOTIFICATION_DLQ_NAME,
  PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY,
  PERSISTED_NOTIFICATION_EXCHANGE,
  PERSISTED_NOTIFICATION_QUEUE_NAME,
  PERSISTED_NOTIFICATION_RETRY_DELAY_MS,
  PERSISTED_NOTIFICATION_RETRY_QUEUE_NAME,
  PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY,
} from './api/rabbit/persisted-notification-rabbit.constants';
import { PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY } from '../../../../../libs/contracts/src/events/notification-events-v1.event';

const commandHandlers = [
  SendPaymentSucceededEmailHandler,
  SendPaymentFailedEmailHandler,
  SendSubscriptionExpiredEmailHandler,
];

@Module({
  imports: [
    CqrsModule,
    NotificationConfigModule,
    UserGrpcClientModule,
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
          name: PERSISTED_NOTIFICATION_RETRY_QUEUE_NAME,
          options: {
            durable: true,
            arguments: {
              'x-message-ttl': PERSISTED_NOTIFICATION_RETRY_DELAY_MS,
              'x-dead-letter-exchange': PERSISTED_NOTIFICATION_EXCHANGE,
              'x-dead-letter-routing-key': PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
            },
          },
          exchange: PERSISTED_NOTIFICATION_EXCHANGE,
          routingKey: PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY,
        },
        {
          name: PERSISTED_NOTIFICATION_DLQ_NAME,
          options: { durable: true },
          exchange: PERSISTED_NOTIFICATION_EXCHANGE,
          routingKey: PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY,
        },
        {
          name: PERSISTED_NOTIFICATION_QUEUE_NAME,
          options: { durable: true },
          exchange: PERSISTED_NOTIFICATION_EXCHANGE,
          routingKey: PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
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
  ],
  controllers: [NotificationsController, NotificationGrpcController],
  providers: [
    NotificationsService,
    PaymentEventsConsumer,
    PersistedPaymentNotificationConsumer,
    {
      provide: IMailAdapter,
      useClass: NodemailerMailAdapter,
    },

    ...commandHandlers,
    NotificationPrismaService,
    PersistRequestedNotificationService,
    PrismaNotificationPersistenceRepository,
    NotificationOutboxRepository,
    NotificationOutboxPublisher,
    NotificationOutboxRecoveryService,
    PrismaNotificationHistoryRepository,
    SystemNotificationClock,
    GetNotificationsService,
    GetUnseenNotificationCountService,
    MarkNotificationsSeenService,
    {
      provide: INotificationPersistencePort,
      useExisting: PrismaNotificationPersistenceRepository,
    },
    {
      provide: INotificationHistoryPort,
      useExisting: PrismaNotificationHistoryRepository,
    },
    {
      provide: NotificationClock,
      useExisting: SystemNotificationClock,
    },
  ],
  exports: [IMailAdapter, NotificationsService, PersistRequestedNotificationService],
})
export class NotificationsModule {}
