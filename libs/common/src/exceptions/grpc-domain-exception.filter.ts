import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { DomainException } from './domain-exception';
import { DomainExceptionCode } from './domain-exception-codes';

@Catch(DomainException)
export class GrpcDomainExceptionFilter implements RpcExceptionFilter<DomainException> {
  catch(exception: DomainException): Observable<any> {
    const code = this.mapToGrpcStatus(exception.code);

    // В gRPC NestJS ожидает объект с кодом и сообщением
    return throwError(() => ({
      code,
      message: exception.message,
      details: JSON.stringify(exception.extensions || {}),
    }));
  }

  private mapToGrpcStatus(code: DomainExceptionCode): status {
    switch (code) {
      case DomainExceptionCode.BadRequest:
        return status.INVALID_ARGUMENT;
      case DomainExceptionCode.Unauthorized:
        return status.UNAUTHENTICATED;
      case DomainExceptionCode.Forbidden:
        return status.PERMISSION_DENIED;
      case DomainExceptionCode.NotFound:
        return status.NOT_FOUND;
      case DomainExceptionCode.TooManyRequests:
        return status.RESOURCE_EXHAUSTED;
      case DomainExceptionCode.ServiceUnavailable:
        return status.UNAVAILABLE;
      case DomainExceptionCode.GatewayTimeout:
        return status.DEADLINE_EXCEEDED;
      case DomainExceptionCode.InternalServerError:
      default:
        return status.INTERNAL;
    }
  }
}
