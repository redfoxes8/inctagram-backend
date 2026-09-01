export const PAYMENT_INTEGRATION_EVENT_VERSION = 1 as const;

export const PAYMENT_INTEGRATION_AGGREGATE_TYPE = {
  PAYMENT_TRANSACTION: 'PAYMENT_TRANSACTION',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;

export const PAYMENT_INTEGRATION_EVENT_TYPE = {
  PAYMENT_SUCCEEDED: 'payment.succeeded.v1',
  PAYMENT_FAILED: 'payment.failed.v1',
  QUEUED_SUBSCRIPTION_PURCHASED: 'subscription.queued.v1',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated.v1',
  SUBSCRIPTION_EXPIRED: 'subscription.expired.v1',
  SUBSCRIPTION_AUTO_RENEW_CHANGED: 'subscription.auto-renew.changed.v1',
} as const;

export const SUBSCRIPTION_QUEUED_ROUTING_KEY = 'subscription.queued' as const;
export const SUBSCRIPTION_ACTIVATED_ROUTING_KEY = 'subscription.activated' as const;
export const SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY =
  'subscription.auto-renew.changed' as const;

export type PaymentEventKind = 'PURCHASE' | 'RENEWAL';
export type PaymentCheckoutPurpose = 'INITIAL_SUBSCRIPTION' | 'ADDITIONAL_SUBSCRIPTION';
export type PaidSubscriptionStatus = 'ACTIVE' | 'QUEUED';

type IntegrationEventEnvelope<
  TEventType extends string,
  TAggregateType extends string,
  TRoutingKey extends string,
  TPayload,
> = Readonly<{
  eventId: string;
  version: typeof PAYMENT_INTEGRATION_EVENT_VERSION;
  eventType: TEventType;
  occurredAt: string;
  aggregateType: TAggregateType;
  aggregateId: string;
  routingKey: TRoutingKey;
  payload: Readonly<TPayload>;
}>;

export type PaymentSucceededV1 = IntegrationEventEnvelope<
  typeof PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_SUCCEEDED,
  typeof PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION,
  'payment.succeeded',
  {
    transactionId: string;
    userId: string;
    subscriptionId: string;
    productId: string;
    amountMinor: number;
    currency: string;
    provider: string;
    kind: PaymentEventKind;
    checkoutPurpose: PaymentCheckoutPurpose | null;
    subscriptionStatus: PaidSubscriptionStatus;
  }
>;

export type PaymentFailedV1 = IntegrationEventEnvelope<
  typeof PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_FAILED,
  typeof PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION,
  'payment.failed',
  {
    transactionId: string;
    userId: string;
    productId: string;
    amountMinor: number;
    currency: string;
    provider: string;
    kind: PaymentEventKind;
    checkoutPurpose: PaymentCheckoutPurpose | null;
    failureCode: string;
  }
>;

export type QueuedSubscriptionPurchasedV1 = IntegrationEventEnvelope<
  typeof PAYMENT_INTEGRATION_EVENT_TYPE.QUEUED_SUBSCRIPTION_PURCHASED,
  typeof PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
  typeof SUBSCRIPTION_QUEUED_ROUTING_KEY,
  {
    userId: string;
    subscriptionId: string;
    subscriptionSequence: number;
    productId: string;
    startsAt: string;
    endsAt: string;
    amountMinor: number;
    currency: string;
    provider: string;
  }
>;

export type SubscriptionActivatedV1 = IntegrationEventEnvelope<
  typeof PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED,
  typeof PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
  typeof SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
  {
    userId: string;
    subscriptionId: string;
    subscriptionSequence: number;
    startsAt: string;
    endsAt: string;
    productId: string;
  }
>;

export type SubscriptionExpiredV1 = IntegrationEventEnvelope<
  typeof PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_EXPIRED,
  typeof PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
  'payment.subscription.expired',
  {
    userId: string;
    subscriptionId: string;
    subscriptionSequence: number;
    endsAt: string;
    hasActiveReplacement: boolean;
    replacementSubscriptionId: string | null;
  }
>;

export type SubscriptionAutoRenewChangedV1 = IntegrationEventEnvelope<
  typeof PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_AUTO_RENEW_CHANGED,
  typeof PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
  typeof SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY,
  {
    userId: string;
    subscriptionId: string;
    enabled: boolean;
    effectiveAt: string;
    nextBillingAt: string | null;
    provider: string;
  }
>;

export type PaymentIntegrationEventV1 =
  | PaymentSucceededV1
  | PaymentFailedV1
  | QueuedSubscriptionPurchasedV1
  | SubscriptionActivatedV1
  | SubscriptionExpiredV1
  | SubscriptionAutoRenewChangedV1;
