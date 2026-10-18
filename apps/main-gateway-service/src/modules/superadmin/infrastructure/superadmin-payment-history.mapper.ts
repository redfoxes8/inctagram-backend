import type { GetPaymentHistoryResponse } from '../../../../../../libs/contracts/src/generated/payment';
import type {
  SuperadminPaymentConnection,
  SuperadminPaymentHistoryItem,
} from '../../../../../../libs/common/types/superadmin-payments';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

function invalidResponse(): never {
  throw new DomainException({
    code: DomainExceptionCode.InternalServerError,
    message: 'Invalid payment history response',
  });
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return value as Record<string, unknown>;
  return invalidResponse();
}

function text(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return invalidResponse();
}

function integer(input: { value: unknown; minimum?: number }): number {
  if (
    typeof input.value === 'number' &&
    Number.isInteger(input.value) &&
    input.value >= (input.minimum ?? 0) &&
    input.value <= 2147483647
  )
    return input.value;
  return invalidResponse();
}

function enumValue<T extends string>(input: { value: unknown; values: readonly T[] }): T {
  if (typeof input.value === 'number' && Number.isInteger(input.value)) {
    const value = input.values[input.value - 1];
    if (value !== undefined) return value;
  }
  return invalidResponse();
}

function timestamp(value: unknown): string {
  const time = record(value);
  // The shared client decodes int64 seconds as Number; also accept exact integer strings.
  // Absent scalar members represent protobuf zero, not a missing Timestamp message.
  const rawSeconds = time.seconds ?? 0;
  if (
    typeof rawSeconds !== 'number' &&
    (typeof rawSeconds !== 'string' || !/^-?\d+$/.test(rawSeconds))
  )
    return invalidResponse();
  const seconds = Number(rawSeconds);
  const nanos = time.nanos ?? 0;
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < -62135596800 ||
    seconds > 253402300799 ||
    typeof nanos !== 'number' ||
    !Number.isInteger(nanos) ||
    nanos < 0 ||
    nanos > 999999999
  )
    return invalidResponse();
  return new Date(seconds * 1000 + Math.floor(nanos / 1000000)).toISOString();
}

function optionalTimestamp(value: unknown): string | null {
  return value === undefined || value === null ? null : timestamp(value);
}

function item(value: unknown): SuperadminPaymentHistoryItem {
  const source = record(value);
  return {
    transactionId: text(source.transactionId),
    productId: text(source.productId),
    productName: text(source.productName),
    currency: text(source.currency),
    amountMinor: integer({ value: source.amountMinor ?? 0 }),
    createdAt: timestamp(source.createdAt),
    paidAt: optionalTimestamp(source.paidAt),
    billingInterval: enumValue({
      value: source.billingInterval,
      values: ['WEEK', 'MONTH'] as const,
    }),
    billingIntervalCount: integer({ value: source.billingIntervalCount, minimum: 1 }),
    provider: enumValue({ value: source.paymentProvider, values: ['STRIPE', 'PAYPAL'] as const }),
    kind: enumValue({ value: source.kind, values: ['PURCHASE', 'RENEWAL'] as const }),
    status: enumValue({
      value: source.status,
      values: [
        'PENDING',
        'PROCESSING',
        'SUCCEEDED',
        'FAILED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
      ] as const,
    }),
    checkoutPurpose:
      source.checkoutPurpose === undefined || source.checkoutPurpose === null
        ? null
        : enumValue({
            value: source.checkoutPurpose,
            values: ['INITIAL_SUBSCRIPTION', 'ADDITIONAL_SUBSCRIPTION'] as const,
          }),
    subscriptionId:
      source.subscriptionId === undefined ||
      source.subscriptionId === null ||
      source.subscriptionId === ''
        ? null
        : text(source.subscriptionId),
    subscriptionEndsAt: optionalTimestamp(source.subscriptionEndsAt),
  };
}

export function mapSuperadminPaymentHistory(input: {
  response: GetPaymentHistoryResponse;
  request: { page: number; pageSize: number };
}): SuperadminPaymentConnection {
  const source = record(input.response);
  const page = integer({ value: source.page, minimum: 1 });
  const pageSize = integer({ value: source.pageSize, minimum: 1 });
  const totalCount = integer({ value: source.totalCount ?? 0 });
  const pagesCount = integer({ value: source.pagesCount ?? 0 });
  // Protobuf omits empty repeated fields and zero scalar values on the wire.
  const items = source.items ?? [];
  if (
    page !== input.request.page ||
    pageSize !== input.request.pageSize ||
    pagesCount !== Math.ceil(totalCount / pageSize) ||
    !Array.isArray(items) ||
    items.length > pageSize
  )
    return invalidResponse();
  return {
    items: items.map(item),
    totalCount,
    pageInfo: { page, pageSize, pagesCount, hasNextPage: page < pagesCount },
  };
}
