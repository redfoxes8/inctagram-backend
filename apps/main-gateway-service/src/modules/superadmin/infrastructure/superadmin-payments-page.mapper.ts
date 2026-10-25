import { isUUID } from 'class-validator';
import type {
  SuperadminPaymentsReadPage,
  SuperadminPaymentRecord,
} from '../../../../../../libs/common/types/superadmin-payments-list';
import { normalizePaymentUserProfileSnapshot } from '../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import {
  decodePaymentListEnum,
  PAYMENT_LIST_BILLING_TO_PROTO,
  PAYMENT_LIST_PROVIDER_TO_PROTO,
  PAYMENT_LIST_STATUS_TO_PROTO,
} from '../../../../../../libs/contracts/src/payment/superadmin-payments-enums';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
function invalid(): never {
  throw new DomainException({
    code: DomainExceptionCode.ServiceUnavailable,
    message: 'Invalid payments page response',
  });
}
function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  return invalid();
}
function text(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  return invalid();
}
function integer(input: { value: unknown; min: number }): number {
  if (
    typeof input.value === 'number' &&
    Number.isInteger(input.value) &&
    input.value >= input.min &&
    input.value <= 2147483647
  )
    return input.value;
  return invalid();
}
function timestamp(value: unknown): Date {
  const source = record(value),
    rawSeconds = source.seconds ?? 0,
    nanos = source.nanos ?? 0;
  if (
    typeof rawSeconds !== 'number' &&
    (typeof rawSeconds !== 'string' || !/^-?\d+$/.test(rawSeconds))
  )
    return invalid();
  const seconds = Number(rawSeconds);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < -62135596800 ||
    seconds > 253402300799 ||
    typeof nanos !== 'number' ||
    !Number.isInteger(nanos) ||
    nanos < 0 ||
    nanos > 999999999
  )
    return invalid();
  return new Date(seconds * 1000 + Math.floor(nanos / 1000000));
}
function item(value: unknown): SuperadminPaymentRecord {
  const source = record(value),
    transactionId = text(source.transactionId),
    userId = text(source.userId);
  if (!isUUID(transactionId) || !isUUID(userId)) return invalid();
  const billingInterval = decodePaymentListEnum({
    mapping: PAYMENT_LIST_BILLING_TO_PROTO,
    value: source.billingInterval,
  });
  const provider = decodePaymentListEnum({
    mapping: PAYMENT_LIST_PROVIDER_TO_PROTO,
    value: source.paymentProvider,
  });
  const status = decodePaymentListEnum({
    mapping: PAYMENT_LIST_STATUS_TO_PROTO,
    value: source.status,
  });
  if (!billingInterval || !provider || !status) return invalid();
  let userSnapshot: SuperadminPaymentRecord['userSnapshot'] = null;
  if (source.userSnapshot !== undefined && source.userSnapshot !== null) {
    const snapshot = record(source.userSnapshot);
    try {
      userSnapshot = normalizePaymentUserProfileSnapshot({
        userId: snapshot.userId,
        sourceVersion: snapshot.sourceVersion,
        username: snapshot.username ?? null,
        profileExists: snapshot.profileExists ?? false,
        isDeleted: snapshot.isDeleted ?? false,
      });
    } catch {
      return invalid();
    }
    if (userSnapshot.userId !== userId) return invalid();
  }
  return {
    transactionId,
    userId,
    userSnapshot,
    createdAt: timestamp(source.createdAt),
    amountMinor: integer({ value: source.amountMinor ?? 0, min: -2147483648 }),
    currency: text(source.currency),
    productName: text(source.productName),
    billingInterval,
    billingIntervalCount: integer({ value: source.billingIntervalCount, min: 1 }),
    provider,
    status,
  };
}
export function mapSuperadminPaymentsPage(input: {
  response: unknown;
  page: number;
}): SuperadminPaymentsReadPage {
  const source = record(input.response);
  const page = integer({ value: source.page, min: 1 }),
    pageSize = integer({ value: source.pageSize, min: 1 });
  const totalCount = integer({ value: source.totalCount ?? 0, min: 0 }),
    pagesCount = integer({ value: source.pagesCount ?? 0, min: 0 });
  const hasNextPage = source.hasNextPage ?? false,
    items = source.items ?? [];
  if (
    page !== input.page ||
    pageSize !== 6 ||
    pagesCount !== Math.ceil(totalCount / 6) ||
    hasNextPage !== page < pagesCount ||
    !Array.isArray(items) ||
    items.length !== Math.min(6, Math.max(0, totalCount - (page - 1) * 6))
  )
    return invalid();
  const mapped = items.map(item);
  if (new Set(mapped.map((row) => row.transactionId)).size !== mapped.length) return invalid();
  return { items: mapped, totalCount, pageInfo: { page, pageSize, pagesCount, hasNextPage } };
}
