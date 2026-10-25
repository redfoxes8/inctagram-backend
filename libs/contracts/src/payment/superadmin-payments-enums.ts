import {
  SuperadminPaymentsSort as ProtoSort,
  BillingInterval,
  PaymentProvider,
  PaymentTransactionStatus,
} from '../generated/payment';
import { SuperadminPaymentsSort } from '../../../common/types/superadmin-payments-list';
export const PAYMENT_LIST_SORT_TO_PROTO: Readonly<Record<SuperadminPaymentsSort, ProtoSort>> = {
  [SuperadminPaymentsSort.UsernameAsc]: ProtoSort.USERNAME_ASC,
  [SuperadminPaymentsSort.UsernameDesc]: ProtoSort.USERNAME_DESC,
  [SuperadminPaymentsSort.CreatedAtAsc]: ProtoSort.CREATED_AT_ASC,
  [SuperadminPaymentsSort.CreatedAtDesc]: ProtoSort.CREATED_AT_DESC,
  [SuperadminPaymentsSort.AmountAsc]: ProtoSort.AMOUNT_ASC,
  [SuperadminPaymentsSort.AmountDesc]: ProtoSort.AMOUNT_DESC,
  [SuperadminPaymentsSort.PaymentMethodAsc]: ProtoSort.PAYMENT_METHOD_ASC,
  [SuperadminPaymentsSort.PaymentMethodDesc]: ProtoSort.PAYMENT_METHOD_DESC,
};
export const PAYMENT_LIST_BILLING_TO_PROTO = {
  WEEK: BillingInterval.BILLING_INTERVAL_WEEK,
  MONTH: BillingInterval.BILLING_INTERVAL_MONTH,
} as const;
export const PAYMENT_LIST_PROVIDER_TO_PROTO = {
  STRIPE: PaymentProvider.STRIPE,
  PAYPAL: PaymentProvider.PAYPAL,
} as const;
export const PAYMENT_LIST_STATUS_TO_PROTO = {
  PENDING: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PENDING,
  PROCESSING: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PROCESSING,
  SUCCEEDED: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_SUCCEEDED,
  FAILED: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_FAILED,
  REFUNDED: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_REFUNDED,
  PARTIALLY_REFUNDED: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PARTIALLY_REFUNDED,
} as const;
export function decodePaymentListEnum<T extends string>(input: {
  mapping: Readonly<Record<T, number>>;
  value: unknown;
}): T | null {
  if (typeof input.value !== 'number' || !Number.isInteger(input.value)) return null;
  for (const key of Object.keys(input.mapping) as T[])
    if (input.mapping[key] === input.value) return key;
  return null;
}
