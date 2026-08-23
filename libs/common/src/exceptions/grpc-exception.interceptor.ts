import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { DomainException } from './domain-exception';
import { DomainExceptionCode } from './domain-exception-codes';

const MAX_MESSAGE_LENGTH = 500;
const MAX_EXTENSION_COUNT = 20;
const MAX_EXTENSION_FIELD_LENGTH = 100;
const MAX_EXTENSION_MESSAGE_LENGTH = 500;
const SAFE_INTERNAL_MESSAGE = 'Internal service error';

const codeMap: Record<DomainExceptionCode, status> = {
  [DomainExceptionCode.BadRequest]: status.INVALID_ARGUMENT,
  [DomainExceptionCode.Unauthorized]: status.UNAUTHENTICATED,
  [DomainExceptionCode.Forbidden]: status.PERMISSION_DENIED,
  [DomainExceptionCode.NotFound]: status.NOT_FOUND,
  [DomainExceptionCode.TooManyRequests]: status.RESOURCE_EXHAUSTED,
  [DomainExceptionCode.InternalServerError]: status.INTERNAL,
  [DomainExceptionCode.ServiceUnavailable]: status.UNAVAILABLE,
  [DomainExceptionCode.GatewayTimeout]: status.DEADLINE_EXCEEDED,
  [DomainExceptionCode.Conflict]: status.ALREADY_EXISTS,
};

@Injectable()
export class GrpcExceptionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    void context;
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof DomainException) {
          return throwError(
            () =>
              new RpcException({
                code: codeMap[error.code] ?? status.INTERNAL,
                message: 'DomainException',
                details: serializeDomainException(error),
              }),
          );
        }
        return throwError(
          () =>
            new RpcException({
              code: status.INTERNAL,
              message: SAFE_INTERNAL_MESSAGE,
              details: SAFE_INTERNAL_MESSAGE,
            }),
        );
      }),
    );
  }
}

function serializeDomainException(error: DomainException): string {
  const message = isSafeText(error.message, MAX_MESSAGE_LENGTH)
    ? error.message
    : SAFE_INTERNAL_MESSAGE;
  const extensions = error.extensions
    .slice(0, MAX_EXTENSION_COUNT)
    .filter(
      (extension) =>
        isSafeText(extension.field, MAX_EXTENSION_FIELD_LENGTH) &&
        isSafeText(extension.message, MAX_EXTENSION_MESSAGE_LENGTH),
    )
    .map((extension) => ({ field: extension.field, message: extension.message }));

  return JSON.stringify({ version: 1, code: error.code, message, extensions });
}

function isSafeText(value: string, maximumLength: number): boolean {
  return (
    value.length > 0 &&
    value.length <= maximumLength &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    }) &&
    !value.startsWith('{') &&
    !value.startsWith('[')
  );
}
