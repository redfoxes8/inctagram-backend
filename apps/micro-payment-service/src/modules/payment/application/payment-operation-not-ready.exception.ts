import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export const PAYMENT_OPERATION_NOT_READY = 'PAYMENT_OPERATION_NOT_READY';

export function paymentOperationNotReady(): DomainException {
  return new DomainException({
    code: DomainExceptionCode.ServiceUnavailable,
    message: 'Payment operation is not available yet',
    extensions: [{ field: 'reason', message: PAYMENT_OPERATION_NOT_READY }],
  });
}
