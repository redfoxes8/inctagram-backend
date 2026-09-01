import { NestFactory } from '@nestjs/core';
import { Type } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { join } from 'path';

import { appSetup } from '../../../libs/common/src/setup/app-setup';

import { initAppModule } from './init-app-module';
import { PaymentConfig } from './core/payment.config';

import { INCTAGRAM_PAYMENT_V1_PACKAGE_NAME } from '../../../libs/contracts/src';

async function bootstrap(): Promise<void> {
  // Сначала валидируем конфигурацию
  const dynamicAppModule = await initAppModule();

  // Затем создаем полноценное приложение
  const app = await NestFactory.create(dynamicAppModule);
  app.enableShutdownHooks();

  const paymentConfig = app.get(PaymentConfig);

  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: INCTAGRAM_PAYMENT_V1_PACKAGE_NAME,
      protoPath: join(process.cwd(), 'libs/contracts/src/proto/payment.proto'),
      url: `${paymentConfig.grpcHost}:${paymentConfig.grpcPort}`,
    },
  };

  appSetup(app, dynamicAppModule as unknown as Type<any>, {
    httpConfig: {
      enabled: true,
    },
    rpcConfig: {
      enabled: true,
      grpcPipes: true,
      options: grpcOptions,
    },
  });

  await app.startAllMicroservices();

  await app.listen(paymentConfig.port);

  console.log(`Micro-payment-service is running on: ${await app.getUrl()} (HTTP)`);

  console.log(
    `Payment gRPC server is running on: ${paymentConfig.grpcHost}:${paymentConfig.grpcPort}`,
  );
}

bootstrap();
