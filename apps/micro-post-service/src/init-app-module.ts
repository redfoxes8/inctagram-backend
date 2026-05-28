import { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CoreConfig } from '../../../libs/common/src/core.config';

import { AppModule } from './app.module';
import { PostConfig } from './core/post.config';

export async function initAppModule(): Promise<DynamicModule> {
  const appContext = await NestFactory.createApplicationContext(AppModule);

  appContext.get(CoreConfig);

  const postConfig = appContext.get<PostConfig>(PostConfig);

  await appContext.close();

  return AppModule.forRoot(postConfig);
}
