import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  PAYMENT_INTEGRATION_AGGREGATE_TYPE,
  PAYMENT_INTEGRATION_EVENT_TYPE,
  PAYMENT_INTEGRATION_EVENT_VERSION,
  PaymentFailedV1,
  PaymentSucceededV1,
  QueuedSubscriptionPurchasedV1,
  SUBSCRIPTION_QUEUED_ROUTING_KEY,
} from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { CheckoutSessionEntity } from '../../domain/entities/checkout-session.entity';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProviderWebhookEventEntity } from '../../domain/entities/provider-webhook-event.entity';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { PaymentKind } from '../../domain/enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import { ProviderWebhookEventStatus } from '../../domain/enums/provider-webhook-event-status.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { ProductProviderMapping } from '../../domain/interfaces/product-provider.repository.interface';
import { ProviderCustomer } from '../../domain/interfaces/provider-customer.repository.interface';
import { BillingPeriod } from '../../domain/value-objects/billing-period.value-object';
import { PaymentProviderResolver } from '../ports/payment-provider-resolver.port';
import {
  CheckoutPaymentFailedProviderEvent,
  CheckoutPaymentSucceededProviderEvent,
  ProviderSubscriptionState,
} from '../ports/payment-provider.types';
import { IPaymentUnitOfWork, PaymentUnitOfWorkContext } from '../ports/payment-unit-of-work.port';
import { StagePaidAccessNotificationService } from './stage-paid-access-notification.service';
import { PaymentNotificationSchedulerTransport } from '../../infrastructure/messaging/payment-notification-scheduler.transport';

@Injectable()
export class AdditionalPaymentWebhookProcessor {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly stageNotification: StagePaidAccessNotificationService,
    private readonly schedulerTransport: PaymentNotificationSchedulerTransport,
  ) {}

  public async processSuccess(event: CheckoutPaymentSucceededProviderEvent): Promise<void> {
    this.assertRequiredSuccessFacts(event);
    const providerTransactionId = event.providerTransactionId;
    if (!providerTransactionId) {
      throw this.badRequest('Verified additional payment transaction identifier is missing');
    }
    const prepared = await this.unitOfWork.execute((context) =>
      this.prepareAlignment(context, event),
    );
    const providerState = await this.providerResolver
      .resolve(event.provider)
      .synchronizeNextBilling({
        userId: prepared.facts.checkout.getUserId(),
        subscriptionId: prepared.queuedSubscriptionId,
        provider: event.provider,
        providerCustomerId: prepared.facts.providerCustomer.providerCustomerId,
        currentProviderSubscriptionId: prepared.activeProviderSubscriptionId,
        currentProviderRenewalId: prepared.tail.getProviderScheduleId(),
        providerBillingId: prepared.productProvider.providerBillingId,
        confirmedProviderTransactionId: providerTransactionId,
        billingInterval: prepared.facts.product.getBillingInterval(),
        billingIntervalCount: prepared.facts.product.getBillingIntervalCount(),
        finalLocalEndsAt: prepared.period.getEndsAt().toISOString(),
        providerIdempotencyKey: `align-${prepared.facts.checkout.id}`,
      });
    this.assertProviderState(prepared, providerState);
    const staged = await this.unitOfWork.execute((context) =>
      this.applySuccess(context, event, prepared, providerState),
    );
    if (staged.outcome === 'CREATED' || staged.outcome === 'MERGED') {
      await this.schedulerTransport.wake(staged.schedule.id).catch(() => undefined);
    }
  }

  public async processFailure(event: CheckoutPaymentFailedProviderEvent): Promise<void> {
    await this.unitOfWork.execute(async (context) => {
      const facts = await this.loadFacts(context, event);
      this.assertCommonFacts(event, facts);
      this.assertMutableIntent(facts);
      facts.transaction.fail({
        failureCode: event.failureCode,
        providerTransactionId: event.providerTransactionId,
        providerInvoiceId: event.providerInvoiceId,
      });
      facts.checkout.fail();
      facts.journal.markProcessed(this.processedAt(facts.journal.getReceivedAt()));
      await context.paymentTransactions.save(facts.transaction);
      await context.checkoutSessions.save(facts.checkout);
      await context.providerWebhookEvents.save(facts.journal);
      await context.outbox.write(this.paymentFailedEvent(event, facts));
    });
  }

  private async prepareAlignment(
    context: PaymentUnitOfWorkContext,
    event: CheckoutPaymentSucceededProviderEvent,
  ): Promise<PreparedAdditionalPayment> {
    const facts = await this.loadFacts(context, event);
    this.assertCommonFacts(event, facts);
    this.assertMutableIntent(facts);
    const queue = await context.subscriptions.findOrderedUnfinishedByUserId(
      facts.checkout.getUserId(),
    );
    const tail = queue.at(-1);
    const active = queue.find(
      (subscription) => subscription.getStatus() === SubscriptionStatus.ACTIVE,
    );
    const activeProviderSubscriptionId = active?.getProviderSubscriptionId() ?? null;
    if (!tail || !activeProviderSubscriptionId) {
      throw this.conflict('Paid subscription queue provider correlation is incomplete');
    }
    const productProvider = await context.productProviders.findActiveByProduct({
      productId: facts.product.id,
      provider: event.provider,
      environment: 'test',
    });
    if (!productProvider) throw this.conflict('Provider billing configuration is unavailable');
    const period = new BillingPeriod({
      startsAt: tail.getEndsAt(),
      billingInterval: facts.product.getBillingInterval(),
      billingIntervalCount: facts.product.getBillingIntervalCount(),
    });
    return {
      facts,
      tail,
      tailSequence: tail.getSequence(),
      tailEndsAt: tail.getEndsAt(),
      activeProviderSubscriptionId,
      productProvider,
      period,
      queuedSubscriptionId: this.deriveQueuedSubscriptionId(facts.checkout.id),
    };
  }

  private async applySuccess(
    context: PaymentUnitOfWorkContext,
    event: CheckoutPaymentSucceededProviderEvent,
    prepared: PreparedAdditionalPayment,
    providerState: ProviderSubscriptionState,
  ): Promise<Awaited<ReturnType<StagePaidAccessNotificationService['stage']>>> {
    const facts = await this.loadFacts(context, event);
    this.assertCommonFacts(event, facts);
    this.assertMutableIntent(facts);
    const queue = await context.subscriptions.findOrderedUnfinishedByUserId(
      facts.checkout.getUserId(),
    );
    const tail = queue.at(-1);
    if (
      !tail ||
      tail.id !== prepared.tail.id ||
      tail.getSequence() !== prepared.tailSequence ||
      tail.getEndsAt().getTime() !== prepared.tailEndsAt.getTime()
    ) {
      throw this.conflict('Paid subscription queue changed during provider alignment');
    }
    const providerRenewalId = providerState.providerRenewalId;
    if (!providerRenewalId) throw this.conflict('Provider renewal correlation is missing');
    const queued = SubscriptionEntity.createPaidQueued({
      id: prepared.queuedSubscriptionId,
      userId: facts.checkout.getUserId(),
      productId: facts.product.id,
      provider: event.provider,
      providerSubscriptionId: null,
      providerScheduleId: providerRenewalId,
      providerStatus: providerState.providerStatus,
      sequence: prepared.tailSequence + 1,
      period: prepared.period,
    });
    if (tail.getAutoRenew()) {
      tail.disableAutoRenew({ providerStatus: providerState.providerStatus });
    }
    const paidAt = this.parseOccurredAt(event.occurredAt);
    facts.transaction.succeed({
      subscriptionId: queued.id,
      providerTransactionId: event.providerTransactionId,
      providerInvoiceId: event.providerInvoiceId,
      paidAt,
    });
    facts.checkout.complete(paidAt);
    facts.journal.markProcessed(this.processedAt(facts.journal.getReceivedAt()));
    await context.subscriptions.save(tail);
    await context.subscriptions.insert(queued);
    await context.paymentTransactions.save(facts.transaction);
    await context.checkoutSessions.save(facts.checkout);
    await context.providerWebhookEvents.save(facts.journal);
    await context.outbox.write(this.paymentSucceededEvent(event, facts, queued));
    await context.outbox.write(this.queuedPurchasedEvent(event, facts, queued));
    return this.stageNotification.stage(
      {
        userId: queued.getUserId(),
        trigger: 'ADDITIONAL_PURCHASE',
        sourceTransactionId: facts.transaction.id,
        sourceSubscriptionId: queued.id,
        effectiveAt: queued.getStartsAt(),
        contiguousPaidEndsAt: queued.getEndsAt(),
        now: paidAt,
      },
      context.notificationSchedules,
    );
  }

  private async loadFacts(
    context: PaymentUnitOfWorkContext,
    event: CheckoutPaymentSucceededProviderEvent | CheckoutPaymentFailedProviderEvent,
  ): Promise<AdditionalPaymentFacts> {
    if (!event.providerCheckoutId) throw this.badRequest('Webhook checkout correlation is missing');
    const candidate = await context.checkoutSessions.findByProviderCheckoutId({
      provider: event.provider,
      providerCheckoutId: event.providerCheckoutId,
    });
    if (!candidate) throw this.conflict('Webhook checkout correlation is not recognized');
    await context.lockUser(candidate.getUserId());
    const checkout = await context.checkoutSessions.findById(candidate.id);
    if (!checkout) throw this.conflict('Webhook checkout correlation is not recognized');
    const transactions = await context.paymentTransactions.findByCheckoutSessionId(checkout.id);
    if (transactions.length !== 1)
      throw this.conflict('Checkout payment correlation is inconsistent');
    const product = await context.products.findById(checkout.getProductId());
    const providerCustomer = await context.providerCustomers.findByUserAndProvider({
      userId: checkout.getUserId(),
      provider: event.provider,
    });
    const journal = await context.providerWebhookEvents.findByProviderEventId({
      provider: event.provider,
      providerEventId: event.providerEventId,
    });
    if (!product || !providerCustomer || !journal) {
      throw this.conflict('Verified payment correlation is incomplete');
    }
    if (journal.getStatus() !== ProviderWebhookEventStatus.PROCESSING) {
      throw this.conflict('Webhook journal claim is not active');
    }
    return { checkout, transaction: transactions[0], product, providerCustomer, journal };
  }

  private assertCommonFacts(
    event: CheckoutPaymentSucceededProviderEvent | CheckoutPaymentFailedProviderEvent,
    facts: AdditionalPaymentFacts,
  ): void {
    const money = facts.transaction.getMoney();
    if (
      facts.checkout.getPurpose() !== CheckoutPurpose.ADDITIONAL_SUBSCRIPTION ||
      facts.transaction.getKind() !== PaymentKind.PURCHASE ||
      facts.transaction.getCheckoutSessionId() !== facts.checkout.id ||
      facts.transaction.getUserId() !== facts.checkout.getUserId() ||
      facts.transaction.getProductId() !== facts.product.id ||
      !facts.transaction.getProvider().equals(event.provider) ||
      event.localCheckoutSessionId !== facts.checkout.id ||
      (event.productId !== null && event.productId !== facts.product.id) ||
      money.getAmountMinor() !== event.amountMinor ||
      money.getCurrency().getValue() !== event.currency ||
      (event.providerCustomerId !== null &&
        event.providerCustomerId !== facts.providerCustomer.providerCustomerId)
    ) {
      throw this.conflict('Verified additional payment facts are inconsistent');
    }
  }

  private assertRequiredSuccessFacts(event: CheckoutPaymentSucceededProviderEvent): void {
    if (
      !event.providerCheckoutId ||
      !event.localCheckoutSessionId ||
      !event.providerTransactionId
    ) {
      throw this.badRequest('Verified additional payment is missing required provider facts');
    }
    this.parseOccurredAt(event.occurredAt);
  }

  private assertMutableIntent(facts: AdditionalPaymentFacts): void {
    if (
      facts.checkout.getStatus() !== CheckoutStatus.CREATED ||
      (facts.transaction.getStatus() !== PaymentTransactionStatus.PENDING &&
        facts.transaction.getStatus() !== PaymentTransactionStatus.PROCESSING)
    ) {
      throw this.conflict('Additional payment transition is not allowed');
    }
  }

  private assertProviderState(
    prepared: PreparedAdditionalPayment,
    state: ProviderSubscriptionState,
  ): void {
    if (
      !state.provider.equals(prepared.facts.checkout.getProvider()) ||
      state.providerCustomerId !== prepared.facts.providerCustomer.providerCustomerId ||
      state.providerSubscriptionId !== prepared.activeProviderSubscriptionId ||
      !state.providerRenewalId ||
      !state.autoRenewEnabled ||
      state.nextBillingAt !== prepared.period.getEndsAt().toISOString()
    ) {
      throw this.conflict('Provider billing alignment result is inconsistent');
    }
  }

  private paymentSucceededEvent(
    event: CheckoutPaymentSucceededProviderEvent,
    facts: AdditionalPaymentFacts,
    queued: SubscriptionEntity,
  ): PaymentSucceededV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_SUCCEEDED,
      occurredAt: event.occurredAt,
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION,
      aggregateId: facts.transaction.id,
      routingKey: 'payment.succeeded',
      payload: {
        transactionId: facts.transaction.id,
        userId: facts.checkout.getUserId(),
        subscriptionId: queued.id,
        productId: facts.product.id,
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider: event.provider.getValue(),
        kind: PaymentKind.PURCHASE,
        checkoutPurpose: CheckoutPurpose.ADDITIONAL_SUBSCRIPTION,
        subscriptionStatus: SubscriptionStatus.QUEUED,
      },
    };
  }

  private queuedPurchasedEvent(
    event: CheckoutPaymentSucceededProviderEvent,
    facts: AdditionalPaymentFacts,
    queued: SubscriptionEntity,
  ): QueuedSubscriptionPurchasedV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.QUEUED_SUBSCRIPTION_PURCHASED,
      occurredAt: event.occurredAt,
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
      aggregateId: queued.id,
      routingKey: SUBSCRIPTION_QUEUED_ROUTING_KEY,
      payload: {
        userId: facts.checkout.getUserId(),
        subscriptionId: queued.id,
        subscriptionSequence: queued.getSequence(),
        productId: facts.product.id,
        startsAt: queued.getStartsAt().toISOString(),
        endsAt: queued.getEndsAt().toISOString(),
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider: event.provider.getValue(),
      },
    };
  }

  private paymentFailedEvent(
    event: CheckoutPaymentFailedProviderEvent,
    facts: AdditionalPaymentFacts,
  ): PaymentFailedV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_FAILED,
      occurredAt: event.occurredAt,
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION,
      aggregateId: facts.transaction.id,
      routingKey: 'payment.failed',
      payload: {
        transactionId: facts.transaction.id,
        userId: facts.checkout.getUserId(),
        productId: facts.product.id,
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider: event.provider.getValue(),
        kind: PaymentKind.PURCHASE,
        checkoutPurpose: CheckoutPurpose.ADDITIONAL_SUBSCRIPTION,
        failureCode: event.failureCode,
      },
    };
  }

  private deriveQueuedSubscriptionId(checkoutId: string): string {
    const hex = createHash('sha256').update(`queued-subscription:${checkoutId}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  private parseOccurredAt(value: string): Date {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
      throw this.badRequest('Verified payment timestamp is invalid');
    }
    return parsed;
  }

  private processedAt(receivedAt: Date): Date {
    return new Date(Math.max(Date.now(), receivedAt.getTime()));
  }

  private badRequest(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }

  private conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}

type AdditionalPaymentFacts = {
  checkout: CheckoutSessionEntity;
  transaction: PaymentTransactionEntity;
  product: ProductEntity;
  providerCustomer: ProviderCustomer;
  journal: ProviderWebhookEventEntity;
};

type PreparedAdditionalPayment = {
  facts: AdditionalPaymentFacts;
  tail: SubscriptionEntity;
  tailSequence: number;
  tailEndsAt: Date;
  activeProviderSubscriptionId: string;
  productProvider: ProductProviderMapping;
  period: BillingPeriod;
  queuedSubscriptionId: string;
};
