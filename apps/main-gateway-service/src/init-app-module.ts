import { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GatewayConfig } from './core/gateway.config';
import { CoreConfig } from '../../../libs/common/src/core.config';

export async function initAppModule(): Promise<DynamicModule> {
  // Create a temporary application context to load the configuration
  const appContext = await NestFactory.createApplicationContext(AppModule);

  // if NODE_ENV not set, the application will crash here.
  appContext.get(CoreConfig);

  // Retrieve the GatewayConfig from the application context
  const gatewayConfig = appContext.get<GatewayConfig>(GatewayConfig);

  // Close the temporary application context
  await appContext.close();

  return AppModule.forRoot(gatewayConfig);
}
