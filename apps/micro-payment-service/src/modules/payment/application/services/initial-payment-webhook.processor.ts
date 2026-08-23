import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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
import { ProviderCustomer } from '../../domain/interfaces/provider-customer.repository.interface';
import { BillingPeriod } from '../../domain/value-objects/billing-period.value-object';
import {
  CheckoutPaymentFailedProviderEvent,
  CheckoutPaymentSucceededProviderEvent,
  NormalizedProviderEvent,
  PAYMENT_PROVIDER_ERROR_REASON,
} from '../ports/payment-provider.types';
import { IPaymentUnitOfWork, PaymentUnitOfWorkContext } from '../ports/payment-unit-of-work.port';
import { PaymentWebhookProcessor } from '../ports/payment-webhook-processor.port';
import { AdditionalPaymentWebhookProcessor } from './additional-payment-webhook.processor';

@Injectable()
export class InitialPaymentWebhookProcessor implements PaymentWebhookProcessor {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly additionalProcessor: AdditionalPaymentWebhookProcessor,
  ) {}

  public process(event: NormalizedProviderEvent): Promise<void> {
    if (
      event.kind === 'CHECKOUT_PAYMENT_SUCCEEDED' &&
      event.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION
    ) {
      return this.processSuccess(event);
    }
    if (
      event.kind === 'CHECKOUT_PAYMENT_FAILED' &&
      event.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION
    ) {
      return this.processFailure(event);
    }
    if (
      event.kind === 'CHECKOUT_PAYMENT_SUCCEEDED' &&
      event.checkoutPurpose === CheckoutPurpose.ADDITIONAL_SUBSCRIPTION
    ) {
      return this.additionalProcessor.processSuccess(event);
    }
    if (
      event.kind === 'CHECKOUT_PAYMENT_FAILED' &&
      event.checkoutPurpose === CheckoutPurpose.ADDITIONAL_SUBSCRIPTION
    ) {
      return this.additionalProcessor.processFailure(event);
    }
    return Promise.reject(this.notReady());
  }

  private async processSuccess(event: CheckoutPaymentSucceededProviderEvent): Promise<void> {
    this.assertRequiredSuccessFacts(event);
    await this.unitOfWork.execute(async (context) => {
      const facts = await this.loadInitialFacts(context, event);
      this.assertCommonFacts({ event, ...facts });
      this.assertSuccessState({
        checkoutStatus: facts.checkout.getStatus(),
        transactionStatus: facts.transaction.getStatus(),
      });
      const queue = await context.subscriptions.findOrderedUnfinishedByUserId(
        facts.checkout.getUserId(),
      );
      if (queue.length !== 0) throw this.conflict('Paid subscription queue is not empty');

      const paidAt = this.parseOccurredAt(event.occurredAt);
      const period = new BillingPeriod({
        startsAt: paidAt,
        billingInterval: facts.product.getBillingInterval(),
        billingIntervalCount: facts.product.getBillingIntervalCount(),
      });
      const subscription = SubscriptionEntity.createPaidActive({
        id: randomUUID(),
        userId: facts.checkout.getUserId(),
        productId: facts.checkout.getProductId(),
        provider: event.provider,
        providerSubscriptionId: event.providerSubscriptionId,
        providerScheduleId: event.providerRenewalId,
        providerStatus: null,
        sequence: 1,
        period,
      });

      facts.transaction.succeed({
        subscriptionId: subscription.id,
        providerTransactionId: event.providerTransactionId,
        providerInvoiceId: event.providerInvoiceId,
        paidAt,
      });
      facts.checkout.complete(paidAt);
      facts.journal.markProcessed(this.processedAt(facts.journal.getReceivedAt()));

      await context.subscriptions.insert(subscription);
      await context.paymentTransactions.save(facts.transaction);
      await context.checkoutSessions.save(facts.checkout);
      await context.providerWebhookEvents.save(facts.journal);
      await context.outbox.write(this.paymentSucceededEvent(event, facts, subscription));
      await context.outbox.write(this.subscriptionActivatedEvent(event, facts, subscription));
    });
  }

  private async processFailure(event: CheckoutPaymentFailedProviderEvent): Promise<void> {
    await this.unitOfWork.execute(async (context) => {
      const facts = await this.loadInitialFacts(context, event);
      this.assertCommonFacts({ event, ...facts });
      if (
        facts.checkout.getStatus() !== CheckoutStatus.CREATED ||
        (facts.transaction.getStatus() !== PaymentTransactionStatus.PENDING &&
          facts.transaction.getStatus() !== PaymentTransactionStatus.PROCESSING)
      ) {
        throw this.conflict('Initial payment failure transition is not allowed');
      }

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

  private async loadInitialFacts(
    context: PaymentUnitOfWorkContext,
    event: CheckoutPaymentSucceededProviderEvent | CheckoutPaymentFailedProviderEvent,
  ): Promise<InitialPaymentFacts> {
    if (event.providerCheckoutId === null)
      throw this.badRequest('Webhook checkout correlation is missing');
    const initialCheckout = await context.checkoutSessions.findByProviderCheckoutId({
      provider: event.provider,
      providerCheckoutId: event.providerCheckoutId,
    });
    if (!initialCheckout) throw this.conflict('Webhook checkout correlation is not recognized');
    await context.lockUser(initialCheckout.getUserId());
    const checkout = await context.checkoutSessions.findById(initialCheckout.id);
    if (!checkout) throw this.conflict('Webhook checkout correlation is not recognized');
    const transactions = await context.paymentTransactions.findByCheckoutSessionId(checkout.id);
    if (transactions.length !== 1)
      throw this.conflict('Checkout payment correlation is inconsistent');
    const product = await context.products.findById(checkout.getProductId());
    if (!product) throw this.conflict('Checkout product correlation is not recognized');
    const providerCustomer = await context.providerCustomers.findByUserAndProvider({
      userId: checkout.getUserId(),
      provider: event.provider,
    });
    if (!providerCustomer) throw this.conflict('Provider customer correlation is not recognized');
    const journal = await context.providerWebhookEvents.findByProviderEventId({
      provider: event.provider,
      providerEventId: event.providerEventId,
    });
    if (!journal || journal.getStatus() !== ProviderWebhookEventStatus.PROCESSING) {
      throw this.conflict('Webhook journal claim is not active');
    }
    return { checkout, transaction: transactions[0], product, providerCustomer, journal };
  }

  private assertCommonFacts(input: {
    event: CheckoutPaymentSucceededProviderEvent | CheckoutPaymentFailedProviderEvent;
    checkout: InitialPaymentFacts['checkout'];
    transaction: InitialPaymentFacts['transaction'];
    product: InitialPaymentFacts['product'];
    providerCustomer: InitialPaymentFacts['providerCustomer'];
  }): void {
    const { event, checkout, transaction, product, providerCustomer } = input;
    const money = transaction.getMoney();
    if (
      checkout.getPurpose() !== CheckoutPurpose.INITIAL_SUBSCRIPTION ||
      transaction.getKind() !== PaymentKind.PURCHASE ||
      transaction.getCheckoutSessionId() !== checkout.id ||
      transaction.getUserId() !== checkout.getUserId() ||
      transaction.getProductId() !== checkout.getProductId() ||
      transaction.getProvider().getValue() !== event.provider.getValue() ||
      checkout.getProvider().getValue() !== event.provider.getValue() ||
      product.id !== checkout.getProductId() ||
      event.localCheckoutSessionId !== checkout.id ||
      (event.productId !== null && event.productId !== product.id) ||
      money.getAmountMinor() !== event.amountMinor ||
      money.getCurrency().getValue() !== event.currency ||
      (event.providerCustomerId !== null &&
        event.providerCustomerId !== providerCustomer.providerCustomerId)
    ) {
      throw this.conflict('Verified payment correlation facts are inconsistent');
    }
  }

  private assertRequiredSuccessFacts(event: CheckoutPaymentSucceededProviderEvent): void {
    if (
      event.providerCheckoutId === null ||
      event.localCheckoutSessionId === null ||
      event.providerSubscriptionId === null ||
      (event.providerTransactionId === null && event.providerInvoiceId === null)
    ) {
      throw this.badRequest('Verified payment is missing required correlation facts');
    }
    this.parseOccurredAt(event.occurredAt);
  }

  private assertSuccessState(input: {
    checkoutStatus: CheckoutStatus;
    transactionStatus: PaymentTransactionStatus;
  }): void {
    if (
      input.checkoutStatus !== CheckoutStatus.CREATED ||
      (input.transactionStatus !== PaymentTransactionStatus.PENDING &&
        input.transactionStatus !== PaymentTransactionStatus.PROCESSING)
    ) {
      throw this.conflict('Initial payment success transition is not allowed');
    }
  }

  private paymentSucceededEvent(
    event: CheckoutPaymentSucceededProviderEvent,
    facts: InitialPaymentFacts,
    subscription: SubscriptionEntity,
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
        subscriptionId: subscription.id,
        productId: facts.product.id,
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider: event.provider.getValue(),
        kind: PaymentKind.PURCHASE,
        checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    };
  }

  private subscriptionActivatedEvent(
    event: CheckoutPaymentSucceededProviderEvent,
    facts: InitialPaymentFacts,
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
        userId: facts.checkout.getUserId(),
        subscriptionId: subscription.id,
        subscriptionSequence: subscription.getSequence(),
        startsAt: subscription.getStartsAt().toISOString(),
        endsAt: subscription.getEndsAt().toISOString(),
        productId: facts.product.id,
      },
    };
  }

  private paymentFailedEvent(
    event: CheckoutPaymentFailedProviderEvent,
    facts: InitialPaymentFacts,
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
        checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
        failureCode: event.failureCode,
      },
    };
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

  private notReady(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment webhook handler is not available yet',
      extensions: [
        {
          field: 'reason',
          message: PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_WEBHOOK_HANDLER_NOT_READY,
        },
      ],
    });
  }

  private badRequest(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }

  private conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}

type InitialPaymentFacts = {
  checkout: CheckoutSessionEntity;
  transaction: PaymentTransactionEntity;
  product: ProductEntity;
  providerCustomer: ProviderCustomer;
  journal: ProviderWebhookEventEntity;
};
