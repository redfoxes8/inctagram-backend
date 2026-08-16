import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

export const MAX_PERSISTED_INTEGER = 2_147_483_647;

export function assertPositivePersistedInteger(value: number, concept: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_PERSISTED_INTEGER) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: `${concept} must be a positive persisted integer`,
    });
  }
}

export function assertNonNegativePersistedInteger(value: number, concept: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PERSISTED_INTEGER) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: `${concept} must be a non-negative persisted integer`,
    });
  }
}
