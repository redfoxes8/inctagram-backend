import type { PaymentUserProfileSnapshot } from '../../contracts/src/events/payment-user-profile-snapshot';

export const SUPERADMIN_POSTS_DEFAULT_FIRST = 4;
export const SUPERADMIN_POSTS_MAX_FIRST = 5;
export const SUPERADMIN_POSTS_MAX_IMAGES = 10;
export const SUPERADMIN_POSTS_MAX_FILE_IDS = 50;

export type SuperadminPostsInput = Readonly<{
  first?: number;
  after?: string | null;
  searchUsername?: string | null;
}>;
export type SuperadminPostsCursor = Readonly<{
  v: 1;
  createdAt: string;
  postId: string;
  searchUsername: string | null;
}>;
export type SuperadminPostsFilter = Readonly<{
  first: number;
  after: SuperadminPostsCursor | null;
  searchUsername: string | null;
}>;
export type SuperadminPostPublishedInput = Readonly<{
  postId: string;
  searchUsername?: string | null;
  authorMissingConfirmed?: boolean;
  // Internal binding of the confirmation to the author actually checked by Gateway.
  authorUserId?: string;
}>;
export type SuperadminPostPublishedFilter = Readonly<{
  postId: string;
  searchUsername: string | null;
  authorMissingConfirmed: boolean;
  authorUserId: string | null;
}>;
export type SuperadminPostImageRecord = Readonly<{ fileId: string; order: number }>;
export type SuperadminPostRecord = Readonly<{
  postId: string;
  userId: string;
  username: string | null;
  description: string;
  publishedAt: string;
  // Internal source metadata; not an additional public GraphQL field.
  userSnapshot: PaymentUserProfileSnapshot | null;
  images: SuperadminPostImageRecord[];
}>;
export type SuperadminPost = Omit<SuperadminPostRecord, 'images'> & {
  images: (SuperadminPostImageRecord & { url: string | null })[];
};
export type SuperadminPostsPageInfo = Readonly<{
  endCursor: string | null;
  hasNextPage: boolean;
}>;
export type SuperadminPostReadPage = Readonly<{
  items: SuperadminPostRecord[];
  pageInfo: SuperadminPostsPageInfo;
}>;
export type SuperadminPostsPage = Readonly<{
  items: SuperadminPost[];
  pageInfo: SuperadminPostsPageInfo;
}>;
export type SuperadminPostReadOutcome =
  | Readonly<{ outcome: 'NOT_FOUND' | 'FILTERED' }>
  | Readonly<{ outcome: 'UNRESOLVED_AUTHOR'; postId: string; userId: string }>;
export type SuperadminPostPublishedRead =
  | Readonly<{ outcome: 'FOUND'; post: SuperadminPostRecord }>
  | SuperadminPostReadOutcome;
export type SuperadminPostPublishedView =
  | Readonly<{ outcome: 'FOUND'; post: SuperadminPost }>
  | SuperadminPostReadOutcome;

export type SuperadminPostSubscriptionEvent =
  | Readonly<{ kind: 'READY' | 'RESYNC_REQUIRED'; post: null }>
  | Readonly<{ kind: 'POST_PUBLISHED'; post: Omit<SuperadminPost, 'userSnapshot'> }>;
