// Implemented SA-GQL-03 fragment; Payments and FOLLOW-ZERO-1 extend this type separately.
export const SUPERADMIN_USERS_TYPE_DEFS = `
  enum SuperadminUserSort { USERNAME_ASC USERNAME_DESC CREATED_AT_ASC CREATED_AT_DESC }
  enum SuperadminUserState { ACTIVE BLOCKED }
  enum SuperadminUsersBanFilter { ALL BLOCKED NOT_BLOCKED }
  input SuperadminUsersInput {
    page: Int! = 1
    pageSize: Int! = 8
    searchUsername: String
    sort: SuperadminUserSort! = CREATED_AT_DESC
    banFilter: SuperadminUsersBanFilter! = ALL
  }
  type SuperadminUserListItem {
    userId: ID!
    username: String
    profileUrl: String
    createdAt: DateTime!
    state: SuperadminUserState!
    isEmailConfirmed: Boolean!
  }
  type SuperadminUsersPage {
    items: [SuperadminUserListItem!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }
  type SuperadminUser {
    userId: ID!
    username: String
    avatarUrl: String
    profileUrl: String
    createdAt: DateTime!
    state: SuperadminUserState!
    isEmailConfirmed: Boolean!
  }
  extend type Query {
    superadminUsers(input: SuperadminUsersInput!): SuperadminUsersPage!
    superadminUser(userId: ID!): SuperadminUser
  }
`;
