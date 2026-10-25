import type { PaymentUserProfileSnapshot } from '../../contracts/src/events/payment-user-profile-snapshot';
import type { SuperadminPaymentHistoryItem } from './superadmin-payments';
import type { SuperadminUsersPage } from './superadmin-users';

export const SUPERADMIN_PAYMENTS_PAGE_SIZE = 6;
export enum SuperadminPaymentsSort {
  UsernameAsc = 'USERNAME_ASC',
  UsernameDesc = 'USERNAME_DESC',
  CreatedAtAsc = 'CREATED_AT_ASC',
  CreatedAtDesc = 'CREATED_AT_DESC',
  AmountAsc = 'AMOUNT_ASC',
  AmountDesc = 'AMOUNT_DESC',
  PaymentMethodAsc = 'PAYMENT_METHOD_ASC',
  PaymentMethodDesc = 'PAYMENT_METHOD_DESC',
}
export type SuperadminPaymentsInput = Readonly<{
  page?: number;
  searchUsername?: string | null;
  sort?: SuperadminPaymentsSort;
}>;
export type SuperadminPaymentsFilter = Readonly<{
  page: number;
  searchUsername: string | null;
  sort: SuperadminPaymentsSort;
}>;
export type SuperadminPaymentRecord = Pick<
  SuperadminPaymentHistoryItem,
  | 'transactionId'
  | 'amountMinor'
  | 'currency'
  | 'productName'
  | 'billingInterval'
  | 'billingIntervalCount'
  | 'provider'
  | 'status'
> & {
  userId: string;
  createdAt: Date;
  userSnapshot: PaymentUserProfileSnapshot | null;
};
export type SuperadminPaymentsReadPage = {
  items: SuperadminPaymentRecord[];
  totalCount: number;
  pageInfo: SuperadminUsersPage['pageInfo'];
};
export type EnrichedSuperadminPayment = Omit<SuperadminPaymentRecord, 'userSnapshot'> & {
  username: string | null;
  avatarUrl: string | null;
};
export type EnrichedSuperadminPaymentsPage = Omit<SuperadminPaymentsReadPage, 'items'> & {
  items: EnrichedSuperadminPayment[];
};
