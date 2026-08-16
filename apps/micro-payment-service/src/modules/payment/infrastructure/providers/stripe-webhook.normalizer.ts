import Stripe from 'stripe';

import { NormalizedProviderEvent } from '../../application/ports/payment-provider.types';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

type CommonNormalizedFacts = {
  provider: ProviderCode;
  providerEventId: string;
  providerEventType: string;
  occurredAt: string;
  providerCustomerId: string | null;
  providerCheckoutId: string | null;
  localCheckoutSessionId: string | null;
  providerSubscriptionId: string | null;
  providerRenewalId: string | null;
  providerTransactionId: string | null;
  providerInvoiceId: string | null;
};

export class StripeWebhookNormalizer {
  public static normalize(event: Stripe.Event, provider: ProviderCode): NormalizedProviderEvent {
    const metadata = this.metadata(event);
    const common = {
      provider,
      providerEventId: event.id,
      providerEventType: event.type,
      occurredAt: new Date(event.created * 1_000).toISOString(),
      providerCustomerId: null,
      providerCheckoutId: null,
      localCheckoutSessionId: metadata?.localCheckoutSessionId ?? null,
      providerSubscriptionId: null,
      providerRenewalId: null,
      providerTransactionId: null,
      providerInvoiceId: null,
    };
    switch (event.type) {
      case 'checkout.session.completed':
        if (event.data.object.payment_status !== 'paid') {
          return { ...common, kind: 'IGNORED', reasonCode: 'CHECKOUT_NOT_PAID' };
        }
        return this.checkoutSucceeded(event.data.object, common);
      case 'checkout.session.async_payment_succeeded':
        return this.checkoutSucceeded(event.data.object, common);
      case 'checkout.session.async_payment_failed':
        return this.checkoutFailed(event.data.object, common);
      case 'invoice.paid':
        return this.invoiceResult(event.data.object, common, true);
      case 'invoice.payment_failed':
        return this.invoiceResult(event.data.object, common, false);
      case 'customer.subscription.deleted':
        return {
          ...common,
          kind: 'PROVIDER_SUBSCRIPTION_CANCELED',
          providerCustomerId: this.id(event.data.object.customer),
          providerSubscriptionId: event.data.object.id,
          providerRenewalId: this.id(event.data.object.schedule),
          providerStatus: event.data.object.status,
          cancellationEffectiveAt: event.data.object.ended_at
            ? new Date(event.data.object.ended_at * 1_000).toISOString()
            : null,
        };
      default:
        return { ...common, kind: 'IGNORED', reasonCode: 'EVENT_TYPE_NOT_USED' };
    }
  }

  private static checkoutSucceeded(
    session: Stripe.Checkout.Session,
    common: CommonNormalizedFacts,
  ): NormalizedProviderEvent {
    const facts = this.checkoutFacts(session);
    if (!facts) return { ...common, kind: 'IGNORED', reasonCode: 'CHECKOUT_FACTS_INCOMPLETE' };
    return { ...common, ...facts, kind: 'CHECKOUT_PAYMENT_SUCCEEDED' };
  }

  private static checkoutFailed(
    session: Stripe.Checkout.Session,
    common: CommonNormalizedFacts,
  ): NormalizedProviderEvent {
    const facts = this.checkoutFacts(session);
    if (!facts) return { ...common, kind: 'IGNORED', reasonCode: 'CHECKOUT_FACTS_INCOMPLETE' };
    return {
      ...common,
      ...facts,
      kind: 'CHECKOUT_PAYMENT_FAILED',
      failureCode: 'CHECKOUT_ASYNC_PAYMENT_FAILED',
    };
  }

  private static checkoutFacts(session: Stripe.Checkout.Session): {
    providerCustomerId: string | null;
    providerCheckoutId: string;
    providerSubscriptionId: string | null;
    providerTransactionId: string | null;
    providerInvoiceId: string | null;
    localCheckoutSessionId: string | null;
    amountMinor: number;
    currency: string;
    checkoutPurpose: CheckoutPurpose;
    productId: string | null;
  } | null {
    const purpose = this.checkoutPurpose(session.metadata?.purpose);
    const currency = session.currency?.toUpperCase();
    if (!purpose || !currency || !this.validAmount(session.amount_total)) return null;
    return {
      providerCustomerId: this.id(session.customer),
      providerCheckoutId: session.id,
      providerSubscriptionId: this.id(session.subscription),
      providerTransactionId: this.id(session.payment_intent),
      providerInvoiceId: this.id(session.invoice),
      localCheckoutSessionId: session.metadata?.localCheckoutSessionId ?? null,
      amountMinor: session.amount_total,
      currency,
      checkoutPurpose: purpose,
      productId: session.metadata?.productId ?? null,
    };
  }

  private static invoiceResult(
    invoice: Stripe.Invoice,
    common: CommonNormalizedFacts,
    succeeded: boolean,
  ): NormalizedProviderEvent {
    if (invoice.billing_reason !== 'subscription_cycle') {
      return { ...common, kind: 'IGNORED', reasonCode: 'INITIAL_OR_NON_RECURRING_INVOICE' };
    }
    const amountMinor = succeeded ? invoice.amount_paid : invoice.amount_due;
    if (!this.validAmount(amountMinor)) {
      return { ...common, kind: 'IGNORED', reasonCode: 'INVOICE_AMOUNT_NOT_ACTIONABLE' };
    }
    const subscriptionDetails = invoice.parent?.subscription_details;
    const monetaryFacts = { amountMinor, currency: invoice.currency.toUpperCase() };
    const correlation = {
      ...common,
      providerCustomerId: this.id(invoice.customer),
      providerSubscriptionId: this.id(subscriptionDetails?.subscription),
      providerTransactionId: this.invoicePaymentIntentId(invoice),
      providerInvoiceId: invoice.id,
      localCheckoutSessionId: subscriptionDetails?.metadata?.localCheckoutSessionId ?? null,
      checkoutPurpose: null,
      ...monetaryFacts,
    };
    return succeeded
      ? { ...correlation, kind: 'RENEWAL_SUCCEEDED' }
      : { ...correlation, kind: 'RENEWAL_FAILED', failureCode: 'RECURRING_PAYMENT_FAILED' };
  }

  private static invoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
    const payment = invoice.payments?.data.find(
      (candidate) => candidate.payment.type === 'payment_intent',
    );
    return payment ? this.id(payment.payment.payment_intent) : null;
  }

  private static metadata(event: Stripe.Event): Stripe.Metadata | null {
    const object = event.data.object;
    return 'metadata' in object ? (object.metadata ?? null) : null;
  }

  private static id(value: string | { id: string } | null | undefined): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  private static validAmount(value: number | null): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  private static checkoutPurpose(value: string | undefined): CheckoutPurpose | null {
    if (value === CheckoutPurpose.INITIAL_SUBSCRIPTION) return CheckoutPurpose.INITIAL_SUBSCRIPTION;
    if (value === CheckoutPurpose.ADDITIONAL_SUBSCRIPTION) {
      return CheckoutPurpose.ADDITIONAL_SUBSCRIPTION;
    }
    return null;
  }
}
