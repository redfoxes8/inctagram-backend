import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

export const PAYMENT_PROVIDER_ERROR_REASON = {
  PROVIDER_NOT_SUPPORTED: 'PROVIDER_NOT_SUPPORTED',
  INVALID_WEBHOOK_SIGNATURE: 'INVALID_WEBHOOK_SIGNATURE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  PROVIDER_OPERATION_NOT_READY: 'PROVIDER_OPERATION_NOT_READY',
  PAYMENT_WEBHOOK_PROCESSING_NOT_READY: 'PAYMENT_WEBHOOK_PROCESSING_NOT_READY',
  PAYMENT_WEBHOOK_HANDLER_NOT_READY: 'PAYMENT_WEBHOOK_HANDLER_NOT_READY',
  PAYMENT_WEBHOOK_ALREADY_PROCESSING: 'PAYMENT_WEBHOOK_ALREADY_PROCESSING',
  PROVIDER_RENEWAL_CORRELATION_NOT_READY: 'PROVIDER_RENEWAL_CORRELATION_NOT_READY',
  PAYMENT_RECONCILIATION_REQUIRED: 'PAYMENT_RECONCILIATION_REQUIRED',
  PROVIDER_SUBSCRIPTION_NOT_RESTORABLE: 'PROVIDER_SUBSCRIPTION_NOT_RESTORABLE',
} as const;

export type PaymentProviderErrorReason =
  (typeof PAYMENT_PROVIDER_ERROR_REASON)[keyof typeof PAYMENT_PROVIDER_ERROR_REASON];

/** Inputs are validated by Application before crossing the provider boundary. */
type CheckoutCommand = Readonly<{
  localCheckoutSessionId: string;
  userId: string;
  productId: string;
  provider: ProviderCode;
  providerCustomerId: string | null;
  providerProductId: string | null;
  providerBillingId: string;
  amountMinor: number;
  currency: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  successUrl: string;
  cancelUrl: string;
  providerIdempotencyKey: string;
  providerCustomerIdempotencyKey: string;
}>;

export type CreateInitialSubscriptionCheckoutCommand = CheckoutCommand &
  Readonly<{
    autoRenewConsent: true;
  }>;

export type CreateAdditionalSubscriptionCheckoutCommand = CheckoutCommand &
  Readonly<{
    currentProviderSubscriptionId: string;
    currentProviderRenewalId: string | null;
    currentPaidEndsAt: string;
    finalLocalEndsAt: string;
  }>;

export type CheckoutCreationResult = Readonly<{
  providerCheckoutId: string;
  checkoutUrl: string;
  providerCustomerId: string;
  expiresAt: string | null;
}>;

export type RetrieveProviderCheckoutCommand = Readonly<{
  provider: ProviderCode;
  checkoutPurpose: CheckoutPurpose;
  localCheckoutSessionId: string;
  userId: string;
  productId: string;
  providerCheckoutId: string;
  expectedProviderCustomerId: string;
  expectedProviderProductId: string | null;
  expectedProviderBillingId: string;
  amountMinor: number;
  currency: string;
}>;

type ProviderSubscriptionCorrelation = Readonly<{
  userId: string;
  subscriptionId: string;
  provider: ProviderCode;
  providerCustomerId: string;
  providerSubscriptionId: string | null;
  providerRenewalId: string | null;
}>;

export type DisableProviderAutoRenewCommand = ProviderSubscriptionCorrelation &
  Readonly<{
    finalLocalEndsAt: string;
    providerIdempotencyKey: string;
  }>;

export type EnableProviderAutoRenewCommand = ProviderSubscriptionCorrelation &
  Readonly<{
    providerBillingId: string;
    finalLocalEndsAt: string;
    providerIdempotencyKey: string;
  }>;

export type SynchronizeProviderNextBillingCommand = Readonly<{
  userId: string;
  subscriptionId: string;
  provider: ProviderCode;
  providerCustomerId: string;
  currentProviderSubscriptionId: string | null;
  currentProviderRenewalId: string | null;
  providerBillingId: string;
  confirmedProviderTransactionId: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  finalLocalEndsAt: string;
  providerIdempotencyKey: string;
}>;

export type GetProviderSubscriptionStateCommand = ProviderSubscriptionCorrelation;

export type ProviderSubscriptionState = Readonly<{
  provider: ProviderCode;
  providerCustomerId: string;
  providerSubscriptionId: string | null;
  providerRenewalId: string | null;
  providerStatus: string;
  autoRenewEnabled: boolean;
  nextBillingAt: string | null;
}>;

export type ProviderSignatureHeader = Readonly<{
  name: string;
  value: string;
}>;

export type ProviderSignatureHeaders = readonly ProviderSignatureHeader[];

export type VerifyProviderWebhookCommand = Readonly<{
  provider: ProviderCode;
  rawBody: Readonly<Uint8Array>;
  signatureHeaders: ProviderSignatureHeaders;
  receivedAt: string;
}>;

type NormalizedProviderEventMetadata = Readonly<{
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
}>;

type NormalizedMonetaryFacts = Readonly<{
  amountMinor: number;
  currency: string;
}>;

type NormalizedRenewalFacts = NormalizedMonetaryFacts &
  Readonly<{
    billingReason: 'subscription_cycle' | 'subscription_create';
    providerProductId: string | null;
    providerBillingId: string | null;
    paymentEvidenceValid: boolean;
    supportedInvoiceShape: boolean;
  }>;

type NormalizedCheckoutCorrelation = Readonly<{
  checkoutPurpose: CheckoutPurpose;
  productId: string | null;
}>;

export type CheckoutPaymentSucceededProviderEvent = NormalizedProviderEventMetadata &
  NormalizedMonetaryFacts &
  NormalizedCheckoutCorrelation &
  Readonly<{
    kind: 'CHECKOUT_PAYMENT_SUCCEEDED';
  }>;

export type CheckoutPaymentFailedProviderEvent = NormalizedProviderEventMetadata &
  NormalizedMonetaryFacts &
  NormalizedCheckoutCorrelation &
  Readonly<{
    kind: 'CHECKOUT_PAYMENT_FAILED';
    failureCode: string;
  }>;

export type RenewalSucceededProviderEvent = NormalizedProviderEventMetadata &
  NormalizedRenewalFacts &
  Readonly<{
    kind: 'RENEWAL_SUCCEEDED';
    checkoutPurpose: null;
  }>;

export type RenewalFailedProviderEvent = NormalizedProviderEventMetadata &
  NormalizedRenewalFacts &
  Readonly<{
    kind: 'RENEWAL_FAILED';
    checkoutPurpose: null;
    failureCode: string;
  }>;

export type ProviderRenewalCorrelatedEvent = NormalizedProviderEventMetadata &
  Readonly<{
    kind: 'PROVIDER_RENEWAL_CORRELATED';
    localSubscriptionId: string | null;
  }>;

export type ProviderSubscriptionCanceledProviderEvent = NormalizedProviderEventMetadata &
  Readonly<{
    kind: 'PROVIDER_SUBSCRIPTION_CANCELED';
    providerStatus: string;
    cancellationEffectiveAt: string | null;
  }>;

export type IgnoredProviderEvent = NormalizedProviderEventMetadata &
  Readonly<{
    kind: 'IGNORED';
    reasonCode: string;
  }>;

export type NormalizedProviderEvent =
  | CheckoutPaymentSucceededProviderEvent
  | CheckoutPaymentFailedProviderEvent
  | RenewalSucceededProviderEvent
  | RenewalFailedProviderEvent
  | ProviderRenewalCorrelatedEvent
  | ProviderSubscriptionCanceledProviderEvent
  | IgnoredProviderEvent;
