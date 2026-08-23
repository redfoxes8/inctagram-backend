import { NormalizedProviderEvent } from '../ports/payment-provider.types';
import { JsonObject } from '../../domain/types/json-value.type';

export function serializeNormalizedWebhookPayload(event: NormalizedProviderEvent): JsonObject {
  const common: JsonObject = {
    kind: event.kind,
    occurredAt: event.occurredAt,
    providerCustomerId: event.providerCustomerId,
    providerCheckoutId: event.providerCheckoutId,
    localCheckoutSessionId: event.localCheckoutSessionId,
    providerSubscriptionId: event.providerSubscriptionId,
    providerRenewalId: event.providerRenewalId,
    providerTransactionId: event.providerTransactionId,
    providerInvoiceId: event.providerInvoiceId,
  };

  switch (event.kind) {
    case 'CHECKOUT_PAYMENT_SUCCEEDED':
      return {
        ...common,
        amountMinor: event.amountMinor,
        currency: event.currency,
        checkoutPurpose: event.checkoutPurpose,
        productId: event.productId,
      };
    case 'CHECKOUT_PAYMENT_FAILED':
      return {
        ...common,
        amountMinor: event.amountMinor,
        currency: event.currency,
        checkoutPurpose: event.checkoutPurpose,
        productId: event.productId,
        failureCode: event.failureCode,
      };
    case 'RENEWAL_SUCCEEDED':
      return {
        ...common,
        amountMinor: event.amountMinor,
        currency: event.currency,
        billingReason: event.billingReason,
        providerProductId: event.providerProductId,
        providerBillingId: event.providerBillingId,
        paymentEvidenceValid: event.paymentEvidenceValid,
        supportedInvoiceShape: event.supportedInvoiceShape,
      };
    case 'RENEWAL_FAILED':
      return {
        ...common,
        amountMinor: event.amountMinor,
        currency: event.currency,
        billingReason: event.billingReason,
        providerProductId: event.providerProductId,
        providerBillingId: event.providerBillingId,
        paymentEvidenceValid: event.paymentEvidenceValid,
        supportedInvoiceShape: event.supportedInvoiceShape,
        failureCode: event.failureCode,
      };
    case 'PROVIDER_RENEWAL_CORRELATED':
      return { ...common, localSubscriptionId: event.localSubscriptionId };
    case 'PROVIDER_SUBSCRIPTION_CANCELED':
      return {
        ...common,
        providerStatus: event.providerStatus,
        cancellationEffectiveAt: event.cancellationEffectiveAt,
      };
    case 'IGNORED':
      return { ...common, reasonCode: event.reasonCode };
  }
}
