import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentKind } from '../enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../enums/target-payment-transaction-status.enum';
import {
  assertPaymentFailureDetails,
  assertPaymentKind,
  assertPaymentTransactionStatus,
} from '../specifications/payment-transaction-lifecycle.specification';
import { assertProviderIdentifier } from '../specifications/provider-identifier.specification';
import { assertUuidIdentifier } from '../specifications/uuid-identifier.specification';
import { assertValidDate } from '../specifications/valid-date.specification';
import { IdempotencyKey } from '../value-objects/idempotency-key.value-object';
import { Money } from '../value-objects/money.value-object';
import { ProviderCode } from '../value-objects/provider-code.value-object';

type PaymentTransactionLifecycleProps = Pick<
  BaseDomainEntityProps<string>,
  'id' | 'createdAt' | 'updatedAt'
>;

type PendingPaymentTransactionProps = PaymentTransactionLifecycleProps & {
  userId: string;
  productId: string;
  provider: ProviderCode;
  money: Money;
  idempotencyKey: IdempotencyKey;
};

export type CreatePendingPurchaseProps = PendingPaymentTransactionProps & {
  checkoutSessionId: string;
};

export type CreatePendingRenewalProps = PendingPaymentTransactionProps;

export type TargetPaymentTransactionEntityProps = PendingPaymentTransactionProps & {
  subscriptionId: string | null;
  checkoutSessionId: string | null;
  kind: PaymentKind;
  status: PaymentTransactionStatus;
  providerTransactionId: string | null;
  providerInvoiceId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
};

export type SucceedPaymentTransactionProps = {
  subscriptionId: string;
  providerTransactionId: string;
  providerInvoiceId?: string | null;
  paidAt: Date;
};

export type FailPaymentTransactionProps = {
  failureCode: string;
  failureMessage?: string | null;
  providerTransactionId?: string | null;
  providerInvoiceId?: string | null;
};

export class TargetPaymentTransactionEntity extends BaseDomainEntity<string> {
  private readonly userId: string;
  private readonly productId: string;
  private subscriptionId: string | null;
  private readonly checkoutSessionId: string | null;
  private readonly provider: ProviderCode;
  private readonly kind: PaymentKind;
  private status: PaymentTransactionStatus;
  private readonly money: Money;
  private readonly idempotencyKey: IdempotencyKey;
  private providerTransactionId: string | null;
  private providerInvoiceId: string | null;
  private failureCode: string | null;
  private failureMessage: string | null;
  private paidAt: Date | null;
  private readonly refundedAt: Date | null;

  constructor(props: TargetPaymentTransactionEntityProps) {
    TargetPaymentTransactionEntity.assertConstructionInvariants(props);
    super({
      id: props.id,
      createdAt: props.createdAt ? new Date(props.createdAt.getTime()) : undefined,
      updatedAt: props.updatedAt ? new Date(props.updatedAt.getTime()) : undefined,
    });
    this.userId = props.userId;
    this.productId = props.productId;
    this.subscriptionId = props.subscriptionId;
    this.checkoutSessionId = props.checkoutSessionId;
    this.provider = props.provider;
    this.kind = props.kind;
    this.status = props.status;
    this.money = props.money;
    this.idempotencyKey = props.idempotencyKey;
    this.providerTransactionId = props.providerTransactionId;
    this.providerInvoiceId = props.providerInvoiceId;
    this.failureCode = props.failureCode;
    this.failureMessage = props.failureMessage;
    this.paidAt = props.paidAt ? new Date(props.paidAt.getTime()) : null;
    this.refundedAt = props.refundedAt ? new Date(props.refundedAt.getTime()) : null;
  }

  public static createPendingPurchase(
    props: CreatePendingPurchaseProps,
  ): TargetPaymentTransactionEntity {
    return new TargetPaymentTransactionEntity({
      ...props,
      subscriptionId: null,
      kind: PaymentKind.PURCHASE,
      status: PaymentTransactionStatus.PENDING,
      providerTransactionId: null,
      providerInvoiceId: null,
      failureCode: null,
      failureMessage: null,
      paidAt: null,
      refundedAt: null,
    });
  }

  public static createPendingRenewal(
    props: CreatePendingRenewalProps,
  ): TargetPaymentTransactionEntity {
    return new TargetPaymentTransactionEntity({
      ...props,
      subscriptionId: null,
      checkoutSessionId: null,
      kind: PaymentKind.RENEWAL,
      status: PaymentTransactionStatus.PENDING,
      providerTransactionId: null,
      providerInvoiceId: null,
      failureCode: null,
      failureMessage: null,
      paidAt: null,
      refundedAt: null,
    });
  }

  public getUserId(): string {
    return this.userId;
  }

  public getProductId(): string {
    return this.productId;
  }

  public getSubscriptionId(): string | null {
    return this.subscriptionId;
  }

  public getCheckoutSessionId(): string | null {
    return this.checkoutSessionId;
  }

  public getProvider(): ProviderCode {
    return this.provider;
  }

  public getKind(): PaymentKind {
    return this.kind;
  }

  public getStatus(): PaymentTransactionStatus {
    return this.status;
  }

  public getMoney(): Money {
    return this.money;
  }

  public getIdempotencyKey(): IdempotencyKey {
    return this.idempotencyKey;
  }

  public getProviderTransactionId(): string | null {
    return this.providerTransactionId;
  }

  public getProviderInvoiceId(): string | null {
    return this.providerInvoiceId;
  }

  public getFailureCode(): string | null {
    return this.failureCode;
  }

  public getFailureMessage(): string | null {
    return this.failureMessage;
  }

  public getPaidAt(): Date | null {
    return this.paidAt ? new Date(this.paidAt.getTime()) : null;
  }

  public getRefundedAt(): Date | null {
    return this.refundedAt ? new Date(this.refundedAt.getTime()) : null;
  }

  public markProcessing(): void {
    if (this.status === PaymentTransactionStatus.PROCESSING) {
      return;
    }
    if (this.status !== PaymentTransactionStatus.PENDING) {
      throw TargetPaymentTransactionEntity.conflict(
        'Terminal payment transaction cannot transition to processing',
      );
    }
    this.status = PaymentTransactionStatus.PROCESSING;
    this.touch();
  }

  public succeed(props: SucceedPaymentTransactionProps): void {
    TargetPaymentTransactionEntity.assertSuccessFacts(props);
    const providerInvoiceId = props.providerInvoiceId ?? null;

    if (this.status === PaymentTransactionStatus.SUCCEEDED) {
      if (this.matchesSuccess({ ...props, providerInvoiceId })) {
        return;
      }
      throw TargetPaymentTransactionEntity.conflict(
        'Payment transaction success facts cannot be replaced',
      );
    }
    if (!this.isPendingOrProcessing()) {
      throw TargetPaymentTransactionEntity.conflict(
        'Terminal payment transaction cannot transition to succeeded',
      );
    }

    this.subscriptionId = props.subscriptionId;
    this.providerTransactionId = props.providerTransactionId;
    this.providerInvoiceId = providerInvoiceId;
    this.paidAt = new Date(props.paidAt.getTime());
    this.status = PaymentTransactionStatus.SUCCEEDED;
    this.touch();
  }

  public fail(props: FailPaymentTransactionProps): void {
    const failureMessage = props.failureMessage ?? null;
    const providerTransactionId = props.providerTransactionId ?? null;
    const providerInvoiceId = props.providerInvoiceId ?? null;
    assertPaymentFailureDetails({ failureCode: props.failureCode, failureMessage });
    TargetPaymentTransactionEntity.assertOptionalProviderIdentifiers({
      providerTransactionId,
      providerInvoiceId,
    });

    if (this.status === PaymentTransactionStatus.FAILED) {
      if (
        this.failureCode === props.failureCode &&
        this.failureMessage === failureMessage &&
        this.providerTransactionId === providerTransactionId &&
        this.providerInvoiceId === providerInvoiceId
      ) {
        return;
      }
      throw TargetPaymentTransactionEntity.conflict(
        'Payment transaction failure facts cannot be replaced',
      );
    }
    if (!this.isPendingOrProcessing()) {
      throw TargetPaymentTransactionEntity.conflict(
        'Terminal payment transaction cannot transition to failed',
      );
    }

    this.status = PaymentTransactionStatus.FAILED;
    this.providerTransactionId = providerTransactionId;
    this.providerInvoiceId = providerInvoiceId;
    this.failureCode = props.failureCode;
    this.failureMessage = failureMessage;
    this.touch();
  }

  private static assertConstructionInvariants(props: TargetPaymentTransactionEntityProps): void {
    assertUuidIdentifier(props.id);
    assertUuidIdentifier(props.userId);
    assertUuidIdentifier(props.productId);
    if (props.subscriptionId !== null) assertUuidIdentifier(props.subscriptionId);
    if (props.checkoutSessionId !== null) assertUuidIdentifier(props.checkoutSessionId);
    assertPaymentKind(props.kind);
    assertPaymentTransactionStatus(props.status);
    TargetPaymentTransactionEntity.assertValueObjects(props);
    TargetPaymentTransactionEntity.assertOptionalProviderIdentifiers(props);
    TargetPaymentTransactionEntity.assertOptionalDates(props);
    TargetPaymentTransactionEntity.assertKindLink(props);
    TargetPaymentTransactionEntity.assertStatusFields(props);
  }

  private static assertValueObjects(props: TargetPaymentTransactionEntityProps): void {
    if (
      !(props.provider instanceof ProviderCode) ||
      !(props.money instanceof Money) ||
      !(props.idempotencyKey instanceof IdempotencyKey)
    ) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Payment transaction requires valid provider, money, and idempotency values',
      );
    }
  }

  private static assertKindLink(props: TargetPaymentTransactionEntityProps): void {
    if (props.kind === PaymentKind.PURCHASE && props.checkoutSessionId === null) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Purchase payment transaction requires a checkout session',
      );
    }
    if (props.kind === PaymentKind.RENEWAL && props.checkoutSessionId !== null) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Renewal payment transaction cannot reference a checkout session',
      );
    }
  }

  private static assertStatusFields(props: TargetPaymentTransactionEntityProps): void {
    if (
      props.status === PaymentTransactionStatus.PENDING ||
      props.status === PaymentTransactionStatus.PROCESSING
    ) {
      TargetPaymentTransactionEntity.assertPendingFields(props);
      return;
    }
    if (props.status === PaymentTransactionStatus.SUCCEEDED) {
      TargetPaymentTransactionEntity.assertSucceededFields(props);
      return;
    }
    if (props.status === PaymentTransactionStatus.FAILED) {
      TargetPaymentTransactionEntity.assertFailedFields(props);
      return;
    }
    TargetPaymentTransactionEntity.assertRefundedFields(props);
  }

  private static assertPendingFields(props: TargetPaymentTransactionEntityProps): void {
    if (
      props.subscriptionId !== null ||
      props.paidAt !== null ||
      props.refundedAt !== null ||
      props.failureCode !== null ||
      props.failureMessage !== null
    ) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Pending payment transaction contains terminal-state facts',
      );
    }
  }

  private static assertSucceededFields(props: TargetPaymentTransactionEntityProps): void {
    if (
      props.subscriptionId === null ||
      props.providerTransactionId === null ||
      props.paidAt === null ||
      props.refundedAt !== null ||
      props.failureCode !== null ||
      props.failureMessage !== null
    ) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Succeeded payment transaction has inconsistent lifecycle facts',
      );
    }
  }

  private static assertFailedFields(props: TargetPaymentTransactionEntityProps): void {
    if (
      props.subscriptionId !== null ||
      props.paidAt !== null ||
      props.refundedAt !== null ||
      props.failureCode === null
    ) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Failed payment transaction has inconsistent lifecycle facts',
      );
    }
    assertPaymentFailureDetails({
      failureCode: props.failureCode,
      failureMessage: props.failureMessage,
    });
  }

  private static assertRefundedFields(props: TargetPaymentTransactionEntityProps): void {
    if (
      props.subscriptionId === null ||
      props.providerTransactionId === null ||
      props.paidAt === null ||
      props.refundedAt === null ||
      props.failureCode !== null ||
      props.failureMessage !== null
    ) {
      throw TargetPaymentTransactionEntity.badRequest(
        'Refunded payment transaction has inconsistent lifecycle facts',
      );
    }
  }

  private static assertOptionalProviderIdentifiers(props: {
    providerTransactionId: string | null;
    providerInvoiceId: string | null;
  }): void {
    if (props.providerTransactionId !== null) {
      assertProviderIdentifier(props.providerTransactionId);
    }
    if (props.providerInvoiceId !== null) {
      assertProviderIdentifier(props.providerInvoiceId);
    }
  }

  private static assertOptionalDates(props: {
    paidAt: Date | null;
    refundedAt: Date | null;
  }): void {
    if (props.paidAt !== null) {
      assertValidDate({ value: props.paidAt, message: 'Payment timestamp must be a valid Date' });
    }
    if (props.refundedAt !== null) {
      assertValidDate({
        value: props.refundedAt,
        message: 'Refund timestamp must be a valid Date',
      });
    }
  }

  private static assertSuccessFacts(props: SucceedPaymentTransactionProps): void {
    assertUuidIdentifier(props.subscriptionId);
    assertProviderIdentifier(props.providerTransactionId);
    if (props.providerInvoiceId !== undefined && props.providerInvoiceId !== null) {
      assertProviderIdentifier(props.providerInvoiceId);
    }
    assertValidDate({ value: props.paidAt, message: 'Payment timestamp must be a valid Date' });
  }

  private matchesSuccess(props: Required<SucceedPaymentTransactionProps>): boolean {
    return (
      this.subscriptionId === props.subscriptionId &&
      this.providerTransactionId === props.providerTransactionId &&
      this.providerInvoiceId === props.providerInvoiceId &&
      this.paidAt?.getTime() === props.paidAt.getTime()
    );
  }

  private isPendingOrProcessing(): boolean {
    return (
      this.status === PaymentTransactionStatus.PENDING ||
      this.status === PaymentTransactionStatus.PROCESSING
    );
  }

  private static badRequest(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }

  private static conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}
