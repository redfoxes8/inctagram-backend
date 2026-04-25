import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, throwError } from 'rxjs';

import { DomainException } from './domain-exception';
import { DomainExceptionCode } from './domain-exception-codes';

type RpcExceptionLike = {
  getError(): unknown;
};

type RpcExceptionFactory = new (error: unknown) => RpcExceptionLike;

@Catch(DomainException)
export class GlobalDomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalDomainExceptionFilter.name);

  catch(exception: DomainException, host: ArgumentsHost): Observable<never> | void {
    const hostType = host.getType<'http' | 'rpc'>();

    if (hostType === 'rpc') {
      const rpcContext = host.switchToRpc().getContext();

      if (
        exception.code === DomainExceptionCode.ValidationError &&
        this.isAckableRpcContext(rpcContext)
      ) {
        this.logger.warn(
          `DomainException -> RPC validation error; message="${exception.message}"; extensions=${exception.extensions.length}`,
        );
        rpcContext.getChannelRef().ack(rpcContext.getMessage());
        return;
      }

      return throwError(() => this.mapToRpcException(exception));
    }

    const httpException = this.mapToHttpException(exception);
    const httpHost = host.switchToHttp();
    const response = httpHost.getResponse<Response>();
    const statusCode = httpException.getStatus();
    const responseBody = httpException.getResponse();

    this.logger.warn(
      `DomainException -> HTTP ${statusCode}; message="${exception.message}"; extensions=${exception.extensions.length}`,
    );

    if (statusCode === HttpStatus.BAD_REQUEST && typeof responseBody === 'object') {
      response.status(statusCode).json(responseBody);
      return;
    }

    response.sendStatus(statusCode);
  }

  private mapToHttpException(exception: DomainException): HttpException {
    const statusCode = Number(exception.code);

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

  private mapToRpcException(exception: DomainException): RpcExceptionLike {
    const rpcPayload = {
      code: exception.code,
      extensions: exception.extensions,
      message: exception.message,
    };

    try {
      const { RpcException } = require('@nestjs/microservices') as {
        RpcException: RpcExceptionFactory;
      };

      return new RpcException(rpcPayload);
    } catch (error: unknown) {
      this.logger.warn(
        '@nestjs/microservices is not installed. Falling back to a plain error payload for RPC.',
      );

      return {
        getError(): unknown {
          return rpcPayload;
        },
      };
    }
  }

  private isAckableRpcContext(context: unknown): context is {
    getChannelRef(): { ack(message: unknown): void };
    getMessage(): unknown;
  } {
    return (
      typeof context === 'object' &&
      context !== null &&
      'getChannelRef' in context &&
      'getMessage' in context &&
      typeof (context as { getChannelRef?: unknown }).getChannelRef === 'function' &&
      typeof (context as { getMessage?: unknown }).getMessage === 'function'
    );
  }
}
