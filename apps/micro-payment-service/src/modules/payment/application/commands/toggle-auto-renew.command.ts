import { randomUUID } from 'crypto';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  PAYMENT_INTEGRATION_AGGREGATE_TYPE,
  PAYMENT_INTEGRATION_EVENT_TYPE,
  PAYMENT_INTEGRATION_EVENT_VERSION,
  SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY,
} from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { PaymentConfig } from '../../../../core/payment.config';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { PaymentProviderResolver } from '../ports/payment-provider-resolver.port';
import {
  DisableProviderAutoRenewCommand,
  EnableProviderAutoRenewCommand,
} from '../ports/payment-provider.types';
import { IPaymentUnitOfWork } from '../ports/payment-unit-of-work.port';
import { ToggleAutoRenewInput, ToggleAutoRenewResult } from '../types/payment-grpc.types';

export class ToggleAutoRenewCommand extends Command<ToggleAutoRenewResult> {
  constructor(public readonly input: ToggleAutoRenewInput) {
    super();
  }
}

@CommandHandler(ToggleAutoRenewCommand)
export class ToggleAutoRenewHandler implements ICommandHandler<
  ToggleAutoRenewCommand,
  ToggleAutoRenewResult
> {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly paymentConfig: PaymentConfig,
  ) {}

  public async execute(command: ToggleAutoRenewCommand): Promise<ToggleAutoRenewResult> {
    const snapshot = await this.unitOfWork.execute(async (context) => {
      await context.lockUser(command.input.userId);
      const subscription = await context.subscriptions.findOwnedById({
        id: command.input.subscriptionId,
        userId: command.input.userId,
      });
      if (!subscription) throw this.notFound();
      const tail = await context.subscriptions.findTailByUserId(command.input.userId);
      this.assertTail(subscription, tail);
      const now = await context.databaseNow();
      if (subscription.getEndsAt().getTime() <= now.getTime()) {
        throw this.conflict('Subscription paid period has ended');
      }
      if (subscription.getAutoRenew() === command.input.enabled) {
        return { subscription, noOp: true as const };
      }
      const provider = subscription.getProvider();
      const mapping = await context.productProviders.findActiveByProduct({
        productId: subscription.getProductId(),
        provider,
        environment: this.paymentConfig.providerEnvironment,
      });
      const customer = await context.providerCustomers.findByUserAndProvider({
        userId: command.input.userId,
        provider,
      });
      if (!mapping || !customer) throw this.providerUnavailable();
      return {
        subscription,
        noOp: false as const,
        provider,
        providerCustomerId: customer.providerCustomerId,
        providerBillingId: mapping.providerBillingId,
        updatedAt: subscription.updatedAt,
        status: subscription.getStatus(),
        sequence: subscription.getSequence(),
        providerSubscriptionId: subscription.getProviderSubscriptionId(),
        providerRenewalId: subscription.getProviderScheduleId(),
      };
    });

    if (snapshot.noOp) return this.result(snapshot.subscription);
    const strategy = this.providerResolver.resolve(snapshot.provider);
    const providerResult = snapshot.subscription.getAutoRenew()
      ? await strategy.disableAutoRenew(this.disableCommand(command.input, snapshot))
      : await strategy.enableAutoRenew(this.enableCommand(command.input, snapshot));
    if (providerResult.autoRenewEnabled !== command.input.enabled) {
      throw this.reconciliation('Provider did not confirm the requested auto-renew state');
    }
    if (
      command.input.enabled &&
      providerResult.nextBillingAt !== snapshot.subscription.getEndsAt().toISOString()
    ) {
      throw this.reconciliation('Provider next billing date does not match the paid boundary');
    }

    return this.unitOfWork.execute(async (context) => {
      await context.lockUser(command.input.userId);
      const current = await context.subscriptions.findOwnedById({
        id: command.input.subscriptionId,
        userId: command.input.userId,
      });
      if (!current) throw this.notFound();
      const tail = await context.subscriptions.findTailByUserId(command.input.userId);
      this.assertTail(current, tail);
      if (
        current.updatedAt.getTime() !== snapshot.updatedAt.getTime() ||
        current.getAutoRenew() !== snapshot.subscription.getAutoRenew() ||
        current.getProviderSubscriptionId() !== snapshot.providerSubscriptionId ||
        current.getProviderScheduleId() !== snapshot.providerRenewalId ||
        current.getStatus() !== snapshot.status ||
        current.getSequence() !== snapshot.sequence ||
        current.getStartsAt().getTime() !== snapshot.subscription.getStartsAt().getTime() ||
        current.getEndsAt().getTime() !== snapshot.subscription.getEndsAt().getTime()
      ) {
        throw this.reconciliation('Subscription changed while provider operation was running');
      }
      if (command.input.enabled) {
        current.enableAutoRenew({
          providerSubscriptionId: providerResult.providerSubscriptionId,
          providerScheduleId: providerResult.providerRenewalId,
          providerStatus: providerResult.providerStatus,
          nextBillingAt: new Date(providerResult.nextBillingAt!),
        });
      } else {
        current.disableAutoRenew({ providerStatus: providerResult.providerStatus });
      }
      await context.subscriptions.save(current);
      const effectiveAt = await context.databaseNow();
      await context.outbox.write({
        eventId: randomUUID(),
        version: PAYMENT_INTEGRATION_EVENT_VERSION,
        eventType: PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_AUTO_RENEW_CHANGED,
        occurredAt: effectiveAt.toISOString(),
        aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
        aggregateId: current.id,
        routingKey: SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY,
        payload: {
          userId: current.getUserId(),
          subscriptionId: current.id,
          enabled: current.getAutoRenew(),
          effectiveAt: effectiveAt.toISOString(),
          nextBillingAt: current.getNextBillingAt()?.toISOString() ?? null,
          provider: current.getProvider().getValue(),
        },
      });
      return this.result(current);
    });
  }

  private disableCommand(
    input: ToggleAutoRenewInput,
    snapshot: ToggleSnapshot,
  ): DisableProviderAutoRenewCommand {
    return {
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      provider: snapshot.provider,
      providerCustomerId: snapshot.providerCustomerId,
      providerSubscriptionId: snapshot.providerSubscriptionId,
      providerRenewalId: snapshot.providerRenewalId,
      finalLocalEndsAt: snapshot.subscription.getEndsAt().toISOString(),
      providerIdempotencyKey: `auto-renew:disable:${input.subscriptionId}:${snapshot.providerRenewalId ?? snapshot.providerSubscriptionId}`,
    };
  }

  private enableCommand(
    input: ToggleAutoRenewInput,
    snapshot: ToggleSnapshot,
  ): EnableProviderAutoRenewCommand {
    return {
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      provider: snapshot.provider,
      providerCustomerId: snapshot.providerCustomerId,
      providerSubscriptionId: snapshot.providerSubscriptionId,
      providerRenewalId: snapshot.providerRenewalId,
      providerBillingId: snapshot.providerBillingId,
      finalLocalEndsAt: snapshot.subscription.getEndsAt().toISOString(),
      providerIdempotencyKey: `auto-renew:enable:${input.subscriptionId}:${snapshot.subscription.getEndsAt().toISOString()}:${snapshot.providerRenewalId ?? snapshot.providerSubscriptionId}`,
    };
  }

  private result(subscription: SubscriptionEntity): ToggleAutoRenewResult {
    return {
      success: true,
      autoRenew: subscription.getAutoRenew(),
      nextBillingAt: subscription.getNextBillingAt(),
      providerStatus: subscription.getProviderStatus(),
    };
  }

  private assertTail(subscription: SubscriptionEntity, tail: SubscriptionEntity | null): void {
    if (
      !tail ||
      tail.id !== subscription.id ||
      ![SubscriptionStatus.ACTIVE, SubscriptionStatus.QUEUED].includes(subscription.getStatus())
    ) {
      throw this.conflict('Subscription is not the last unfinished subscription');
    }
  }

  private notFound(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.NotFound,
      message: 'Subscription not found',
    });
  }

  private conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }

  private providerUnavailable(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment provider state is unavailable',
    });
  }

  private reconciliation(message: string): DomainException {
    return new DomainException({
      code: DomainExceptionCode.Conflict,
      message,
      extensions: [{ field: 'reason', message: 'PAYMENT_RECONCILIATION_REQUIRED' }],
    });
  }
}

type ToggleSnapshot = Readonly<{
  subscription: SubscriptionEntity;
  noOp: false;
  provider: ReturnType<SubscriptionEntity['getProvider']>;
  providerCustomerId: string;
  providerBillingId: string;
  updatedAt: Date;
  status: SubscriptionStatus;
  sequence: number;
  providerSubscriptionId: string | null;
  providerRenewalId: string | null;
}>;
