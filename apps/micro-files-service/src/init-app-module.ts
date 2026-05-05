import { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CoreConfig } from '../../../libs/common/src/core.config';

import { AppModule } from './app.module';
import { FilesConfig } from './core/files.config';

export async function initAppModule(): Promise<DynamicModule> {
  const appContext = await NestFactory.createApplicationContext(AppModule);

  appContext.get(CoreConfig);

  const filesConfig = appContext.get<FilesConfig>(FilesConfig);

  await appContext.close();

  return AppModule.forRoot(filesConfig);
}
