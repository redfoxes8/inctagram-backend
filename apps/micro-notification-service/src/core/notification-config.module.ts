import { Global, Module } from '@nestjs/common';

import { NotificationConfig } from './notification.config';

@Global()
@Module({
  providers: [NotificationConfig],
  exports: [NotificationConfig],
})
export class NotificationConfigModule {}
