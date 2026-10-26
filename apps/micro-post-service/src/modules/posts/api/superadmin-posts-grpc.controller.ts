import { Controller, UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GrpcMethod } from '@nestjs/microservices';
import { GrpcExceptionInterceptor } from '../../../../../../libs/common/src/exceptions/grpc-exception.interceptor';
import { GetSuperadminPostsPageQuery } from '../application/queries/get-superadmin-posts-page.query';
import { GetSuperadminPostPublishedViewQuery } from '../application/queries/get-superadmin-post-published-view.query';
import type {
  SuperadminPost,
  SuperadminPostsPage,
  SuperadminPostPublishedView,
} from '../../../../../../libs/common/types/superadmin-posts';
import {
  SuperadminPostPublishedOutcome as Outcome,
  type SuperadminPostView,
  type GetSuperadminPostsPageRequest,
  type GetSuperadminPostsPageResponse,
  type GetSuperadminPostPublishedViewRequest,
  type GetSuperadminPostPublishedViewResponse,
} from '../../../../../../libs/contracts/src/generated/post';

function toRpc(post: SuperadminPost): SuperadminPostView {
  return {
    ...post,
    username: post.username ?? undefined,
    images: post.images.map((image) => ({ ...image, url: image.url ?? undefined })),
    userSnapshot: post.userSnapshot
      ? { ...post.userSnapshot, username: post.userSnapshot.username ?? undefined }
      : undefined,
  };
}

@Controller()
@UseInterceptors(GrpcExceptionInterceptor)
export class SuperadminPostsGrpcController {
  constructor(private readonly queries: QueryBus) {}
  @GrpcMethod('PostService', 'GetSuperadminPostsPage')
  async page(input: GetSuperadminPostsPageRequest): Promise<GetSuperadminPostsPageResponse> {
    const page = await this.queries.execute<GetSuperadminPostsPageQuery, SuperadminPostsPage>(
      new GetSuperadminPostsPageQuery(input),
    );
    return {
      items: page.items.map(toRpc),
      pageInfo: { ...page.pageInfo, endCursor: page.pageInfo.endCursor ?? undefined },
    };
  }
  @GrpcMethod('PostService', 'GetSuperadminPostPublishedView')
  async published(
    input: GetSuperadminPostPublishedViewRequest,
  ): Promise<GetSuperadminPostPublishedViewResponse> {
    const result = await this.queries.execute<
      GetSuperadminPostPublishedViewQuery,
      SuperadminPostPublishedView
    >(new GetSuperadminPostPublishedViewQuery(input));
    switch (result.outcome) {
      case 'FOUND':
        return {
          outcome: Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_FOUND,
          post: toRpc(result.post),
          postId: result.post.postId,
          authorUserId: result.post.userId,
        };
      case 'UNRESOLVED_AUTHOR':
        return {
          outcome: Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_UNRESOLVED_AUTHOR,
          postId: result.postId,
          authorUserId: result.userId,
        };
      case 'NOT_FOUND':
        return { outcome: Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_NOT_FOUND };
      case 'FILTERED':
        return { outcome: Outcome.SUPERADMIN_POST_PUBLISHED_OUTCOME_FILTERED };
    }
  }
}
