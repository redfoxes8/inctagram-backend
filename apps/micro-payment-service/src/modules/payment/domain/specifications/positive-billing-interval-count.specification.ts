import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

export function assertPositiveBillingIntervalCount(count: number): void {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Billing interval count must be a positive safe integer',
    });
  }
}
