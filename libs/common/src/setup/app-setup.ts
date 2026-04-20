import {
  INestApplication,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { useContainer } from 'class-validator';

import { GlobalDomainExceptionFilter } from '../exceptions/global-domain-exception.filter';
import { AppSetupOptions } from './app-setup-options';
import { GLOBAL_PREFIX, globalPrefixSetup } from './global-prefix.setup';
import { createCookieParserMiddleware } from './cookie-parser.middleware';
import { createValidationPipeOptions } from './validation-pipe-options';
import { setupSwagger } from './swagger.setup';

export function appSetup(
  app: INestApplication,
  appModule: Type<unknown>,
  options: AppSetupOptions = {},
): void {
  useContainer(app.select(appModule), { fallbackOnErrors: true });

  app.useGlobalPipes(
    new ValidationPipe(
      createValidationPipeOptions(options.validationCustomConfig),
    ),
  );
  app.useGlobalFilters(new GlobalDomainExceptionFilter());

  const httpConfig = options.httpConfig;
  const httpEnabled = httpConfig?.enabled ?? false;

  if (httpEnabled && httpConfig) {
    if (httpConfig.enableGlobalPrefix ?? true) {
      globalPrefixSetup(app, httpConfig.globalPrefix ?? GLOBAL_PREFIX);
    }

    if (httpConfig.enableCors ?? false) {
      app.enableCors(httpConfig.corsOptions);
    }

    if (httpConfig.enableCookies ?? false) {
      app.use(createCookieParserMiddleware());
    }

    if ((httpConfig.enableSwagger ?? false) && httpConfig.swagger) {
      setupSwagger(app, {
        ...httpConfig.swagger,
        path: httpConfig.swagger.path ?? httpConfig.globalPrefix ?? GLOBAL_PREFIX,
      });
    }
  }

  if (options.rpcConfig?.enabled) {
    if (options.rpcConfig.tcpPipes || options.rpcConfig.grpcPipes) {
      // Reserved hook for protocol-specific RPC pipes.
    }
  }
}
