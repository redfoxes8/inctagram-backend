import {
  normalizePaymentUserProfileSnapshot,
  PaymentUserProfileContractError,
  type PaymentUserProfileSnapshot,
} from './payment-user-profile-snapshot';

export type PaymentProfileExportRequest = Readonly<{
  afterUserId?: string;
  upperUserId?: string;
  limit: number;
}>;
export type PaymentProfileExportPage = Readonly<{
  protocolVersion: 1;
  upperUserId?: string;
  sourceEmpty: boolean;
  items: PaymentUserProfileSnapshot[];
  nextAfterUserId?: string;
  complete: boolean;
}>;

export function validatePaymentProfileExportRequest(request: PaymentProfileExportRequest): void {
  if (
    !Number.isInteger(request.limit) ||
    request.limit < 1 ||
    request.limit > 500 ||
    [request.afterUserId, request.upperUserId].some(
      (value) => value !== undefined && (typeof value !== 'string' || !value.trim()),
    ) ||
    (request.afterUserId !== undefined && request.upperUserId === undefined)
  ) {
    throw new PaymentUserProfileContractError();
  }
}

export function normalizePaymentProfileExportPage(input: {
  value: unknown;
  request: PaymentProfileExportRequest;
}): PaymentProfileExportPage {
  validatePaymentProfileExportRequest(input.request);
  const value = input.value;
  if (!value || typeof value !== 'object') throw new PaymentUserProfileContractError();
  const page = value as Record<string, unknown>;
  if (
    page.protocolVersion !== 1 ||
    typeof page.complete !== 'boolean' ||
    typeof page.sourceEmpty !== 'boolean' ||
    !Array.isArray(page.items) ||
    page.items.length > input.request.limit
  )
    throw new PaymentUserProfileContractError();
  const upper = page.upperUserId;
  const next = page.nextAfterUserId;
  if (
    [upper, next].some(
      (cursor) => cursor !== undefined && (typeof cursor !== 'string' || !cursor.trim()),
    )
  )
    throw new PaymentUserProfileContractError();
  const items = page.items.map(normalizePaymentUserProfileSnapshot);
  const ids = items.map((item) => item.userId);
  // TEXT order/bounds are checked by the source SQL in its actual collation, not JS locale.
  if (
    new Set(ids).size !== ids.length ||
    ids.includes(input.request.afterUserId ?? '') ||
    (input.request.upperUserId !== undefined && upper !== input.request.upperUserId) ||
    (page.sourceEmpty &&
      (upper !== undefined || items.length !== 0 || next !== undefined || !page.complete)) ||
    (!page.sourceEmpty &&
      (upper === undefined || next !== (ids.at(-1) ?? input.request.afterUserId))) ||
    (!page.complete && (items.length !== input.request.limit || next === upper)) ||
    (input.request.afterUserId === input.request.upperUserId &&
      input.request.afterUserId !== undefined &&
      (items.length !== 0 || !page.complete))
  )
    throw new PaymentUserProfileContractError();
  return {
    protocolVersion: 1,
    upperUserId: upper as string | undefined,
    sourceEmpty: page.sourceEmpty,
    items,
    nextAfterUserId: next as string | undefined,
    complete: page.complete,
  };
}
