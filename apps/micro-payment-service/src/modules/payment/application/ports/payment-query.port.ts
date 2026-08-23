import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { PaymentKind } from '../../domain/enums/payment-kind.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';

export type PageRequest = Readonly<{
  page: number;
  pageSize: number;
}>;

export type PageResult<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageSize: number;
  totalCount: number;
  pagesCount: number;
}>;

export type SubscriptionProjection = Readonly<{
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  startsAt: Date;
  endsAt: Date;
  nextBillingAt: Date | null;
  autoRenew: boolean;
  provider: string;
  status: SubscriptionStatus;
  sequence: number;
}>;

export type SubscriptionsResult = Readonly<{
  current: SubscriptionProjection | null;
  queued: readonly SubscriptionProjection[];
}>;

export type PaymentHistoryItem = Readonly<{
  transactionId: string;
  createdAt: Date;
  paidAt: Date | null;
  amountMinor: number;
  currency: string;
  productId: string;
  productCode: string;
  productName: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
  provider: string;
  kind: PaymentKind;
  status: PaymentTransactionStatus;
  checkoutPurpose: CheckoutPurpose | null;
}>;

export type PaymentHistoryQuery = Readonly<{
  userId: string;
  page: PageRequest;
}>;

export type CheckoutStatusProjection = Readonly<{
  checkoutSessionId: string;
  status: CheckoutStatus;
  resultingSubscriptionId: string | null;
  completedAt: Date | null;
}>;

export type OwnedCheckoutStatusQuery = Readonly<{
  userId: string;
  checkoutSessionId: string;
}>;

export abstract class ISubscriptionQueryPort {
  abstract getSubscriptions(userId: string): Promise<SubscriptionsResult>;
}

export abstract class IPaymentHistoryQueryPort {
  abstract getPaymentHistory(query: PaymentHistoryQuery): Promise<PageResult<PaymentHistoryItem>>;
}

export abstract class ICheckoutStatusQueryPort {
  abstract findOwnedCheckoutStatus(
    query: OwnedCheckoutStatusQuery,
  ): Promise<CheckoutStatusProjection | null>;
}
