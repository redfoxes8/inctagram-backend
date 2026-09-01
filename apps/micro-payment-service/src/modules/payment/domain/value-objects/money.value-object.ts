import { assertPositivePersistedInteger } from '../specifications/persisted-integer.specification';
import { Currency } from './currency.value-object';

export type MoneyProps = {
  amountMinor: number;
  currency: Currency;
};

export class Money {
  private readonly amountMinor: number;
  private readonly currency: Currency;

  constructor(props: MoneyProps) {
    assertPositivePersistedInteger(props.amountMinor, 'Money amountMinor');

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
