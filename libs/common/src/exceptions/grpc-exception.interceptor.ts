import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { DomainException } from './domain-exception';
import { DomainExceptionCode } from './domain-exception-codes';

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
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof DomainException) {
          return throwError(
            () =>
              new RpcException({
                code: codeMap[error.code] ?? status.INTERNAL,
                message: 'DomainException',
                details: error.message,
              }),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
