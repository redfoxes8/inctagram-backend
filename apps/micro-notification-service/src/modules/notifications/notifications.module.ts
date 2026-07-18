import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

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

const commandHandlers = [
  SendPaymentSucceededEmailHandler,
  SendPaymentFailedEmailHandler,
  SendSubscriptionExpiredEmailHandler,
];

@Module({
  imports: [CqrsModule, NotificationConfigModule, UserGrpcClientModule],
  controllers: [NotificationsController, PaymentEventsConsumer],
  providers: [
    NotificationsService,
    {
      provide: IMailAdapter,
      useClass: NodemailerMailAdapter,
    },

    ...commandHandlers,
  ],
  exports: [IMailAdapter, NotificationsService],
})
export class NotificationsModule {}
