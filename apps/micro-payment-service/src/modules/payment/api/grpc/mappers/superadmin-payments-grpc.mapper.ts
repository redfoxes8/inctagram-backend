import type {
  GetSuperadminPaymentsPageRequest,
  GetSuperadminPaymentsPageResponse,
} from '../../../../../../../../libs/contracts/src/generated/payment';
import { SuperadminPaymentsSort as ProtoSort } from '../../../../../../../../libs/contracts/src/generated/payment';
import {
  PAYMENT_LIST_SORT_TO_PROTO,
  PAYMENT_LIST_BILLING_TO_PROTO,
  PAYMENT_LIST_PROVIDER_TO_PROTO,
  PAYMENT_LIST_STATUS_TO_PROTO,
  decodePaymentListEnum,
} from '../../../../../../../../libs/contracts/src/payment/superadmin-payments-enums';
import {
  SuperadminPaymentsSort,
  type SuperadminPaymentsReadPage,
} from '../../../../../../../../libs/common/types/superadmin-payments-list';
import { DomainException } from '../../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { GetSuperadminPaymentsPageQuery } from '../../../application/queries/get-superadmin-payments-page.query';

export function toSuperadminPaymentsQuery(
  request: GetSuperadminPaymentsPageRequest,
): GetSuperadminPaymentsPageQuery {
  const sort =
    request.sort === undefined || request.sort === ProtoSort.SUPERADMIN_PAYMENTS_SORT_UNSPECIFIED
      ? SuperadminPaymentsSort.CreatedAtDesc
      : decodePaymentListEnum({ mapping: PAYMENT_LIST_SORT_TO_PROTO, value: request.sort });
  if (!sort)
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Invalid payments sort',
    });
  return new GetSuperadminPaymentsPageQuery({
    page: request.page ?? 0,
    searchUsername: request.searchUsername,
    sort,
  });
}
export function toSuperadminPaymentsResponse(
  page: SuperadminPaymentsReadPage,
): GetSuperadminPaymentsPageResponse {
  return {
    items: page.items.map((item) => ({
      transactionId: item.transactionId,
      userId: item.userId,
      userSnapshot: item.userSnapshot
        ? { ...item.userSnapshot, username: item.userSnapshot.username ?? undefined }
        : undefined,
      createdAt: {
        seconds: Math.floor(item.createdAt.getTime() / 1000),
        nanos: (((item.createdAt.getTime() % 1000) + 1000) % 1000) * 1000000,
      },
      amountMinor: item.amountMinor,
      currency: item.currency,
      productName: item.productName,
      billingInterval: PAYMENT_LIST_BILLING_TO_PROTO[item.billingInterval],
      billingIntervalCount: item.billingIntervalCount,
      paymentProvider: PAYMENT_LIST_PROVIDER_TO_PROTO[item.provider],
      status: PAYMENT_LIST_STATUS_TO_PROTO[item.status],
    })),
    totalCount: page.totalCount,
    ...page.pageInfo,
  };
}
