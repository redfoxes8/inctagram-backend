import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  SuperadminPostPublishedInput,
  SuperadminPostPublishedView,
} from '../../../../../../../libs/common/types/superadmin-posts';
import { normalizeSuperadminPostPublishedInput } from '../../../../../../../libs/common/src/validation/normalize-superadmin-posts-input';
import { SuperadminPostsRead } from '../ports/superadmin-posts-read.port';
import { SuperadminPostImagesMapper } from '../mappers/superadmin-post-images.mapper';

export class GetSuperadminPostPublishedViewQuery {
  constructor(readonly input: SuperadminPostPublishedInput) {}
}

@QueryHandler(GetSuperadminPostPublishedViewQuery)
export class GetSuperadminPostPublishedViewHandler implements IQueryHandler<
  GetSuperadminPostPublishedViewQuery,
  SuperadminPostPublishedView
> {
  constructor(
    private readonly posts: SuperadminPostsRead,
    private readonly images: SuperadminPostImagesMapper,
  ) {}

  async execute(query: GetSuperadminPostPublishedViewQuery): Promise<SuperadminPostPublishedView> {
    const result = await this.posts.findPublishedView(
      normalizeSuperadminPostPublishedInput(query.input),
    );
    if (result.outcome !== 'FOUND') return result;
    const [post] = await this.images.map([result.post]);
    return { outcome: 'FOUND', post };
  }
}
