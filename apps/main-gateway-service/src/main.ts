import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { initAppModule } from './init-app-module';
import { GLOBAL_PREFIX, appSetup } from '../../../libs/common/src';
import { GatewayConfig } from './core/gateway.config';

async function bootstrap() {
  const dynamicAppModule = await initAppModule();

  const app = await NestFactory.create(dynamicAppModule);

  appSetup(app, AppModule, {
    httpConfig: {
      enabled: true,
      enableGlobalPrefix: true,
      enableCors: true,
      enableCookies: true,
      enableSwagger: true,
      globalPrefix: GLOBAL_PREFIX,
      swagger: {
        description: 'main-gateway-service',
        title: 'Main Gateway API',
        version: '1.0.0',
      },
    },
  });

  const gatewayConfig = app.get<GatewayConfig>(GatewayConfig);

  await app.listen(gatewayConfig.port);

  console.log(`Gateway is running on port ${gatewayConfig.port}`);
}
bootstrap();
