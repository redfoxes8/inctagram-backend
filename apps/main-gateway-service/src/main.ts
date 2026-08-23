import { NestFactory } from '@nestjs/core';
import { Type } from '@nestjs/common';

import { initAppModule } from './init-app-module';
import { GLOBAL_PREFIX, appSetup } from '../../../libs/common/src';
import { GatewayConfig } from './core/gateway.config';
import { swaggerSetup } from './core/config/swagger.setup';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { INCTAGRAM_USER_V1_PACKAGE_NAME } from '../../../libs/contracts/src';
import { join } from 'path';

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

  const app = await NestFactory.create(dynamicAppModule, {
    rawBody: true,
  });

  const gatewayConfig = app.get<GatewayConfig>(GatewayConfig);

  const grpcOptions: MicroserviceOptions = {
    transport: Transport.GRPC,
    options: {
      package: INCTAGRAM_USER_V1_PACKAGE_NAME,
      protoPath: join(process.cwd(), 'libs/contracts/src/proto/user.proto'),
      url: `${gatewayConfig.grpcHost}:${gatewayConfig.grpcPort}`,
    },
  };

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
    rpcConfig: {
      enabled: true,
      grpcPipes: true,
      options: grpcOptions,
    },
  });

  swaggerSetup(app);

  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(gatewayConfig.port);

  console.log(`Gateway is running on port ${gatewayConfig.port}`);
}
bootstrap();
