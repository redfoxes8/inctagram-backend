import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { DomainException } from './domain-exception';

@Catch(DomainException)
export class GlobalDomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalDomainExceptionFilter.name);

  catch(exception: DomainException, host: ArgumentsHost): void {
    const hostType = host.getType<'http' | 'rpc'>();

    if (hostType === 'rpc') {
      // Not HTTP context, skip
      return;
    }

    const httpException = this.mapToHttpException(exception);
    const httpHost = host.switchToHttp();
    const response = httpHost.getResponse<Response>();
    const statusCode = httpException.getStatus();
    const responseBody = httpException.getResponse();
    this.logger.warn(
      `DomainException -> HTTP ${statusCode}; message="${exception.message}"; extensions=${exception.extensions.length}`,
    );

    response.status(statusCode).send(responseBody);
  }

  private mapToHttpException(exception: DomainException): HttpException {
    const statusCode: HttpStatus = Number(exception.code);

    if (statusCode === HttpStatus.BAD_REQUEST && exception.extensions.length > 0) {
      return new HttpException(
        {
          errorsMessages: exception.extensions.map((extension) => ({
            field: extension.field,
            message: extension.message,
          })),
        },
        statusCode,
      );
    }

    return new HttpException(
      {
        code: exception.code,
        extensions: exception.extensions,
        message: exception.message,
      },
      statusCode,
    );
  }
}
