import type {
  SuperadminPostsFilter,
  SuperadminPostPublishedFilter,
  SuperadminPostReadPage,
  SuperadminPostPublishedRead,
} from '../../../../../../../libs/common/types/superadmin-posts';

export abstract class SuperadminPostsRead {
  abstract findPage(filter: SuperadminPostsFilter): Promise<SuperadminPostReadPage>;
  abstract findPublishedView(
    filter: SuperadminPostPublishedFilter,
  ): Promise<SuperadminPostPublishedRead>;
}

export abstract class SuperadminPostFiles {
  abstract findUrls(fileIds: string[]): Promise<ReadonlyMap<string, string>>;
}
