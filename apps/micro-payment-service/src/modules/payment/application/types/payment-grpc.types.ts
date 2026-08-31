import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { PaymentKind } from '../../domain/enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';

export type SignatureHeader = Readonly<{
  name: string;
  value: string;
}>;

export type CreateCheckoutSessionInput = Readonly<{
  userId: string;
  productId: string;
  provider: string;
  autoRenewConsent: true;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}>;

export type CreateCheckoutSessionResult = Readonly<{
  checkoutSessionId: string;
  checkoutUrl: string;
  expiresAt: Date | null;
}>;

export type ProcessWebhookEventInput = Readonly<{
  provider: string;
  rawBody: Uint8Array;
  signatureHeaders: readonly SignatureHeader[];
  receivedAt: Date;
}>;

export type ProcessWebhookEventResult = Readonly<{
  accepted: boolean;
  duplicate: boolean;
  status: 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
}>;

export type ProductSummaryResult = Readonly<{
  id: string;
  code: string;
  name: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
}>;

export type AvailableProductResult = Readonly<{
  productId: string;
  name: string;
  amountMinor: number;
  currency: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
}>;

export type GetAvailableProductsResult = Readonly<{
  items: readonly AvailableProductResult[];
}>;

export type SubscriptionResult = Readonly<{
  id: string;
  sequence: number;
  product: ProductSummaryResult;
  startsAt: Date;
  endsAt: Date;
  nextBillingAt: Date | null;
  autoRenew: boolean;
  provider: string;
  status: SubscriptionStatus;
}>;

export type GetSubscriptionsResult = Readonly<{
  current: SubscriptionResult | null;
  queued: readonly SubscriptionResult[];
}>;

import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';

export type PaymentHistoryResultItem = Readonly<{
  transactionId: string;
  productName: string;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
  productId: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  provider: string;
  kind: PaymentKind;
  status: PaymentTransactionStatus;
  amountMinor: number;
  checkoutPurpose: CheckoutPurpose | null;
  subscriptionId: string | null;
  subscriptionEndsAt: Date | null;
}>;

export type GetPaymentHistoryResult = Readonly<{
  items: readonly PaymentHistoryResultItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  pagesCount: number;
}>;

export type ToggleAutoRenewInput = Readonly<{
  userId: string;
  subscriptionId: string;
  enabled: boolean;
}>;

export type ToggleAutoRenewResult = Readonly<{
  success: boolean;
  autoRenew: boolean;
  nextBillingAt: Date | null;
  providerStatus: string | null;
}>;

export type GetCheckoutSessionStatusResult = Readonly<{
  status: CheckoutStatus;
  subscriptionId: string | null;
}>;
