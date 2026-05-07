import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';
import { appSetup } from '../../../libs/common/src/setup/app-setup';
import { PostConfig } from './core/post.config';
import { INCTAGRAM_POST_V1_PACKAGE_NAME } from '../../../libs/contracts/src';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const postConfig = app.get(PostConfig);

  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: INCTAGRAM_POST_V1_PACKAGE_NAME,
      protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
      url: `${postConfig.grpcHost}:${postConfig.grpcPort}`,
    },
  };

  appSetup(app, AppModule, {
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
