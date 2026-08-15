import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { CheckoutPurpose } from '../enums/checkout-purpose.enum';
import { CheckoutStatus } from '../enums/checkout-status.enum';
import { assertProviderIdentifier } from '../specifications/provider-identifier.specification';
import { assertUuidIdentifier } from '../specifications/uuid-identifier.specification';
import { assertValidDate } from '../specifications/valid-date.specification';
import { IdempotencyKey } from '../value-objects/idempotency-key.value-object';
import { ProviderCode } from '../value-objects/provider-code.value-object';

type CheckoutSessionLifecycleProps = Pick<
  BaseDomainEntityProps<string>,
  'id' | 'createdAt' | 'updatedAt'
>;

export type CreateCheckoutSessionEntityProps = CheckoutSessionLifecycleProps & {
  userId: string;
  productId: string;
  provider: ProviderCode;
  purpose: CheckoutPurpose;
  idempotencyKey: IdempotencyKey;
  expiresAt?: Date | null;
};

export type CheckoutSessionEntityProps = CreateCheckoutSessionEntityProps & {
  status: CheckoutStatus;
  providerCheckoutId: string | null;
  completedAt: Date | null;
};

export class CheckoutSessionEntity extends BaseDomainEntity<string> {
  private readonly userId: string;
  private readonly productId: string;
  private readonly provider: ProviderCode;
  private readonly purpose: CheckoutPurpose;
  private status: CheckoutStatus;
  private providerCheckoutId: string | null;
  private readonly idempotencyKey: IdempotencyKey;
  private readonly expiresAt: Date | null;
  private completedAt: Date | null;

  constructor(props: CheckoutSessionEntityProps) {
    CheckoutSessionEntity.assertConstructionInvariants(props);

    super({
      id: props.id,
      createdAt: props.createdAt ? new Date(props.createdAt.getTime()) : undefined,
      updatedAt: props.updatedAt ? new Date(props.updatedAt.getTime()) : undefined,
    });

    this.userId = props.userId;
    this.productId = props.productId;
    this.provider = props.provider;
    this.purpose = props.purpose;
    this.status = props.status;
    this.providerCheckoutId = props.providerCheckoutId;
    this.idempotencyKey = props.idempotencyKey;
    this.expiresAt = props.expiresAt ? new Date(props.expiresAt.getTime()) : null;
    this.completedAt = props.completedAt ? new Date(props.completedAt.getTime()) : null;
  }

  public static create(props: CreateCheckoutSessionEntityProps): CheckoutSessionEntity {
    return new CheckoutSessionEntity({
      ...props,
      status: CheckoutStatus.CREATED,
      providerCheckoutId: null,
      completedAt: null,
    });
  }

  public getUserId(): string {
    return this.userId;
  }

  public getProductId(): string {
    return this.productId;
  }

  public getProvider(): ProviderCode {
    return this.provider;
  }

  public getPurpose(): CheckoutPurpose {
    return this.purpose;
  }

  public getStatus(): CheckoutStatus {
    return this.status;
  }

  public getProviderCheckoutId(): string | null {
    return this.providerCheckoutId;
  }

  public getIdempotencyKey(): IdempotencyKey {
    return this.idempotencyKey;
  }

  public getExpiresAt(): Date | null {
    return this.expiresAt ? new Date(this.expiresAt.getTime()) : null;
  }

  public getCompletedAt(): Date | null {
    return this.completedAt ? new Date(this.completedAt.getTime()) : null;
  }

  public attachProviderCheckoutId(providerCheckoutId: string): void {
    assertProviderIdentifier(providerCheckoutId);

    if (this.providerCheckoutId === providerCheckoutId) {
      return;
    }

    if (this.providerCheckoutId !== null) {
      throw CheckoutSessionEntity.conflict(
        'Checkout session provider identifier cannot be replaced',
      );
    }

    if (this.status !== CheckoutStatus.CREATED) {
      throw CheckoutSessionEntity.conflict(
        'Provider identifier cannot be attached to a terminal checkout session',
      );
    }

    this.providerCheckoutId = providerCheckoutId;
    this.touch();
  }

  public complete(completedAt: Date): void {
    assertValidDate({
      value: completedAt,
      message: 'Checkout completion timestamp must be a valid Date',
    });

    if (this.status === CheckoutStatus.COMPLETED) {
      return;
    }

    if (this.status !== CheckoutStatus.CREATED) {
      throw CheckoutSessionEntity.conflict(
        'Terminal checkout session cannot transition to completed',
      );
    }

    if (this.providerCheckoutId === null) {
      throw CheckoutSessionEntity.conflict(
        'Checkout session requires a provider identifier before completion',
      );
    }

    this.status = CheckoutStatus.COMPLETED;
    this.completedAt = new Date(completedAt.getTime());
    this.touch();
  }

  public fail(): void {
    if (this.status === CheckoutStatus.FAILED) {
      return;
    }

    if (this.status !== CheckoutStatus.CREATED) {
      throw CheckoutSessionEntity.conflict('Terminal checkout session cannot transition to failed');
    }

    this.status = CheckoutStatus.FAILED;
    this.completedAt = null;
    this.touch();
  }

  public expire(): void {
    if (this.status === CheckoutStatus.EXPIRED) {
      return;
    }

    if (this.status !== CheckoutStatus.CREATED) {
      throw CheckoutSessionEntity.conflict(
        'Terminal checkout session cannot transition to expired',
      );
    }

    this.status = CheckoutStatus.EXPIRED;
    this.completedAt = null;
    this.touch();
  }

  private static assertConstructionInvariants(props: CheckoutSessionEntityProps): void {
    assertUuidIdentifier(props.id);
    assertUuidIdentifier(props.userId);
    assertUuidIdentifier(props.productId);
    CheckoutSessionEntity.assertValueObjects({
      provider: props.provider,
      idempotencyKey: props.idempotencyKey,
    });
    CheckoutSessionEntity.assertPurpose(props.purpose);
    CheckoutSessionEntity.assertStatus(props.status);

    if (props.providerCheckoutId !== null) {
      assertProviderIdentifier(props.providerCheckoutId);
    }
    if (props.expiresAt !== undefined && props.expiresAt !== null) {
      assertValidDate({
        value: props.expiresAt,
        message: 'Checkout expiration timestamp must be a valid Date',
      });
    }
    if (props.completedAt !== null) {
      assertValidDate({
        value: props.completedAt,
        message: 'Checkout completion timestamp must be a valid Date',
      });
    }

    if (props.status === CheckoutStatus.COMPLETED) {
      if (props.providerCheckoutId === null || props.completedAt === null) {
        throw new DomainException({
          code: DomainExceptionCode.BadRequest,
          message: 'Completed checkout session requires provider identifier and completion time',
        });
      }
      return;
    }

    if (props.completedAt !== null) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Only completed checkout session may have a completion time',
      });
    }
  }

  private static assertValueObjects(values: {
    provider: ProviderCode;
    idempotencyKey: IdempotencyKey;
  }): void {
    if (
      !(values.provider instanceof ProviderCode) ||
      !(values.idempotencyKey instanceof IdempotencyKey)
    ) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Checkout session requires valid provider and idempotency values',
      });
    }
  }

  private static assertPurpose(purpose: CheckoutPurpose): void {
    if (
      purpose !== CheckoutPurpose.INITIAL_SUBSCRIPTION &&
      purpose !== CheckoutPurpose.ADDITIONAL_SUBSCRIPTION
    ) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Checkout purpose is not supported',
      });
    }
  }

  private static assertStatus(status: CheckoutStatus): void {
    if (
      status !== CheckoutStatus.CREATED &&
      status !== CheckoutStatus.COMPLETED &&
      status !== CheckoutStatus.EXPIRED &&
      status !== CheckoutStatus.FAILED
    ) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Checkout status is not supported',
      });
    }
  }

  private static conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}
