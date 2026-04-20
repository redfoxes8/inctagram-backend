import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { initAppModule } from './init-app-module';
import { GLOBAL_PREFIX, appSetup } from '../../../libs/common/src';
import { FilesConfig } from './core/files.config';

async function bootstrap() {
  const appModule = await initAppModule();
  const app = await NestFactory.create(appModule);

  appSetup(app, AppModule, {
    httpConfig: {
      enabled: false,
      enableGlobalPrefix: false,
      enableCors: false,
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
    },
  });

  const filesConfig = app.get<FilesConfig>(FilesConfig);

  await app.listen(filesConfig.port);
  console.log(`Micro-files-service is running on: ${filesConfig.port}`);
}
bootstrap();
