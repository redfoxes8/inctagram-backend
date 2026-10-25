// Implemented moderation operations from 4B/05. Target SDL is not loaded wholesale.
export const SUPERADMIN_MODERATION_TYPE_DEFS = `
  input SuperadminUserIdInput { userId: ID! }
  enum SuperadminBanReasonCode { BAD_BEHAVIOR ADVERTISING_PLACEMENT ANOTHER_REASON }
  input SuperadminBanReasonInput { code: SuperadminBanReasonCode!, text: String }
  enum SuperadminBlockOutcome { BLOCKED ALREADY_BLOCKED NOT_FOUND USER_DELETED }
  enum SuperadminUnblockOutcome { UNBLOCKED ALREADY_ACTIVE NOT_FOUND USER_DELETED }
  enum SuperadminDeleteOutcome { DELETED ALREADY_DELETED NOT_FOUND }
  type SuperadminBlockUserPayload { userId: ID!, outcome: SuperadminBlockOutcome! }
  type SuperadminUnblockUserPayload { userId: ID!, outcome: SuperadminUnblockOutcome! }
  type SuperadminDeleteUserPayload { userId: ID!, outcome: SuperadminDeleteOutcome! }
  extend type Mutation {
    superadminBlockUser(input: SuperadminUserIdInput!, reason: SuperadminBanReasonInput): SuperadminBlockUserPayload!
    superadminUnblockUser(input: SuperadminUserIdInput!): SuperadminUnblockUserPayload!
    superadminDeleteUser(input: SuperadminUserIdInput!): SuperadminDeleteUserPayload!
  }
`;
