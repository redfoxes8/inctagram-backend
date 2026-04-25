import { Module } from '@nestjs/common';

import { IMailAdapter } from '../../application/interfaces/mail-adapter.interface';
import { NotificationConfigModule } from '../../core/notification-config.module';
import { NodemailerMailAdapter } from '../../infrastructure/adapters/email/nodemailer-mail.adapter';
import { NotificationsController } from './api/notifications.controller';
import { NotificationsService } from './application/notifications.service';

@Module({
  imports: [NotificationConfigModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: IMailAdapter,
      useClass: NodemailerMailAdapter,
    },
  ],
  exports: [IMailAdapter, NotificationsService],
})
export class NotificationsModule {}
