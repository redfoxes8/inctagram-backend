import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentKind } from '../enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../enums/target-payment-transaction-status.enum';

const FAILURE_CODE_FORMAT = /^[A-Z][A-Z0-9_.:-]{0,99}$/;
const MAX_FAILURE_MESSAGE_LENGTH = 500;

export type PaymentFailureDetails = {
  failureCode: string;
  failureMessage: string | null;
};

export function assertPaymentKind(kind: PaymentKind): void {
  if (kind !== PaymentKind.PURCHASE && kind !== PaymentKind.RENEWAL) {
    throw badRequest('Payment kind is not supported');
  }
}

export function assertPaymentTransactionStatus(status: PaymentTransactionStatus): void {
  if (!Object.values(PaymentTransactionStatus).includes(status)) {
    throw badRequest('Payment transaction status is not supported');
  }
}

export function assertPaymentFailureDetails(details: PaymentFailureDetails): void {
  if (!FAILURE_CODE_FORMAT.test(details.failureCode)) {
    throw badRequest('Payment failure code must use 1-100 safe machine-code characters');
  }

  if (
    details.failureMessage !== null &&
    (details.failureMessage.length === 0 ||
      details.failureMessage.length > MAX_FAILURE_MESSAGE_LENGTH ||
      details.failureMessage.trim() !== details.failureMessage ||
      containsControlCharacters(details.failureMessage))
  ) {
    throw badRequest('Payment failure message must be a safe string of at most 500 characters');
  }
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function badRequest(message: string): DomainException {
  return new DomainException({ code: DomainExceptionCode.BadRequest, message });
}
