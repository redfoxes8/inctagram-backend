// Implemented P2 global payments list, additive contract 1.5.0.
export const SUPERADMIN_PAYMENTS_LIST_TYPE_DEFS = `
enum SuperadminPaymentsSort {
  USERNAME_ASC
  USERNAME_DESC
  CREATED_AT_ASC
  CREATED_AT_DESC
  AMOUNT_ASC
  AMOUNT_DESC
  PAYMENT_METHOD_ASC
  PAYMENT_METHOD_DESC
}
input SuperadminPaymentsInput {
  page: Int! = 1
  searchUsername: String
  sort: SuperadminPaymentsSort! = CREATED_AT_DESC
}
type SuperadminPaymentListItem {
  transactionId: ID!
  userId: ID!
  username: String
  avatarUrl: String
  createdAt: DateTime!
  amountMinor: Int!
  currency: String!
  productName: String!
  billingInterval: PaymentBillingInterval!
  billingIntervalCount: Int!
  provider: PaymentProvider!
  status: PaymentStatus!
}
type SuperadminPaymentsPage {
  items: [SuperadminPaymentListItem!]!
  totalCount: Int!
  pageInfo: PageInfo!
}
extend type Query {
  superadminPayments(input: SuperadminPaymentsInput!): SuperadminPaymentsPage
}
`;
