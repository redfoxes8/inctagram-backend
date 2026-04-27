import { NestFactory } from '@nestjs/core';
import { Type } from '@nestjs/common';

import { initAppModule } from './init-app-module';
import { GLOBAL_PREFIX, appSetup } from '../../../libs/common/src';
import { GatewayConfig } from './core/gateway.config';
import { swaggerSetup } from './core/config/swagger.setup';

async function bootstrap() {
  const dynamicAppModule = await initAppModule();

  const app = await NestFactory.create(dynamicAppModule);

  appSetup(app, dynamicAppModule as unknown as Type<any>, {
    httpConfig: {
      enabled: true,
      enableGlobalPrefix: true,
      enableCors: true,
      enableCookies: true,
      enableSwagger: false,
      globalPrefix: GLOBAL_PREFIX,
    },
  });

  swaggerSetup(app);

  const gatewayConfig = app.get<GatewayConfig>(GatewayConfig);

  await app.listen(gatewayConfig.port);


  console.log(`Gateway is running on port ${gatewayConfig.port}`);
}
bootstrap();
