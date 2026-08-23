import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuidIdentifier(value: string): void {
  if (typeof value !== 'string' || !UUID_FORMAT.test(value)) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Domain identifier must be a valid UUID',
    });
  }
}
