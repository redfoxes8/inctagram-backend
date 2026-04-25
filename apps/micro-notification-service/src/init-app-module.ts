import { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { NotificationConfig } from './core/notification.config';
import { CoreConfig } from '../../../libs/common/src/core.config';

export async function initAppModule(): Promise<DynamicModule> {
  const appContext = await NestFactory.createApplicationContext(AppModule);

  appContext.get(CoreConfig);

  const notificationConfig = appContext.get<NotificationConfig>(NotificationConfig);

  await appContext.close();

  return AppModule.forRoot(notificationConfig);
}
