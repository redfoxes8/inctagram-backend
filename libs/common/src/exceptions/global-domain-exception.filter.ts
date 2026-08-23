import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { DomainException, Extension } from './domain-exception';

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
    const extensionsCount = Array.isArray(exception.extensions) ? exception.extensions.length : 0;
    this.logger.warn(
      `DomainException -> HTTP ${statusCode}; message="${exception.message}"; extensions=${extensionsCount}`,
    );

    response.status(statusCode).send(responseBody);
  }

  private mapToHttpException(exception: DomainException): HttpException {
    const statusCode: HttpStatus = Number(exception.code);
    const extensions = this.getValidatedExtensions(exception.extensions);

    if (statusCode === HttpStatus.BAD_REQUEST && extensions.length > 0) {
      return new HttpException(
        {
          code: exception.code,
          message: exception.message,
          extensions,
          errorsMessages: extensions.map((extension) => ({
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
        extensions,
        message: exception.message,
      },
      statusCode,
    );
  }

  private getValidatedExtensions(extensions: unknown): Extension[] {
    if (!Array.isArray(extensions)) {
      return [];
    }

    return extensions.filter((extension): extension is Extension => {
      if (typeof extension !== 'object' || extension === null) {
        return false;
      }

      const candidate = extension as Record<string, unknown>;
      return (
        Object.keys(candidate).every((key) => key === 'field' || key === 'message') &&
        typeof candidate.field === 'string' &&
        typeof candidate.message === 'string'
      );
    });
  }
}
