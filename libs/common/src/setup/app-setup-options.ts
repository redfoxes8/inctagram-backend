import { INestApplication, ValidationPipeOptions } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';

import { SwaggerSetupOptions } from './swagger.setup';

export type CorsOptions = Parameters<INestApplication['enableCors']>[0];

export type HttpSetupConfig = {
  enabled?: boolean;
  enableGlobalPrefix?: boolean;
  enableCors?: boolean;
  corsOptions?: CorsOptions;
  enableCookies?: boolean;
  enableSwagger?: boolean;
  globalPrefix?: string;
  swagger?: SwaggerSetupOptions;
};

export type RpcSetupConfig = {
  enabled?: boolean;
  tcpPipes?: boolean;
  grpcPipes?: boolean;
  options?: MicroserviceOptions;
};

export type AppSetupOptions = {
  httpConfig?: HttpSetupConfig;
  rpcConfig?: RpcSetupConfig;
  validationCustomConfig?: ValidationPipeOptions;
};
