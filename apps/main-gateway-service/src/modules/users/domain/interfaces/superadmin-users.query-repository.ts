import type { SuperadminUsersFilter } from '../../../../../../../libs/common/types/superadmin-users';

export type SuperadminUserListRecord = {
  userId: string;
  username: string | null;
  createdAt: Date;
  isBanned: boolean;
  isEmailConfirmed: boolean;
};
export type SuperadminUserRecord = SuperadminUserListRecord & { avatarUrl: string | null };

export abstract class SuperadminUsersQueryRepository {
  // Non-deleted only. One database snapshot per page/count result; no cross-page snapshot promise.
  abstract findPage(
    input: SuperadminUsersFilter,
  ): Promise<{ items: SuperadminUserListRecord[]; totalCount: number }>;
  abstract findUser(input: { userId: string }): Promise<SuperadminUserRecord | null>;
}
