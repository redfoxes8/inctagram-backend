import { SUPERADMIN_AUTH_TYPE_DEFS } from './auth-type-defs';
import { SUPERADMIN_USERS_TYPE_DEFS } from './users-type-defs';

// Root/common owner composes implemented feature fragments; target.graphql is never loaded.
export const SUPERADMIN_RUNTIME_TYPE_DEFS = `${SUPERADMIN_AUTH_TYPE_DEFS}\n${SUPERADMIN_USERS_TYPE_DEFS}`;
