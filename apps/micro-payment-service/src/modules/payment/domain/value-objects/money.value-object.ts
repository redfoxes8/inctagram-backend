import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { Currency } from './currency.value-object';

export type MoneyProps = {
  amountMinor: number;
  currency: Currency;
};

export class Money {
  private readonly amountMinor: number;
  private readonly currency: Currency;

  constructor(props: MoneyProps) {
    if (!Number.isSafeInteger(props.amountMinor) || props.amountMinor <= 0) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Money amountMinor must be a positive safe integer',
      });
    }

    this.amountMinor = props.amountMinor;
    this.currency = props.currency;
  }

  public getAmountMinor(): number {
    return this.amountMinor;
  }

  public getCurrency(): Currency {
    return this.currency;
  }

  public equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency.equals(other.currency);
  }
}
