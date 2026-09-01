import { status } from '@grpc/grpc-js';

import { DomainException, Extension } from '../exceptions/domain-exception';
import { DomainExceptionCode } from '../exceptions/domain-exception-codes';

type GrpcErrorLike = {
  code?: number;
  details?: string;
  message?: string;
};

const MAX_MESSAGE_LENGTH = 500;
const MAX_EXTENSION_COUNT = 20;
const MAX_EXTENSION_FIELD_LENGTH = 100;
const MAX_EXTENSION_MESSAGE_LENGTH = 500;
const SAFE_INTERNAL_MESSAGE = 'Internal service error';
const STRUCTURED_DETAIL_KEYS = new Set(['version', 'code', 'message', 'extensions']);

export class GrpcErrorMapper {
  static toDomainException(error: unknown): DomainException {
    const grpcError = this.toGrpcErrorLike(error);
    const code = this.toDomainCode(grpcError.code);
    const serializedError = this.extractSerializedDomainError(grpcError.details, code);

    return new DomainException({
      code,
      message: serializedError?.message ?? this.extractMessage(grpcError, code),
      extensions: serializedError?.extensions,
    });
  }

  static isConflict(error: unknown): boolean {
    return error instanceof DomainException && error.code === DomainExceptionCode.Conflict;
  }

  private static extractMessage(grpcError: GrpcErrorLike, code: DomainExceptionCode): string {
    if (code === DomainExceptionCode.InternalServerError) return SAFE_INTERNAL_MESSAGE;

    if (grpcError.message) {
      const match = grpcError.message.match(/^\d+\s+\w+:\s+(.+)$/);
      if (match) {
        const msg = match[1];
        // Skip serialized JSON details
        if (this.isSafeText(msg, MAX_MESSAGE_LENGTH)) return msg;
      }
    }

    return this.isSafeText(grpcError.details, MAX_MESSAGE_LENGTH)
      ? grpcError.details
      : 'gRPC request failed';
  }

  private static extractSerializedDomainError(
    details: string | undefined,
    mappedCode: DomainExceptionCode,
  ): { message: string; extensions: Extension[] } | null {
    if (!details?.startsWith('{')) return null;
    try {
      const parsed: unknown = JSON.parse(details);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const record = parsed as Record<string, unknown>;
      if (
        Object.keys(record).some((key) => !STRUCTURED_DETAIL_KEYS.has(key)) ||
        record.version !== 1 ||
        record.code !== mappedCode ||
        !this.isSafeText(record.message, MAX_MESSAGE_LENGTH) ||
        !Array.isArray(record.extensions) ||
        record.extensions.length > MAX_EXTENSION_COUNT
      ) {
        return null;
      }
      const extensions = record.extensions.filter((extension) => this.isExtension(extension));
      if (extensions.length !== record.extensions.length) return null;
      return { message: record.message, extensions };
    } catch {
      return null;
    }
  }

  private static isExtension(value: unknown): value is Extension {
    if (typeof value !== 'object' || value === null) return false;
    const extension = value as Record<string, unknown>;
    return (
      Object.keys(extension).length === 2 &&
      this.isSafeText(extension.field, MAX_EXTENSION_FIELD_LENGTH) &&
      this.isSafeText(extension.message, MAX_EXTENSION_MESSAGE_LENGTH)
    );
  }

  private static isSafeText(value: unknown, maximumLength: number): value is string {
    return (
      typeof value === 'string' &&
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
        return DomainExceptionCode.Conflict;
      case status.INTERNAL:
      default:
        return DomainExceptionCode.InternalServerError;
    }
  }
}
