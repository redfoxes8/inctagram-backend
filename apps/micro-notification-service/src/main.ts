import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';

import { initAppModule } from './init-app-module';
import { NotificationConfig } from './core/notification.config';
import { setupNotificationApp } from './core/setup-notification-app';
import { INCTAGRAM_NOTIFICATION_V1_PACKAGE_NAME } from '../../../libs/contracts/src';

async function bootstrap(): Promise<void> {
  const dynamicAppModule = await initAppModule();
  const app = await NestFactory.create(dynamicAppModule);
  const notificationConfig = app.get<NotificationConfig>(NotificationConfig);
  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: INCTAGRAM_NOTIFICATION_V1_PACKAGE_NAME,
      protoPath: join(
        process.cwd(),
        'libs/contracts/src/proto/inctagram/notification/v1/notification.proto',
      ),
      url: `${notificationConfig.grpcHost}:${notificationConfig.grpcPort}`,
    },
  };

  setupNotificationApp({
    app,
    appModule: dynamicAppModule as unknown as Type<unknown>,
    notificationConfig,
  });
  app.connectMicroservice<MicroserviceOptions>(grpcOptions);

  await app.startAllMicroservices();
  await app.listen(notificationConfig.port);
  console.log(`Micro-notification-service is running on port ${notificationConfig.port}`);
  console.log('Micro-notification-service RabbitMQ transport connected');
  console.log(
    `Micro-notification-service gRPC server is running on ${notificationConfig.grpcHost}:${notificationConfig.grpcPort}`,
  );

  app.enableShutdownHooks();
}

bootstrap();
