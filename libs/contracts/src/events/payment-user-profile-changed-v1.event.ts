import { isUUID } from 'class-validator';
import {
  normalizePaymentUserProfileSnapshot,
  PaymentUserProfileContractError,
  type PaymentUserProfileSnapshot,
} from './payment-user-profile-snapshot';

export const PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE = 'payment.user-profile.changed.v1';
export const PAYMENT_USER_PROFILE_CHANGED_ROUTING_KEY = PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE;
export const PAYMENT_USER_PROFILE_SCHEMA_VERSION = 1;

export type PaymentUserProfileChangedV1 = PaymentUserProfileSnapshot &
  Readonly<{
    eventType: typeof PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE;
    schemaVersion: typeof PAYMENT_USER_PROFILE_SCHEMA_VERSION;
    eventId: string;
    occurredAt: string;
  }>;

export function parsePaymentUserProfileChangedV1(value: unknown): PaymentUserProfileChangedV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PaymentUserProfileContractError();
  }
  const { eventType, schemaVersion, eventId, occurredAt, ...snapshot } = value as Record<
    string,
    unknown
  >;
  if (
    eventType !== PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE ||
    schemaVersion !== PAYMENT_USER_PROFILE_SCHEMA_VERSION ||
    typeof eventId !== 'string' ||
    !isUUID(eventId) ||
    typeof occurredAt !== 'string' ||
    !isUtcTimestamp(occurredAt)
  ) {
    throw new PaymentUserProfileContractError();
  }
  return {
    ...normalizePaymentUserProfileSnapshot(snapshot),
    eventType,
    schemaVersion,
    eventId,
    occurredAt,
  };
}

function isUtcTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
