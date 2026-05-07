import { Catch, RpcExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { DomainException } from './domain-exception';
import { DomainExceptionCode } from './domain-exception-codes';

@Catch(DomainException)
export class GrpcDomainExceptionFilter implements RpcExceptionFilter<DomainException> {
  catch(exception: DomainException, host: ArgumentsHost): Observable<any> {
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
      case DomainExceptionCode.ValidationError:
        return status.INVALID_ARGUMENT;
      case DomainExceptionCode.Unauthorized:
      case DomainExceptionCode.EmailNotConfirmed:
      case DomainExceptionCode.ConfirmationCodeExpired:
      case DomainExceptionCode.PasswordRecoveryCodeExpired:
      case DomainExceptionCode.OAuthProviderRequired:
        return status.UNAUTHENTICATED;
      case DomainExceptionCode.Forbidden:
        return status.PERMISSION_DENIED;
      case DomainExceptionCode.NotFound:
        return status.NOT_FOUND;
      case DomainExceptionCode.TooManyRequests:
        return status.RESOURCE_EXHAUSTED;
      case DomainExceptionCode.InternalServerError:
      default:
        return status.INTERNAL;
    }
  }
}
