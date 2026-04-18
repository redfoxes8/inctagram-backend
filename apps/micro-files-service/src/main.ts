import { NestFactory } from '@nestjs/core';
import { initAppModule } from './init-app-module';
import { FilesConfig } from './core/files.config';

async function bootstrap() {
  const appModule = await initAppModule();
  const app = await NestFactory.create(appModule);

  app.setGlobalPrefix('api');

  const filesConfig = app.get<FilesConfig>(FilesConfig);

  await app.listen(filesConfig.port);
  console.log(`Micro-files-service is running on: ${filesConfig.port}`);
}
bootstrap();
