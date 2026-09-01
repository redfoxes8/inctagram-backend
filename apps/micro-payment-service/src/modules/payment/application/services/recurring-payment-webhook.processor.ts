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
  SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
  SubscriptionActivatedV1,
} from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProviderWebhookEventEntity } from '../../domain/entities/provider-webhook-event.entity';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { PaymentKind } from '../../domain/enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import { ProviderWebhookEventStatus } from '../../domain/enums/provider-webhook-event-status.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { ProductProviderMapping } from '../../domain/interfaces/product-provider.repository.interface';
import { BillingPeriod } from '../../domain/value-objects/billing-period.value-object';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.value-object';
import {
  PAYMENT_PROVIDER_ERROR_REASON,
  ProviderRenewalCorrelatedEvent,
  RenewalFailedProviderEvent,
  RenewalSucceededProviderEvent,
} from '../ports/payment-provider.types';
import { IPaymentUnitOfWork, PaymentUnitOfWorkContext } from '../ports/payment-unit-of-work.port';

@Injectable()
export class RecurringPaymentWebhookProcessor {
  constructor(private readonly unitOfWork: IPaymentUnitOfWork) {}

  public processCorrelation(event: ProviderRenewalCorrelatedEvent): Promise<void> {
    if (!event.providerSubscriptionId || !event.providerRenewalId) {
      return Promise.reject(this.reconciliationRequired());
    }
    const providerSubscriptionId = event.providerSubscriptionId;
    const providerRenewalId = event.providerRenewalId;
    return this.unitOfWork.execute(async (context) => {
      const candidate = await context.subscriptions.findByProviderScheduleId({
        provider: event.provider,
        providerIdentifier: providerRenewalId,
      });
      if (!candidate) throw this.correlationNotReady();
      await context.lockUser(candidate.getUserId());
      const subscription = await context.subscriptions.findByProviderScheduleId({
        provider: event.provider,
        providerIdentifier: providerRenewalId,
      });
      if (!subscription || subscription.id !== candidate.id) throw this.correlationNotReady();
      const customer = await context.providerCustomers.findByUserAndProvider({
        userId: subscription.getUserId(),
        provider: event.provider,
      });
      if (
        !customer ||
        customer.providerCustomerId !== event.providerCustomerId ||
        (event.localSubscriptionId !== null && event.localSubscriptionId !== subscription.id)
      ) {
        throw this.reconciliationRequired();
      }
      subscription.correlateProviderRenewal({
        providerSubscriptionId,
        providerScheduleId: providerRenewalId,
      });
      const journal = await this.processingJournal(context, event);
      journal.markProcessed(this.processedAt(journal));
      await context.subscriptions.save(subscription);
      await context.providerWebhookEvents.save(journal);
    });
  }

  public processFailure(event: RenewalFailedProviderEvent): Promise<void> {
    return this.unitOfWork.execute(async (context) => {
      const facts = await this.loadAndValidateFacts(context, event);
      const result = await this.findOrCreateTransaction(context, event, facts);
      const transaction = result.transaction;
      const firstFailure =
        result.inserted ||
        (transaction.getStatus() !== PaymentTransactionStatus.FAILED &&
          transaction.getStatus() !== PaymentTransactionStatus.SUCCEEDED);
      if (
        transaction.getStatus() !== PaymentTransactionStatus.SUCCEEDED &&
        transaction.getStatus() !== PaymentTransactionStatus.FAILED
      ) {
        transaction.fail({
          failureCode: event.failureCode,
          providerTransactionId: event.providerTransactionId,
          providerInvoiceId: event.providerInvoiceId,
        });
        await context.paymentTransactions.save(transaction);
      }
      facts.journal.markProcessed(this.processedAt(facts.journal));
      await context.providerWebhookEvents.save(facts.journal);
      if (firstFailure)
        await context.outbox.write(this.paymentFailedEvent(event, facts, transaction));
    });
  }

  public processSuccess(event: RenewalSucceededProviderEvent): Promise<void> {
    return this.unitOfWork.execute(async (context) => {
      const facts = await this.loadAndValidateFacts(context, event);
      const result = await this.findOrCreateTransaction(context, event, facts);
      const transaction = result.transaction;
      if (transaction.getStatus() === PaymentTransactionStatus.SUCCEEDED) {
        facts.journal.markProcessed(this.processedAt(facts.journal));
        await context.providerWebhookEvents.save(facts.journal);
        return;
      }

      const tail = await context.subscriptions.findLatestByUserId(facts.subscription.getUserId());
      if (!tail || tail.id !== facts.subscription.id) throw this.reconciliationRequired();
      const now = await context.databaseNow();
      const period = new BillingPeriod({
        startsAt: tail.getEndsAt(),
        billingInterval: facts.product.getBillingInterval(),
        billingIntervalCount: facts.product.getBillingIntervalCount(),
      });
      const active = await context.subscriptions.findActiveByUserId(tail.getUserId());
      const status = active ? SubscriptionStatus.QUEUED : SubscriptionStatus.ACTIVE;
      if (
        (!active && now.getTime() < period.getStartsAt().getTime()) ||
        now.getTime() >= period.getEndsAt().getTime()
      ) {
        throw this.reconciliationRequired();
      }

      const providerSubscriptionId = tail.getProviderSubscriptionId();
      const providerScheduleId = tail.getProviderScheduleId();
      if (!providerSubscriptionId) throw this.correlationNotReady();
      const nextProps = {
        id: this.derivedUuid('renewal-subscription', facts.invoiceId),
        userId: tail.getUserId(),
        productId: facts.product.id,
        provider: event.provider,
        providerSubscriptionId,
        providerScheduleId,
        providerStatus: tail.getProviderStatus(),
        sequence: tail.getSequence() + 1,
        period,
      };
      const next =
        status === SubscriptionStatus.ACTIVE
          ? SubscriptionEntity.createPaidActive(nextProps)
          : SubscriptionEntity.createPaidQueued(nextProps);
      tail.releaseRenewalOwnership();
      transaction.succeed({
        subscriptionId: next.id,
        providerTransactionId: event.providerTransactionId,
        providerInvoiceId: facts.invoiceId,
        paidAt: this.parseOccurredAt(event.occurredAt),
      });
      facts.journal.markProcessed(this.processedAt(facts.journal));

      await context.subscriptions.save(tail);
      await context.subscriptions.insert(next);
      await context.paymentTransactions.save(transaction);
      await context.providerWebhookEvents.save(facts.journal);
      await context.outbox.write(this.paymentSucceededEvent(event, facts, transaction, next));
      if (status === SubscriptionStatus.ACTIVE) {
        await context.outbox.write(this.subscriptionActivatedEvent(event, next));
      }
    });
  }

  private async loadAndValidateFacts(
    context: PaymentUnitOfWorkContext,
    event: RenewalSucceededProviderEvent | RenewalFailedProviderEvent,
  ): Promise<RenewalFacts> {
    if (!event.providerInvoiceId || !event.providerSubscriptionId) {
      throw this.correlationNotReady();
    }
    const candidate = await context.subscriptions.findByProviderSubscriptionId({
      provider: event.provider,
      providerIdentifier: event.providerSubscriptionId,
    });
    if (!candidate) throw this.correlationNotReady();
    await context.lockUser(candidate.getUserId());
    const subscription = await context.subscriptions.findByProviderSubscriptionId({
      provider: event.provider,
      providerIdentifier: event.providerSubscriptionId,
    });
    if (!subscription || subscription.getUserId() !== candidate.getUserId()) {
      throw this.correlationNotReady();
    }
    const product = await context.products.findById(subscription.getProductId());
    const mapping = await context.productProviders.findActiveByProduct({
      productId: subscription.getProductId(),
      provider: event.provider,
      environment: 'test',
    });
    const customer = await context.providerCustomers.findByUserAndProvider({
      userId: subscription.getUserId(),
      provider: event.provider,
    });
    const journal = await this.processingJournal(context, event);
    if (!product || !mapping || !customer) throw this.reconciliationRequired();
    const money = product.getPrice();
    const scheduleCorrelationValid =
      event.billingReason === 'subscription_cycle' ||
      (event.billingReason === 'subscription_create' &&
        subscription.getProviderScheduleId() !== null);
    if (
      !scheduleCorrelationValid ||
      event.providerCustomerId !== customer.providerCustomerId ||
      !event.supportedInvoiceShape ||
      (event.kind === 'RENEWAL_SUCCEEDED' && !event.paymentEvidenceValid) ||
      event.amountMinor !== money.getAmountMinor() ||
      event.currency !== money.getCurrency().getValue() ||
      event.providerBillingId !== mapping.providerBillingId ||
      event.providerProductId !== mapping.providerProductId
    ) {
      throw this.reconciliationRequired();
    }
    return { subscription, product, mapping, journal, invoiceId: event.providerInvoiceId };
  }

  private async findOrCreateTransaction(
    context: PaymentUnitOfWorkContext,
    event: RenewalSucceededProviderEvent | RenewalFailedProviderEvent,
    facts: RenewalFacts,
  ): Promise<{ transaction: PaymentTransactionEntity; inserted: boolean }> {
    const invoiceId = facts.invoiceId;
    const existing = await context.paymentTransactions.findByProviderInvoiceId({
      provider: event.provider,
      providerIdentifier: invoiceId,
    });
    if (existing) {
      this.assertTransactionFacts(existing, facts);
      return { transaction: existing, inserted: false };
    }
    const transaction = PaymentTransactionEntity.createPendingRenewal({
      id: this.derivedUuid('renewal-transaction', invoiceId),
      userId: facts.subscription.getUserId(),
      productId: facts.product.id,
      provider: event.provider,
      money: facts.product.getPrice(),
      idempotencyKey: new IdempotencyKey(
        `renewal-invoice-${event.provider.getValue()}-${invoiceId}`,
      ),
    });
    transaction.correlateRenewalInvoice(invoiceId);
    const result = await context.paymentTransactions.insertOrGetByProviderInvoiceId(transaction);
    this.assertTransactionFacts(result.transaction, facts);
    return result;
  }

  private assertTransactionFacts(transaction: PaymentTransactionEntity, facts: RenewalFacts): void {
    const money = transaction.getMoney();
    if (
      transaction.getKind() !== PaymentKind.RENEWAL ||
      transaction.getUserId() !== facts.subscription.getUserId() ||
      transaction.getProductId() !== facts.product.id ||
      money.getAmountMinor() !== facts.product.getPrice().getAmountMinor() ||
      money.getCurrency().getValue() !== facts.product.getPrice().getCurrency().getValue()
    ) {
      throw this.reconciliationRequired();
    }
  }

  private async processingJournal(
    context: PaymentUnitOfWorkContext,
    event:
      | ProviderRenewalCorrelatedEvent
      | RenewalSucceededProviderEvent
      | RenewalFailedProviderEvent,
  ): Promise<ProviderWebhookEventEntity> {
    const journal = await context.providerWebhookEvents.findByProviderEventId({
      provider: event.provider,
      providerEventId: event.providerEventId,
    });
    if (!journal || journal.getStatus() !== ProviderWebhookEventStatus.PROCESSING) {
      throw new DomainException({
        code: DomainExceptionCode.Conflict,
        message: 'Webhook journal claim is not active',
      });
    }
    return journal;
  }

  private paymentSucceededEvent(
    event: RenewalSucceededProviderEvent,
    facts: RenewalFacts,
    transaction: PaymentTransactionEntity,
    subscription: SubscriptionEntity,
  ): PaymentSucceededV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_SUCCEEDED,
      occurredAt: event.occurredAt,
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION,
      aggregateId: transaction.id,
      routingKey: 'payment.succeeded',
      payload: {
        transactionId: transaction.id,
        userId: subscription.getUserId(),
        subscriptionId: subscription.id,
        productId: facts.product.id,
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider: event.provider.getValue(),
        kind: PaymentKind.RENEWAL,
        checkoutPurpose: null,
        subscriptionStatus:
          subscription.getStatus() === SubscriptionStatus.ACTIVE ? 'ACTIVE' : 'QUEUED',
      },
    };
  }

  private paymentFailedEvent(
    event: RenewalFailedProviderEvent,
    facts: RenewalFacts,
    transaction: PaymentTransactionEntity,
  ): PaymentFailedV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_FAILED,
      occurredAt: event.occurredAt,
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION,
      aggregateId: transaction.id,
      routingKey: 'payment.failed',
      payload: {
        transactionId: transaction.id,
        userId: facts.subscription.getUserId(),
        productId: facts.product.id,
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider: event.provider.getValue(),
        kind: PaymentKind.RENEWAL,
        checkoutPurpose: null,
        failureCode: event.failureCode,
      },
    };
  }

  private subscriptionActivatedEvent(
    event: RenewalSucceededProviderEvent,
    subscription: SubscriptionEntity,
  ): SubscriptionActivatedV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED,
      occurredAt: event.occurredAt,
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
      aggregateId: subscription.id,
      routingKey: SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
      payload: {
        userId: subscription.getUserId(),
        subscriptionId: subscription.id,
        subscriptionSequence: subscription.getSequence(),
        startsAt: subscription.getStartsAt().toISOString(),
        endsAt: subscription.getEndsAt().toISOString(),
        productId: subscription.getProductId(),
      },
    };
  }

  private processedAt(journal: ProviderWebhookEventEntity): Date {
    return new Date(Math.max(Date.now(), journal.getReceivedAt().getTime()));
  }

  private parseOccurredAt(value: string): Date {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
      throw this.reconciliationRequired();
    }
    return parsed;
  }

  private derivedUuid(namespace: string, providerInvoiceId: string): string {
    const hex = createHash('sha256').update(`${namespace}:${providerInvoiceId}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  private correlationNotReady(): DomainException {
    return this.retryable(
      'Provider renewal correlation is not ready',
      PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_RENEWAL_CORRELATION_NOT_READY,
    );
  }

  private reconciliationRequired(): DomainException {
    return this.retryable(
      'Payment reconciliation is required',
      PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_RECONCILIATION_REQUIRED,
    );
  }

  private retryable(message: string, reason: string): DomainException {
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message,
      extensions: [{ field: 'reason', message: reason }],
    });
  }
}

type RenewalFacts = {
  subscription: SubscriptionEntity;
  product: ProductEntity;
  mapping: ProductProviderMapping;
  journal: ProviderWebhookEventEntity;
  invoiceId: string;
};
