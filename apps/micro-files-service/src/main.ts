import { NestFactory } from '@nestjs/core';
import { Type } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { join } from 'path';

import { initAppModule } from './init-app-module';
import { GLOBAL_PREFIX, appSetup } from '../../../libs/common/src';
import { FilesConfig } from './core/files.config';
import { INCTAGRAM_FILE_V1_PACKAGE_NAME } from '../../../libs/contracts/src';

async function bootstrap() {
  const dynamicAppModule = await initAppModule();
  const app = await NestFactory.create(dynamicAppModule);

  const filesConfig = app.get<FilesConfig>(FilesConfig);

  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: INCTAGRAM_FILE_V1_PACKAGE_NAME,
      protoPath: join(process.cwd(), 'libs/contracts/src/proto/file.proto'),
      url: `${filesConfig.grpcHost}:${filesConfig.grpcPort}`,
    },
  };

  const rmqOptions: MicroserviceOptions = {
    transport: Transport.RMQ,
    options: {
      urls: [filesConfig.rabbitmqUrl],
      queue: filesConfig.filesEventsQueue,
      queueOptions: {
        durable: true,
      },
    },
  };

  app.connectMicroservice<MicroserviceOptions>(rmqOptions);

  app.enableShutdownHooks();

  appSetup(app, dynamicAppModule as unknown as Type<any>, {
    httpConfig: {
      enabled: true,
      enableGlobalPrefix: true,
      enableCors: true,
      enableCookies: false,
      enableSwagger: false,
      globalPrefix: GLOBAL_PREFIX,
      swagger: {
        description: 'micro-files-service',
        title: 'Files API',
        version: '1.0.0',
      },
    },
    rpcConfig: {
      enabled: true,
      grpcPipes: true,
      tcpPipes: true,
      options: grpcOptions,
    },
  });

  await app.startAllMicroservices();
  await app.listen(filesConfig.port);
  console.log(`Micro-files-service is running on: ${filesConfig.port} (HTTP)`);
  console.log(`gRPC server is running on: ${filesConfig.grpcHost}:${filesConfig.grpcPort}`);
}
bootstrap();
