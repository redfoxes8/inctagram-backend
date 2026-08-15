import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

const CURRENCY_FORMAT = /^[A-Z]{3}$/;

export class Currency {
  private readonly value: string;

  constructor(value: string) {
    if (!CURRENCY_FORMAT.test(value)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Currency must contain exactly three uppercase ASCII letters',
      });
    }

    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: Currency): boolean {
    return this.value === other.value;
  }
}
