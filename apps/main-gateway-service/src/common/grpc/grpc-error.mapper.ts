import { status } from '@grpc/grpc-js';

import { DomainException } from '../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../libs/common/src/exceptions/domain-exception-codes';

type GrpcErrorLike = {
  code?: number;
  details?: string;
  message?: string;
};

export class GrpcErrorMapper {
  static toDomainException(error: unknown): DomainException {
    const grpcError = this.toGrpcErrorLike(error);
    const message = this.extractMessage(grpcError);

    return new DomainException({
      code: this.toDomainCode(grpcError.code),
      message,
    });
  }

  private static extractMessage(grpcError: GrpcErrorLike): string {
    if (grpcError.message) {
      const match = grpcError.message.match(/^\d+\s+\w+:\s+(.+)$/);
      if (match) {
        const msg = match[1];
        // Skip serialized JSON details
        if (!msg.startsWith('{') && !msg.startsWith('[')) return msg;
      }
    }

    return grpcError.details ?? 'gRPC request failed';
  }

  private static toGrpcErrorLike(error: unknown): GrpcErrorLike {
    if (typeof error !== 'object' || error === null) return {};

    const { code, details, message } = error as Record<string, unknown>;
    return {
      code: typeof code === 'number' ? code : undefined,
      details: typeof details === 'string' ? details : undefined,
      message: typeof message === 'string' ? message : undefined,
    };
  }

  private static toDomainCode(code: number | undefined): DomainExceptionCode {
    switch (code) {
      case status.INVALID_ARGUMENT:
        return DomainExceptionCode.BadRequest;
      case status.UNAUTHENTICATED:
        return DomainExceptionCode.Unauthorized;
      case status.PERMISSION_DENIED:
        return DomainExceptionCode.Forbidden;
      case status.NOT_FOUND:
        return DomainExceptionCode.NotFound;
      case status.RESOURCE_EXHAUSTED:
        return DomainExceptionCode.TooManyRequests;
      case status.UNAVAILABLE:
        return DomainExceptionCode.ServiceUnavailable;
      case status.DEADLINE_EXCEEDED:
        return DomainExceptionCode.GatewayTimeout;
      case status.ALREADY_EXISTS:
        return DomainExceptionCode.BadRequest;
      case status.INTERNAL:
      default:
        return DomainExceptionCode.InternalServerError;
    }
  }
}
