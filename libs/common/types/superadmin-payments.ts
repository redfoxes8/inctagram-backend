import type { SuperadminUsersPage } from './superadmin-users';

export type SuperadminPaymentHistoryItem = {
  transactionId: string;
  createdAt: string;
  paidAt: string | null;
  amountMinor: number;
  currency: string;
  productId: string;
  productName: string;
  billingInterval: 'WEEK' | 'MONTH';
  billingIntervalCount: number;
  provider: 'STRIPE' | 'PAYPAL';
  kind: 'PURCHASE' | 'RENEWAL';
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  checkoutPurpose: 'INITIAL_SUBSCRIPTION' | 'ADDITIONAL_SUBSCRIPTION' | null;
  subscriptionId: string | null;
  subscriptionEndsAt: string | null;
};

export type SuperadminPaymentConnection = {
  items: SuperadminPaymentHistoryItem[];
  totalCount: number;
  pageInfo: SuperadminUsersPage['pageInfo'];
};
