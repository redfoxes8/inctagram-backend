// Implemented SA-GQL-06 subset of target contract 1.1.0.
export const SUPERADMIN_PAYMENTS_TYPE_DEFS = `
  enum PaymentProvider { STRIPE PAYPAL }
  enum PaymentBillingInterval { WEEK MONTH }
  enum PaymentKind { PURCHASE RENEWAL }
  enum PaymentStatus { PENDING PROCESSING SUCCEEDED FAILED REFUNDED PARTIALLY_REFUNDED }
  enum CheckoutPurpose { INITIAL_SUBSCRIPTION ADDITIONAL_SUBSCRIPTION }
  type PaymentHistoryItem {
    transactionId: ID!
    createdAt: DateTime!
    paidAt: DateTime
    amountMinor: Int!
    currency: String!
    productId: ID!
    productName: String!
    billingInterval: PaymentBillingInterval!
    billingIntervalCount: Int!
    provider: PaymentProvider!
    kind: PaymentKind!
    status: PaymentStatus!
    checkoutPurpose: CheckoutPurpose
    subscriptionId: ID
    subscriptionEndsAt: DateTime
  }
  type PaymentConnection { items: [PaymentHistoryItem!]!, totalCount: Int!, pageInfo: PageInfo! }
  extend type SuperadminUser { payments(input: PageInput!): PaymentConnection }
`;
