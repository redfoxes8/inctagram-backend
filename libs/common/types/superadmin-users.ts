import type { UserAccessState } from './user-access-state';

export enum SuperadminUsersBanFilter {
  All = 'ALL',
  Blocked = 'BLOCKED',
  NotBlocked = 'NOT_BLOCKED',
}

export enum SuperadminUserSort {
  UsernameAsc = 'USERNAME_ASC',
  UsernameDesc = 'USERNAME_DESC',
  CreatedAtAsc = 'CREATED_AT_ASC',
  CreatedAtDesc = 'CREATED_AT_DESC',
}

export type SuperadminUsersFilter = Readonly<{
  page: number;
  pageSize: number;
  searchUsername: string | null;
  sort: SuperadminUserSort;
  banFilter: SuperadminUsersBanFilter;
}>;

export type SuperadminUserListItem = {
  userId: string;
  username: string | null;
  profileUrl: string | null;
  createdAt: string;
  state: UserAccessState.Active | UserAccessState.Blocked;
  isEmailConfirmed: boolean;
};

export type SuperadminUser = SuperadminUserListItem & { avatarUrl: string | null };

export type SuperadminUsersPage = {
  items: SuperadminUserListItem[];
  totalCount: number;
  pageInfo: { page: number; pageSize: number; pagesCount: number; hasNextPage: boolean };
};
