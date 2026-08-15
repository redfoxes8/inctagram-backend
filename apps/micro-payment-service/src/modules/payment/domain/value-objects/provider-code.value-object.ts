import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

const PROVIDER_CODE_FORMAT = /^[A-Z][A-Z0-9_]{0,31}$/;

export class ProviderCode {
  private readonly value: string;

  constructor(value: string) {
    if (!PROVIDER_CODE_FORMAT.test(value)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Provider code must be 1-32 uppercase machine-code characters',
      });
    }

    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: ProviderCode): boolean {
    return this.value === other.value;
  }
}
