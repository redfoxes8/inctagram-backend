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
      case 'invoice.payment_succeeded':
        return this.invoiceResult(event.data.object, common, true);
      case 'invoice.payment_failed':
        return this.invoiceResult(event.data.object, common, false);
      case 'invoice.paid':
        return { ...common, kind: 'IGNORED', reasonCode: 'INVOICE_PAID_NOT_AUTHORITATIVE' };
      case 'customer.subscription.created':
        return this.subscriptionCreated(event.data.object, common);
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
    if (
      invoice.billing_reason !== 'subscription_cycle' &&
      invoice.billing_reason !== 'subscription_create'
    ) {
      return { ...common, kind: 'IGNORED', reasonCode: 'INITIAL_OR_NON_RECURRING_INVOICE' };
    }
    const amountMinor = succeeded ? invoice.amount_paid : invoice.amount_due;
    if (!this.validAmount(amountMinor)) {
      return { ...common, kind: 'IGNORED', reasonCode: 'INVOICE_AMOUNT_NOT_ACTIONABLE' };
    }
    const subscriptionDetails = invoice.parent?.subscription_details;
    if (
      invoice.billing_reason === 'subscription_create' &&
      subscriptionDetails?.metadata?.localCheckoutSessionId
    ) {
      return { ...common, kind: 'IGNORED', reasonCode: 'INITIAL_CHECKOUT_INVOICE' };
    }
    const lineFacts = this.invoiceLineFacts(invoice);
    const monetaryFacts = { amountMinor, currency: invoice.currency.toUpperCase() };
    const correlation = {
      ...common,
      providerCustomerId: this.id(invoice.customer),
      providerSubscriptionId: this.id(subscriptionDetails?.subscription),
      providerTransactionId: this.invoicePaymentIntentId(invoice),
      providerInvoiceId: invoice.id,
      localCheckoutSessionId: subscriptionDetails?.metadata?.localCheckoutSessionId ?? null,
      checkoutPurpose: null,
      billingReason: invoice.billing_reason,
      providerProductId: lineFacts.providerProductId,
      providerBillingId: lineFacts.providerBillingId,
      paymentEvidenceValid:
        !succeeded || (invoice.status === 'paid' && invoice.amount_paid === amountMinor),
      supportedInvoiceShape: lineFacts.supported,
      ...monetaryFacts,
    };
    return succeeded
      ? { ...correlation, kind: 'RENEWAL_SUCCEEDED' }
      : { ...correlation, kind: 'RENEWAL_FAILED', failureCode: 'RECURRING_PAYMENT_FAILED' };
  }

  private static subscriptionCreated(
    subscription: Stripe.Subscription,
    common: CommonNormalizedFacts,
  ): NormalizedProviderEvent {
    const providerRenewalId = this.id(subscription.schedule);
    if (!providerRenewalId) {
      return { ...common, kind: 'IGNORED', reasonCode: 'SUBSCRIPTION_WITHOUT_SCHEDULE' };
    }
    return {
      ...common,
      kind: 'PROVIDER_RENEWAL_CORRELATED',
      providerCustomerId: this.id(subscription.customer),
      providerSubscriptionId: subscription.id,
      providerRenewalId,
      localSubscriptionId: subscription.metadata.localSubscriptionId ?? null,
    };
  }

  private static invoiceLineFacts(invoice: Stripe.Invoice): {
    providerProductId: string | null;
    providerBillingId: string | null;
    supported: boolean;
  } {
    const lines = invoice.lines.data;
    const line = lines.length === 1 && !invoice.lines.has_more ? lines[0] : null;
    const pricing = line?.pricing;
    const priceDetails = pricing?.type === 'price_details' ? pricing.price_details : undefined;
    const providerBillingId = priceDetails ? this.id(priceDetails.price) : null;
    const providerProductId = priceDetails?.product ?? null;
    const isProration =
      line?.parent?.type === 'subscription_item_details'
        ? line.parent.subscription_item_details?.proration === true
        : line?.parent?.type === 'invoice_item_details'
          ? line.parent.invoice_item_details?.proration === true
          : false;
    return {
      providerProductId,
      providerBillingId,
      supported:
        line !== null &&
        line.quantity === 1 &&
        !isProration &&
        line.discounts.length === 0 &&
        invoice.discounts.length === 0 &&
        (invoice.total_taxes?.length ?? 0) === 0 &&
        providerBillingId !== null &&
        providerProductId !== null,
    };
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
