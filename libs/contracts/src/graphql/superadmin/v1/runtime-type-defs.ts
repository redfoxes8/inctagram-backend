import { SUPERADMIN_PAYMENTS_LIST_TYPE_DEFS } from './payments-list-type-defs';
import { SUPERADMIN_AUTH_TYPE_DEFS } from './auth-type-defs';
import { SUPERADMIN_USERS_TYPE_DEFS } from './users-type-defs';
import { SUPERADMIN_MODERATION_TYPE_DEFS } from './moderation-type-defs';
import { SUPERADMIN_PAYMENTS_TYPE_DEFS } from './payments-type-defs';
import { SUPERADMIN_FOLLOW_ZERO_TYPE_DEFS } from './follow-zero-type-defs';

// Root/common owner composes implemented feature fragments; target.graphql is never loaded.
export const SUPERADMIN_RUNTIME_TYPE_DEFS = `${SUPERADMIN_AUTH_TYPE_DEFS}\n${SUPERADMIN_USERS_TYPE_DEFS}\n${SUPERADMIN_MODERATION_TYPE_DEFS}\n${SUPERADMIN_PAYMENTS_TYPE_DEFS}\n${SUPERADMIN_FOLLOW_ZERO_TYPE_DEFS}\n${SUPERADMIN_PAYMENTS_LIST_TYPE_DEFS}`;
