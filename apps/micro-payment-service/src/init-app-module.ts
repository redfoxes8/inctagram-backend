import { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CoreConfig } from '../../../libs/common/src/core.config';

import { AppModule } from './app.module';
import { PaymentConfig } from './core/payment.config';

export async function initAppModule(): Promise<DynamicModule> {
  const appContext = await NestFactory.createApplicationContext(AppModule);

  // Принудительно валидируем общие настройки проекта
  appContext.get(CoreConfig);

  // Валидируем настройки Payment MS
  const paymentConfig = appContext.get<PaymentConfig>(PaymentConfig);

  await appContext.close();

  return AppModule.forRoot(paymentConfig);
}
