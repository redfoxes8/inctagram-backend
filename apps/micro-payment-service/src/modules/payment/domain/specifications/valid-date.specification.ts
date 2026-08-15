import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

type ValidDateAssertion = {
  value: Date;
  message: string;
};

export function assertValidDate(assertion: ValidDateAssertion): void {
  if (!(assertion.value instanceof Date) || !Number.isFinite(assertion.value.getTime())) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: assertion.message,
    });
  }
}
