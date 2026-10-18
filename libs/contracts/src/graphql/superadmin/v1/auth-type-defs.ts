import { SUPERADMIN_COMMON_TYPE_DEFS } from './common-type-defs';

// Runtime fragment: only implemented SA-GQL-02 operations. Never import target.graphql.
export const SUPERADMIN_AUTH_TYPE_DEFS = `${SUPERADMIN_COMMON_TYPE_DEFS}
  input SuperadminLoginInput { email: String!, password: String! }
  type SuperadminSessionPayload { authenticated: Boolean! }
  type SuperadminLoginPayload { authenticated: Boolean! }
  type SuperadminLogoutPayload { loggedOut: Boolean! }
  type Query { superadminSession: SuperadminSessionPayload! }
  type Mutation {
    superadminLogin(input: SuperadminLoginInput!): SuperadminLoginPayload!
    superadminLogout: SuperadminLogoutPayload!
  }
`;
