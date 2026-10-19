// Implemented FOLLOW-ZERO-1, contract 1.2.0. No real social graph or item rows.
export const SUPERADMIN_FOLLOW_ZERO_TYPE_DEFS = `
  type SuperadminFollowItem { userId: ID! }
  type SuperadminFollowConnection {
    items: [SuperadminFollowItem!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  extend type SuperadminUser {
    followers(input: PageInput!): SuperadminFollowConnection
    following(input: PageInput!): SuperadminFollowConnection
  }
`;
