// Implemented 4B only; DELETE remains target-only until SA-GQL-05.
export const SUPERADMIN_MODERATION_TYPE_DEFS = `
  input SuperadminUserIdInput { userId: ID! }
  enum SuperadminBlockOutcome { BLOCKED ALREADY_BLOCKED NOT_FOUND USER_DELETED }
  enum SuperadminUnblockOutcome { UNBLOCKED ALREADY_ACTIVE NOT_FOUND USER_DELETED }
  type SuperadminBlockUserPayload { userId: ID!, outcome: SuperadminBlockOutcome! }
  type SuperadminUnblockUserPayload { userId: ID!, outcome: SuperadminUnblockOutcome! }
  extend type Mutation {
    superadminBlockUser(input: SuperadminUserIdInput!): SuperadminBlockUserPayload!
    superadminUnblockUser(input: SuperadminUserIdInput!): SuperadminUnblockUserPayload!
  }
`;
