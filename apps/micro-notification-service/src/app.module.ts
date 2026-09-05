import { DynamicModule, Module } from '@nestjs/common';

import { CoreModule } from '../../../libs/common/src/core.module';

import { MicroNotificationServiceController } from './micro-notification-service.controller';
import { MicroNotificationServiceService } from './micro-notification-service.service';
import { NotificationConfig } from './core/notification.config';
import { NotificationConfigModule } from './core/notification-config.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';

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
        ScheduleModule.forRoot(),
        NotificationsModule,
      ],
      controllers: [MicroNotificationServiceController],
      providers: [MicroNotificationServiceService],
    };
  }
}
