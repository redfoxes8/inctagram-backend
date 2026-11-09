import { UserAccessState } from '../../../../../../../libs/common/types/user-access-state';
import type { SuperadminUserListItem } from '../../../../../../../libs/common/types/superadmin-users';
import type { SuperadminUserListRecord } from '../../domain/interfaces/superadmin-users.query-repository';
import { buildPublicProfileUrl } from './public-profile-url';

export function toSuperadminUserListItem(input: {
  record: SuperadminUserListRecord;
  frontendUrl: string | undefined;
}): SuperadminUserListItem {
  const { record, frontendUrl } = input;
  return {
    userId: record.userId,
    username: record.username,
    createdAt: record.createdAt.toISOString(),
    profileUrl: buildPublicProfileUrl({ userId: record.userId, frontendUrl }),
    state: record.isBanned ? UserAccessState.Blocked : UserAccessState.Active,
    isEmailConfirmed: record.isEmailConfirmed,
  };
}
