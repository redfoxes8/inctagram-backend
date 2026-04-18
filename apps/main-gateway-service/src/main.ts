import { NestFactory } from '@nestjs/core';
import { initAppModule } from './init-app-module';
import { GatewayConfig } from './core/gateway.config';

async function bootstrap() {
  const DynamicAppModule = await initAppModule();

  const app = await NestFactory.create(DynamicAppModule);

  app.setGlobalPrefix('api'); // make setup files

  const gatewayConfig = app.get<GatewayConfig>(GatewayConfig);

  await app.listen(gatewayConfig.port ?? 3003);

  console.log(`Gateway is running on port ${gatewayConfig.port}`);
}
bootstrap();
