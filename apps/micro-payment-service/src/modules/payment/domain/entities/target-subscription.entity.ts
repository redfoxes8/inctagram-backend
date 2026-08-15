import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { assertProviderIdentifier } from '../specifications/provider-identifier.specification';
import {
  canOwnAutoRenew,
  assertSubscriptionSequence,
  assertSubscriptionStatus,
} from '../specifications/subscription-queue.specification';
import {
  assertBillingPeriod,
  isPeriodEnd,
} from '../specifications/subscription-period.specification';
import { assertUuidIdentifier } from '../specifications/uuid-identifier.specification';
import { assertValidDate } from '../specifications/valid-date.specification';
import { BillingPeriod } from '../value-objects/billing-period.value-object';
import { ProviderCode } from '../value-objects/provider-code.value-object';

type SubscriptionLifecycleProps = Pick<
  BaseDomainEntityProps<string>,
  'id' | 'createdAt' | 'updatedAt'
>;

type PaidSubscriptionProps = SubscriptionLifecycleProps & {
  userId: string;
  productId: string;
  provider: ProviderCode;
  providerSubscriptionId?: string | null;
  providerScheduleId?: string | null;
  providerStatus?: string | null;
  sequence: number;
  period: BillingPeriod;
};

export type TargetSubscriptionEntityProps = PaidSubscriptionProps & {
  status: SubscriptionStatus;
  autoRenew: boolean;
  nextBillingAt: Date | null;
};

type NormalizedTargetSubscriptionEntityProps = Omit<
  TargetSubscriptionEntityProps,
  'providerSubscriptionId' | 'providerScheduleId' | 'providerStatus'
> & {
  providerSubscriptionId: string | null;
  providerScheduleId: string | null;
  providerStatus: string | null;
};

export type DisableAutoRenewProps = {
  providerStatus: string | null;
};

export type EnableAutoRenewProps = {
  providerSubscriptionId: string | null;
  providerScheduleId: string | null;
  providerStatus: string | null;
  nextBillingAt: Date;
};

export class TargetSubscriptionEntity extends BaseDomainEntity<string> {
  private readonly userId: string;
  private readonly productId: string;
  private readonly provider: ProviderCode;
  private providerSubscriptionId: string | null;
  private providerScheduleId: string | null;
  private providerStatus: string | null;
  private readonly sequence: number;
  private status: SubscriptionStatus;
  private autoRenew: boolean;
  private readonly period: BillingPeriod;
  private nextBillingAt: Date | null;

  constructor(props: TargetSubscriptionEntityProps) {
    const normalized = TargetSubscriptionEntity.normalizeProps(props);
    TargetSubscriptionEntity.assertConstructionInvariants(normalized);
    super({
      id: normalized.id,
      createdAt: normalized.createdAt ? new Date(normalized.createdAt.getTime()) : undefined,
      updatedAt: normalized.updatedAt ? new Date(normalized.updatedAt.getTime()) : undefined,
    });
    this.userId = normalized.userId;
    this.productId = normalized.productId;
    this.provider = normalized.provider;
    this.providerSubscriptionId = normalized.providerSubscriptionId;
    this.providerScheduleId = normalized.providerScheduleId;
    this.providerStatus = normalized.providerStatus;
    this.sequence = normalized.sequence;
    this.status = normalized.status;
    this.autoRenew = normalized.autoRenew;
    this.period = normalized.period;
    this.nextBillingAt = normalized.nextBillingAt
      ? new Date(normalized.nextBillingAt.getTime())
      : null;
  }

  public static createPaidActive(props: PaidSubscriptionProps): TargetSubscriptionEntity {
    return TargetSubscriptionEntity.createPaid({ props, status: SubscriptionStatus.ACTIVE });
  }

  public static createPaidQueued(props: PaidSubscriptionProps): TargetSubscriptionEntity {
    return TargetSubscriptionEntity.createPaid({ props, status: SubscriptionStatus.QUEUED });
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

  public getProviderSubscriptionId(): string | null {
    return this.providerSubscriptionId;
  }

  public getProviderScheduleId(): string | null {
    return this.providerScheduleId;
  }

  public getProviderStatus(): string | null {
    return this.providerStatus;
  }

  public getSequence(): number {
    return this.sequence;
  }

  public getStatus(): SubscriptionStatus {
    return this.status;
  }

  public getAutoRenew(): boolean {
    return this.autoRenew;
  }

  public getStartsAt(): Date {
    return this.period.getStartsAt();
  }

  public getEndsAt(): Date {
    return this.period.getEndsAt();
  }

  public getNextBillingAt(): Date | null {
    return this.nextBillingAt ? new Date(this.nextBillingAt.getTime()) : null;
  }

  public activateQueued(effectiveAt: Date): void {
    assertValidDate({ value: effectiveAt, message: 'Activation time must be a valid Date' });
    if (this.status === SubscriptionStatus.ACTIVE) {
      if (this.period.contains(effectiveAt)) return;
      throw TargetSubscriptionEntity.conflict('Active subscription is outside its paid period');
    }
    if (this.status !== SubscriptionStatus.QUEUED) {
      throw TargetSubscriptionEntity.conflict('Only a queued subscription can be activated');
    }
    if (!this.period.contains(effectiveAt)) {
      throw TargetSubscriptionEntity.badRequest(
        'Subscription activation time must be within its paid period',
      );
    }
    this.status = SubscriptionStatus.ACTIVE;
    this.touch();
  }

  public expire(effectiveAt: Date): void {
    assertValidDate({ value: effectiveAt, message: 'Expiration time must be a valid Date' });
    if (this.status === SubscriptionStatus.EXPIRED) return;
    if (this.status !== SubscriptionStatus.ACTIVE) {
      throw TargetSubscriptionEntity.conflict('Only an active subscription can expire');
    }
    if (effectiveAt.getTime() < this.period.getEndsAt().getTime()) {
      throw TargetSubscriptionEntity.badRequest(
        'Subscription cannot expire before its paid period ends',
      );
    }
    this.status = SubscriptionStatus.EXPIRED;
    this.autoRenew = false;
    this.nextBillingAt = null;
    this.touch();
  }

  public disableAutoRenew(props: DisableAutoRenewProps): void {
    TargetSubscriptionEntity.assertToggleStatus(this.status);
    TargetSubscriptionEntity.assertOptionalProviderIdentifier(props.providerStatus);
    if (!this.autoRenew) {
      if (this.providerStatus === props.providerStatus) return;
      throw TargetSubscriptionEntity.conflict(
        'Disabled auto-renew provider state cannot be replaced',
      );
    }
    this.autoRenew = false;
    this.nextBillingAt = null;
    this.providerStatus = props.providerStatus;
    this.touch();
  }

  public enableAutoRenew(props: EnableAutoRenewProps): void {
    TargetSubscriptionEntity.assertToggleStatus(this.status);
    TargetSubscriptionEntity.assertEnableFacts({ period: this.period, ...props });
    if (this.autoRenew) {
      if (this.matchesEnabledProviderState(props)) return;
      throw TargetSubscriptionEntity.conflict(
        'Enabled auto-renew provider state cannot be replaced',
      );
    }
    TargetSubscriptionEntity.assertStableProviderSubscriptionId({
      current: this.providerSubscriptionId,
      confirmed: props.providerSubscriptionId,
    });
    this.providerSubscriptionId = props.providerSubscriptionId;
    this.providerScheduleId = props.providerScheduleId;
    this.providerStatus = props.providerStatus;
    this.nextBillingAt = new Date(props.nextBillingAt.getTime());
    this.autoRenew = true;
    this.touch();
  }

  private static createPaid(input: {
    props: PaidSubscriptionProps;
    status: SubscriptionStatus;
  }): TargetSubscriptionEntity {
    return new TargetSubscriptionEntity({
      ...input.props,
      status: input.status,
      autoRenew: true,
      nextBillingAt: input.props.period.getEndsAt(),
    });
  }

  private static normalizeProps(
    props: TargetSubscriptionEntityProps,
  ): NormalizedTargetSubscriptionEntityProps {
    return {
      ...props,
      providerSubscriptionId: props.providerSubscriptionId ?? null,
      providerScheduleId: props.providerScheduleId ?? null,
      providerStatus: props.providerStatus ?? null,
    };
  }

  private static assertConstructionInvariants(
    props: NormalizedTargetSubscriptionEntityProps,
  ): void {
    assertUuidIdentifier(props.id);
    assertUuidIdentifier(props.userId);
    assertUuidIdentifier(props.productId);
    if (!(props.provider instanceof ProviderCode)) {
      throw TargetSubscriptionEntity.badRequest('Subscription requires a valid provider');
    }
    assertSubscriptionSequence(props.sequence);
    assertSubscriptionStatus(props.status);
    assertBillingPeriod(props.period);
    TargetSubscriptionEntity.assertOptionalProviderIdentifiers(props);
    if (props.nextBillingAt !== null) {
      assertValidDate({
        value: props.nextBillingAt,
        message: 'Next billing time must be a valid Date',
      });
    }
    TargetSubscriptionEntity.assertAutoRenewFields(props);
  }

  private static assertAutoRenewFields(props: NormalizedTargetSubscriptionEntityProps): void {
    if (!canOwnAutoRenew(props.status)) {
      if (props.autoRenew || props.nextBillingAt !== null) {
        throw TargetSubscriptionEntity.badRequest('Finished subscription cannot own auto-renew');
      }
      return;
    }
    if (props.autoRenew) {
      if (props.nextBillingAt === null || !isPeriodEnd(props.period, props.nextBillingAt)) {
        throw TargetSubscriptionEntity.badRequest(
          'Auto-renew next billing time must equal the paid period end',
        );
      }
      return;
    }
    if (props.nextBillingAt !== null) {
      throw TargetSubscriptionEntity.badRequest(
        'Subscription without auto-renew cannot have a next billing time',
      );
    }
  }

  private static assertOptionalProviderIdentifiers(props: {
    providerSubscriptionId: string | null;
    providerScheduleId: string | null;
    providerStatus: string | null;
  }): void {
    TargetSubscriptionEntity.assertOptionalProviderIdentifier(props.providerSubscriptionId);
    TargetSubscriptionEntity.assertOptionalProviderIdentifier(props.providerScheduleId);
    TargetSubscriptionEntity.assertOptionalProviderIdentifier(props.providerStatus);
  }

  private static assertOptionalProviderIdentifier(value: string | null): void {
    if (value !== null) assertProviderIdentifier(value);
  }

  private static assertToggleStatus(status: SubscriptionStatus): void {
    if (!canOwnAutoRenew(status)) {
      throw TargetSubscriptionEntity.conflict(
        'Finished subscription cannot change auto-renew state',
      );
    }
  }

  private static assertEnableFacts(props: EnableAutoRenewProps & { period: BillingPeriod }): void {
    TargetSubscriptionEntity.assertOptionalProviderIdentifiers(props);
    assertValidDate({
      value: props.nextBillingAt,
      message: 'Next billing time must be a valid Date',
    });
    if (!isPeriodEnd(props.period, props.nextBillingAt)) {
      throw TargetSubscriptionEntity.badRequest(
        'Auto-renew next billing time must equal the paid period end',
      );
    }
  }

  private static assertStableProviderSubscriptionId(props: {
    current: string | null;
    confirmed: string | null;
  }): void {
    if (props.current !== null && props.current !== props.confirmed) {
      throw TargetSubscriptionEntity.conflict(
        'Provider subscription identifier cannot be replaced',
      );
    }
  }

  private matchesEnabledProviderState(props: EnableAutoRenewProps): boolean {
    return (
      this.providerSubscriptionId === props.providerSubscriptionId &&
      this.providerScheduleId === props.providerScheduleId &&
      this.providerStatus === props.providerStatus &&
      this.nextBillingAt?.getTime() === props.nextBillingAt.getTime()
    );
  }

  private static badRequest(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }

  private static conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}
