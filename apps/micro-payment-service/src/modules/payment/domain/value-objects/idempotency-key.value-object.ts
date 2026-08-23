import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;

export class IdempotencyKey {
  private readonly value: string;

  constructor(value: string) {
    if (!IDEMPOTENCY_KEY_FORMAT.test(value)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Idempotency key must use 1-255 safe machine-key characters',
      });
    }

    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: IdempotencyKey): boolean {
    return this.value === other.value;
  }
}
