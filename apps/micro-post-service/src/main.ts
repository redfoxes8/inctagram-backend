import { NestFactory } from '@nestjs/core';
import { Type } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { join } from 'path';
import { appSetup } from '../../../libs/common/src/setup/app-setup';
import { PostConfig } from './core/post.config';
import { INCTAGRAM_POST_V1_PACKAGE_NAME } from '../../../libs/contracts/src';
import { initAppModule } from './init-app-module';

async function bootstrap(): Promise<void> {
  const dynamicAppModule = await initAppModule();
  const app = await NestFactory.create(dynamicAppModule);
  const postConfig = app.get(PostConfig);

  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: INCTAGRAM_POST_V1_PACKAGE_NAME,
      protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
      url: `${postConfig.grpcHost}:${postConfig.grpcPort}`,
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
  await app.listen(postConfig.port);

  console.log(`Micro-post-service is running on: ${await app.getUrl()} (HTTP)`);
  console.log(`gRPC server is running on: ${postConfig.grpcHost}:${postConfig.grpcPort}`);
}
bootstrap();
