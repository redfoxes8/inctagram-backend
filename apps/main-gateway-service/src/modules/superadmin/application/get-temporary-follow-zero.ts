import type { SuperadminFollowConnection } from '../../../../../../libs/common/types/superadmin-follow-zero';

// Deliberate temporary FOLLOW-ZERO-1 result, not a social-source read or outage fallback.
// HTTP inputs have already passed the common PaginationInput validation.
export function getTemporaryFollowZero(input: {
  page: number;
  pageSize: number;
}): SuperadminFollowConnection {
  return {
    items: [],
    totalCount: 0,
    pageInfo: {
      page: input.page,
      pageSize: input.pageSize,
      pagesCount: 0,
      hasNextPage: false,
    },
  };
}
