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
    if (!grpcError.message) {
      return grpcError.details ?? 'gRPC request failed';
    }

    // gRPC auto-formats as "N STATUS_NAME: details_or_message"
    const match = grpcError.message.match(/^\d+\s+\w+:\s+(.+)$/);
    if (match) {
      const extracted = match[1];
      // If extracted looks like JSON (serialized extensions), skip it
      if (extracted.startsWith('[') || extracted.startsWith('{')) {
        return grpcError.details ?? 'gRPC request failed';
      }
      return extracted;
    }

    return grpcError.message;
  }

  private static toGrpcErrorLike(error: unknown): GrpcErrorLike {
    if (typeof error !== 'object' || error === null) {
      return {};
    }

    const candidate = error as Record<string, unknown>;

    return {
      code: typeof candidate.code === 'number' ? candidate.code : undefined,
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
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
