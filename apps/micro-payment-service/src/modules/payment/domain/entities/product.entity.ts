import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { BillingInterval } from '../enums/billing-interval.enum';
import { assertPositiveBillingIntervalCount } from '../specifications/positive-billing-interval-count.specification';
import { Money } from '../value-objects/money.value-object';

const PRODUCT_CODE_FORMAT = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_PRODUCT_NAME_LENGTH = 120;

type ProductLifecycleProps = Pick<BaseDomainEntityProps<string>, 'id' | 'createdAt' | 'updatedAt'>;

export type ProductEntityProps = ProductLifecycleProps & {
  code: string;
  name: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  price: Money;
  isActive?: boolean;
};

export class ProductEntity extends BaseDomainEntity<string> {
  private readonly code: string;
  private readonly productName: string;
  private readonly billingInterval: BillingInterval;
  private readonly billingIntervalCount: number;
  private readonly price: Money;
  private active: boolean;

  constructor(props: ProductEntityProps) {
    ProductEntity.assertValidCode(props.code);
    ProductEntity.assertValidName(props.name);
    ProductEntity.assertValidBillingInterval(props.billingInterval);
    assertPositiveBillingIntervalCount(props.billingIntervalCount);
    ProductEntity.assertValidPrice(props.price);
    ProductEntity.assertValidActiveState(props.isActive);

    super({
      id: props.id,
      createdAt: props.createdAt ? new Date(props.createdAt.getTime()) : undefined,
      updatedAt: props.updatedAt ? new Date(props.updatedAt.getTime()) : undefined,
    });

    this.code = props.code;
    this.productName = props.name;
    this.billingInterval = props.billingInterval;
    this.billingIntervalCount = props.billingIntervalCount;
    this.price = props.price;
    this.active = props.isActive ?? true;
  }

  public getCode(): string {
    return this.code;
  }

  public getName(): string {
    return this.productName;
  }

  public getBillingInterval(): BillingInterval {
    return this.billingInterval;
  }

  public getBillingIntervalCount(): number {
    return this.billingIntervalCount;
  }

  public getPrice(): Money {
    return this.price;
  }

  public isActive(): boolean {
    return this.active;
  }

  public deactivate(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.touch();
  }

  private static assertValidCode(code: string): void {
    if (typeof code !== 'string' || !PRODUCT_CODE_FORMAT.test(code)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Product code must be 1-64 uppercase machine-code characters',
      });
    }
  }

  private static assertValidName(name: string): void {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.length > MAX_PRODUCT_NAME_LENGTH ||
      name.trim() !== name ||
      ProductEntity.containsControlCharacters(name)
    ) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Product name must be 1-120 display characters without surrounding whitespace',
      });
    }
  }

  private static containsControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
  }

  private static assertValidBillingInterval(billingInterval: BillingInterval): void {
    if (billingInterval !== BillingInterval.WEEK && billingInterval !== BillingInterval.MONTH) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Product billing interval must be WEEK or MONTH',
      });
    }
  }

  private static assertValidPrice(price: Money): void {
    if (!(price instanceof Money)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Product price must be valid Money',
      });
    }
  }

  private static assertValidActiveState(isActive: boolean | undefined): void {
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Product active state must be boolean',
      });
    }
  }
}
