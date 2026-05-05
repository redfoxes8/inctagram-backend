import { INestApplication, Type } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { GLOBAL_PREFIX, appSetup } from '../../../../libs/common/src';

import { NotificationConfig } from './notification.config';

type SetupNotificationAppParams = {
  app: INestApplication;
  appModule: Type<unknown>;
  notificationConfig: NotificationConfig;
};

export function setupNotificationApp(params: SetupNotificationAppParams): void {
  const { app, appModule, notificationConfig } = params;

  appSetup(app, appModule, {
    httpConfig: {
      enabled: true,
      enableGlobalPrefix: true,
      enableCors: false,
      enableCookies: false,
      enableSwagger: false,
      globalPrefix: GLOBAL_PREFIX,
    },
    validationCustomConfig: {
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
    },
  });

  const microserviceConfig: MicroserviceOptions = {
    transport: Transport.RMQ,
    options: {
      urls: [notificationConfig.rabbitmqUrl],
      queue: notificationConfig.notificationQueueName,
      queueOptions: {
        durable: true,
      },
      noAck: false,
    },
  };

  app.connectMicroservice<MicroserviceOptions>(microserviceConfig, {
    inheritAppConfig: true,
  });
}
