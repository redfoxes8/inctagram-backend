import type {
  SuperadminPostsFilter,
  SuperadminPostsPage,
} from '../../../../../../libs/common/types/superadmin-posts';
export abstract class SuperadminPostsPageReader {
  abstract findPage(
    input: SuperadminPostsFilter & { signal?: AbortSignal },
  ): Promise<SuperadminPostsPage>;
}
