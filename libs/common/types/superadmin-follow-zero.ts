import type { SuperadminUsersPage } from './superadmin-users';

// FOLLOW-ZERO-1: structural item only. The temporary API never creates rows.
export type SuperadminFollowItem = { userId: string };

export type SuperadminFollowConnection = {
  items: SuperadminFollowItem[];
  totalCount: number;
  pageInfo: SuperadminUsersPage['pageInfo'];
};
