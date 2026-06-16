import { NestFactory } from '@nestjs/core';
import { Type } from '@nestjs/common';

import { initAppModule } from './init-app-module';
import { GLOBAL_PREFIX, appSetup } from '../../../libs/common/src';
import { GatewayConfig } from './core/gateway.config';
import { swaggerSetup } from './core/config/swagger.setup';

const corsAllowedOrigins = [
  'http://localhost:3000',
  'https://dev.it-incubator.ru:3000',
  'https://dev.nymbi.org:3000',
  'https://nymbi.org',
  'https://www.nymbi.org',
];

const corsAllowedMethods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'];

const corsAllowedHeaders = [
  'Accept',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Language',
  'Content-Type',
  'Cookie',
  'DNT',
  'Host',
  'If-Modified-Since',
  'Keep-Alive',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'X-Request-ID',
  'X-Trace-ID',
  'recaptcha',
];

const corsExposedHeaders = ['Set-Cookie', 'X-Request-ID', 'X-Trace-ID'];

async function bootstrap() {
  const dynamicAppModule = await initAppModule();

  const app = await NestFactory.create(dynamicAppModule);

  appSetup(app, dynamicAppModule as unknown as Type<any>, {
    httpConfig: {
      enabled: true,
      enableGlobalPrefix: true,
      enableCors: true,
      corsOptions: {
        origin: corsAllowedOrigins,
        credentials: true,
        methods: corsAllowedMethods,
        allowedHeaders: corsAllowedHeaders,
        exposedHeaders: corsExposedHeaders,
        maxAge: 86400,
      },
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
