import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  SuperadminPostsInput,
  SuperadminPostsPage,
} from '../../../../../../../libs/common/types/superadmin-posts';
import { normalizeSuperadminPostsInput } from '../../../../../../../libs/common/src/validation/normalize-superadmin-posts-input';
import { SuperadminPostsRead } from '../ports/superadmin-posts-read.port';
import { SuperadminPostImagesMapper } from '../mappers/superadmin-post-images.mapper';

export class GetSuperadminPostsPageQuery {
  constructor(readonly input: SuperadminPostsInput) {}
}

@QueryHandler(GetSuperadminPostsPageQuery)
export class GetSuperadminPostsPageHandler implements IQueryHandler<
  GetSuperadminPostsPageQuery,
  SuperadminPostsPage
> {
  constructor(
    private readonly posts: SuperadminPostsRead,
    private readonly images: SuperadminPostImagesMapper,
  ) {}

  async execute(query: GetSuperadminPostsPageQuery): Promise<SuperadminPostsPage> {
    const page = await this.posts.findPage(normalizeSuperadminPostsInput(query.input));
    return { items: await this.images.map(page.items), pageInfo: page.pageInfo };
  }
}
