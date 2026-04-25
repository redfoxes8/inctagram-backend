import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { initAppModule } from './init-app-module';
import { NotificationConfig } from './core/notification.config';
import { setupNotificationApp } from './core/setup-notification-app';

async function bootstrap(): Promise<void> {
  const dynamicAppModule = await initAppModule();
  const app = await NestFactory.create(dynamicAppModule);
  const notificationConfig = app.get<NotificationConfig>(NotificationConfig);

  setupNotificationApp({
    app,
    appModule: dynamicAppModule as unknown as Type<unknown>,
    notificationConfig,
  });

  await app.startAllMicroservices();
  await app.listen(notificationConfig.port);
  console.log(`Micro-notification-service is running on port ${notificationConfig.port}`);
  console.log('Micro-notification-service RabbitMQ transport connected');

  app.enableShutdownHooks();
}

bootstrap();
