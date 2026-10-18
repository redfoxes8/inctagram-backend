import { UserAccessState } from '../../../../../../../libs/common/types/user-access-state';
import type { SuperadminUserListItem } from '../../../../../../../libs/common/types/superadmin-users';
import type { SuperadminUserListRecord } from '../../domain/interfaces/superadmin-users.query-repository';

export function toSuperadminUserListItem(record: SuperadminUserListRecord): SuperadminUserListItem {
  return {
    userId: record.userId,
    username: record.username,
    createdAt: record.createdAt.toISOString(),
    // Public FE profile route is not confirmed. Never infer it from a REST route or username.
    profileUrl: null,
    state: record.isBanned ? UserAccessState.Blocked : UserAccessState.Active,
    isEmailConfirmed: record.isEmailConfirmed,
  };
}
