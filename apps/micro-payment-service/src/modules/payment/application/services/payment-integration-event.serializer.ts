import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  PAYMENT_INTEGRATION_AGGREGATE_TYPE,
  PAYMENT_INTEGRATION_EVENT_TYPE,
  PAYMENT_INTEGRATION_EVENT_VERSION,
  PaymentIntegrationEventV1,
} from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import {
  PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE,
  PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
  PaymentNotificationRequestedV1,
} from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { assertPaymentFailureDetails } from '../../domain/specifications/payment-transaction-lifecycle.specification';
import { assertPositivePersistedInteger } from '../../domain/specifications/persisted-integer.specification';
import { assertUuidIdentifier } from '../../domain/specifications/uuid-identifier.specification';
import { JsonObject } from '../../domain/types/json-value.type';
import { Currency } from '../../domain/value-objects/currency.value-object';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

const UTC_ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type SerializedPaymentIntegrationEvent = Readonly<{
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  routingKey: string;
  payload: JsonObject;
  occurredAt: Date;
}>;

export function serializePaymentIntegrationEvent(
  event: PaymentIntegrationEventV1,
): SerializedPaymentIntegrationEvent {
  assertEnvelope(event);
  let payload: JsonObject;

  switch (event.eventType) {
    case PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_SUCCEEDED:
      assertRoutingKey(event.routingKey, 'payment.succeeded');
      assertPaymentFacts(event.payload);
      assertUuidIdentifier(event.payload.subscriptionId);
      assertPaidPurpose(event.payload.kind, event.payload.checkoutPurpose);
      if (
        event.payload.subscriptionStatus !== 'ACTIVE' &&
        event.payload.subscriptionStatus !== 'QUEUED'
      ) {
        throw badRequest('Paid subscription status is not supported');
      }
      assertAggregate(event.aggregateId, event.payload.transactionId);
      payload = {
        transactionId: event.payload.transactionId,
        userId: event.payload.userId,
        subscriptionId: event.payload.subscriptionId,
        productId: event.payload.productId,
        amountMinor: event.payload.amountMinor,
        currency: event.payload.currency,
        provider: event.payload.provider,
        kind: event.payload.kind,
        checkoutPurpose: event.payload.checkoutPurpose,
        subscriptionStatus: event.payload.subscriptionStatus,
      };
      break;
    case PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_FAILED:
      assertRoutingKey(event.routingKey, 'payment.failed');
      assertPaymentFacts(event.payload);
      assertPaidPurpose(event.payload.kind, event.payload.checkoutPurpose);
      assertPaymentFailureDetails({ failureCode: event.payload.failureCode, failureMessage: null });
      assertAggregate(event.aggregateId, event.payload.transactionId);
      payload = {
        transactionId: event.payload.transactionId,
        userId: event.payload.userId,
        productId: event.payload.productId,
        amountMinor: event.payload.amountMinor,
        currency: event.payload.currency,
        provider: event.payload.provider,
        kind: event.payload.kind,
        checkoutPurpose: event.payload.checkoutPurpose,
        failureCode: event.payload.failureCode,
      };
      break;
    case PAYMENT_INTEGRATION_EVENT_TYPE.QUEUED_SUBSCRIPTION_PURCHASED:
      assertRoutingKey(event.routingKey, 'subscription.queued');
      assertSubscriptionFacts(event.payload);
      assertUuidIdentifier(event.payload.productId);
      assertPositivePersistedInteger(event.payload.amountMinor, 'Event amount');
      new Currency(event.payload.currency);
      new ProviderCode(event.payload.provider);
      assertPeriod(event.payload.startsAt, event.payload.endsAt);
      assertAggregate(event.aggregateId, event.payload.subscriptionId);
      payload = {
        userId: event.payload.userId,
        subscriptionId: event.payload.subscriptionId,
        subscriptionSequence: event.payload.subscriptionSequence,
        productId: event.payload.productId,
        startsAt: event.payload.startsAt,
        endsAt: event.payload.endsAt,
        amountMinor: event.payload.amountMinor,
        currency: event.payload.currency,
        provider: event.payload.provider,
      };
      break;
    case PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED:
      assertRoutingKey(event.routingKey, 'subscription.activated');
      assertSubscriptionFacts(event.payload);
      assertUuidIdentifier(event.payload.productId);
      assertPeriod(event.payload.startsAt, event.payload.endsAt);
      assertAggregate(event.aggregateId, event.payload.subscriptionId);
      payload = {
        userId: event.payload.userId,
        subscriptionId: event.payload.subscriptionId,
        subscriptionSequence: event.payload.subscriptionSequence,
        startsAt: event.payload.startsAt,
        endsAt: event.payload.endsAt,
        productId: event.payload.productId,
      };
      break;
    case PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_EXPIRED:
      assertRoutingKey(event.routingKey, 'payment.subscription.expired');
      assertSubscriptionFacts(event.payload);
      assertUtcInstant(event.payload.endsAt);
      assertReplacementFacts(
        event.payload.hasActiveReplacement,
        event.payload.replacementSubscriptionId,
      );
      assertAggregate(event.aggregateId, event.payload.subscriptionId);
      payload = {
        userId: event.payload.userId,
        subscriptionId: event.payload.subscriptionId,
        subscriptionSequence: event.payload.subscriptionSequence,
        endsAt: event.payload.endsAt,
        hasActiveReplacement: event.payload.hasActiveReplacement,
        replacementSubscriptionId: event.payload.replacementSubscriptionId,
      };
      break;
    case PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_AUTO_RENEW_CHANGED:
      assertRoutingKey(event.routingKey, 'subscription.auto-renew.changed');
      assertUuidIdentifier(event.payload.userId);
      assertUuidIdentifier(event.payload.subscriptionId);
      assertUtcInstant(event.payload.effectiveAt);
      if (event.payload.nextBillingAt !== null) assertUtcInstant(event.payload.nextBillingAt);
      new ProviderCode(event.payload.provider);
      assertAggregate(event.aggregateId, event.payload.subscriptionId);
      payload = {
        userId: event.payload.userId,
        subscriptionId: event.payload.subscriptionId,
        enabled: event.payload.enabled,
        effectiveAt: event.payload.effectiveAt,
        nextBillingAt: event.payload.nextBillingAt,
        provider: event.payload.provider,
      };
      break;
    default:
      throw badRequest('Payment integration event type is not supported');
  }

  return {
    id: event.eventId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    eventVersion: event.version,
    routingKey: event.routingKey,
    payload: cloneJsonObject(payload),
    occurredAt: new Date(event.occurredAt),
  };
}

export function serializePaymentNotificationRequestedEvent(
  event: PaymentNotificationRequestedV1,
): SerializedPaymentIntegrationEvent {
  if (
    event.version !== 1 ||
    event.eventType !== PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE ||
    event.routingKey !== PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY ||
    !event.payload.userId ||
    !event.payload.businessKey
  ) {
    throw badRequest('Payment notification event is invalid');
  }
  assertUuidIdentifier(event.eventId);
  assertUuidIdentifier(event.aggregateId);
  assertUtcInstant(event.occurredAt);
  assertUtcInstant(event.payload.effectiveAt);
  return {
    id: event.eventId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    eventVersion: event.version,
    routingKey: event.routingKey,
    payload: {
      type: event.payload.type,
      userId: event.payload.userId,
      businessKey: event.payload.businessKey,
      subscriptionId: event.payload.subscriptionId,
      providerInvoiceId: event.payload.providerInvoiceId,
      effectiveAt: event.payload.effectiveAt,
      subscriptionEndsAt: event.payload.subscriptionEndsAt,
      reasonCode: event.payload.reasonCode,
    },
    occurredAt: new Date(event.occurredAt),
  };
}

function assertEnvelope(event: PaymentIntegrationEventV1): void {
  assertUuidIdentifier(event.eventId);
  assertUuidIdentifier(event.aggregateId);
  assertUtcInstant(event.occurredAt);
  if (event.version !== PAYMENT_INTEGRATION_EVENT_VERSION) {
    throw badRequest('Payment integration event version is not supported');
  }
  const expectsPaymentAggregate =
    event.eventType === PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_SUCCEEDED ||
    event.eventType === PAYMENT_INTEGRATION_EVENT_TYPE.PAYMENT_FAILED;
  const expectedAggregate = expectsPaymentAggregate
    ? PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION
    : PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION;
  if (event.aggregateType !== expectedAggregate) {
    throw badRequest('Payment integration event aggregate type is invalid');
  }
}

function assertPaymentFacts(payload: {
  transactionId: string;
  userId: string;
  productId: string;
  amountMinor: number;
  currency: string;
  provider: string;
}): void {
  assertUuidIdentifier(payload.transactionId);
  assertUuidIdentifier(payload.userId);
  assertUuidIdentifier(payload.productId);
  assertPositivePersistedInteger(payload.amountMinor, 'Event amount');
  new Currency(payload.currency);
  new ProviderCode(payload.provider);
}

function assertSubscriptionFacts(payload: {
  userId: string;
  subscriptionId: string;
  subscriptionSequence: number;
}): void {
  assertUuidIdentifier(payload.userId);
  assertUuidIdentifier(payload.subscriptionId);
  assertPositivePersistedInteger(payload.subscriptionSequence, 'Subscription sequence');
}

function assertPaidPurpose(kind: 'PURCHASE' | 'RENEWAL', purpose: string | null): void {
  const validPurchasePurpose =
    kind === 'PURCHASE' &&
    (purpose === 'INITIAL_SUBSCRIPTION' || purpose === 'ADDITIONAL_SUBSCRIPTION');
  if (!validPurchasePurpose && !(kind === 'RENEWAL' && purpose === null)) {
    throw badRequest('Payment kind and checkout purpose are inconsistent');
  }
}

function assertReplacementFacts(hasReplacement: boolean, replacementId: string | null): void {
  if (hasReplacement && replacementId !== null) {
    assertUuidIdentifier(replacementId);
    return;
  }
  if (!hasReplacement && replacementId === null) return;
  throw badRequest('Subscription replacement facts are inconsistent');
}

function assertPeriod(startsAt: string, endsAt: string): void {
  assertUtcInstant(startsAt);
  assertUtcInstant(endsAt);
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw badRequest('Subscription event period is invalid');
  }
}

function assertAggregate(aggregateId: string, payloadId: string): void {
  if (aggregateId !== payloadId) throw badRequest('Event aggregate identifier is inconsistent');
}

function assertRoutingKey(actual: string, expected: string): void {
  if (actual !== expected) throw badRequest('Payment integration event routing key is invalid');
}

function assertUtcInstant(value: string): void {
  if (!UTC_ISO_INSTANT.test(value)) throw badRequest('Event timestamp must be a UTC ISO instant');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw badRequest('Event timestamp must be a valid UTC ISO instant');
  }
}

function cloneJsonObject(value: object): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function badRequest(message: string): DomainException {
  return new DomainException({ code: DomainExceptionCode.BadRequest, message });
}
