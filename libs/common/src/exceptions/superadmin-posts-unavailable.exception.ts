import { DomainException } from './domain-exception';
import { DomainExceptionCode } from './domain-exception-codes';

export class SuperadminPostsUnavailableException extends DomainException {
  constructor(
    readonly reason: 'SYNC_DISABLED' | 'NOT_READY' | 'STORAGE' | 'FILES' | 'INVALID_READ_MODEL',
  ) {
    super({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Superadmin posts unavailable',
    });
  }
}
