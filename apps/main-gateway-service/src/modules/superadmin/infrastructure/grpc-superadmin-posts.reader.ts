import { Injectable } from '@nestjs/common';
import { PostGrpcClient } from '../../posts/infrastructure/post-grpc.client';
import { SuperadminPostsPageReader } from '../domain/superadmin-posts-page-reader.port';
import { SuperadminPostPublishedReader } from '../domain/superadmin-post-published-reader.port';
import type {
  SuperadminPostsFilter,
  SuperadminPostsPage,
  SuperadminPostPublishedInput,
  SuperadminPostPublishedView,
} from '../../../../../../libs/common/types/superadmin-posts';
import {
  normalizeSuperadminPostPublishedInput,
  normalizeSuperadminPostsInput,
} from '../../../../../../libs/common/src/validation/normalize-superadmin-posts-input';
import { encodeSuperadminPostsCursor } from '../../../../../../libs/common/src/pagination/superadmin-posts-cursor';
import {
  mapSuperadminPostsPage,
  mapSuperadminPostPublishedView,
} from './superadmin-posts-rpc.mapper';

@Injectable()
export class GrpcSuperadminPostsReader
  extends SuperadminPostsPageReader
  implements SuperadminPostPublishedReader
{
  constructor(private readonly client: PostGrpcClient) {
    super();
  }
  async findPage(
    input: SuperadminPostsFilter & { signal?: AbortSignal },
  ): Promise<SuperadminPostsPage> {
    const response: unknown = await this.client.getSuperadminPostsPage({
      request: {
        first: input.first,
        after: input.after ? encodeSuperadminPostsCursor(input.after) : undefined,
        searchUsername: input.searchUsername ?? undefined,
      },
      signal: input.signal ?? new AbortController().signal,
    });
    return mapSuperadminPostsPage({ response, filter: input });
  }
  async checkProjectionReady(input: {
    searchUsername: string | null;
    signal: AbortSignal;
  }): Promise<void> {
    await this.findPage({
      ...normalizeSuperadminPostsInput({ first: 1, searchUsername: input.searchUsername }),
      signal: input.signal,
    });
  }
  async readPublishedView(
    input: SuperadminPostPublishedInput & { signal: AbortSignal },
  ): Promise<SuperadminPostPublishedView> {
    const filter = normalizeSuperadminPostPublishedInput(input);
    const response: unknown = await this.client.getSuperadminPostPublishedView({
      request: {
        postId: filter.postId,
        searchUsername: filter.searchUsername ?? undefined,
        authorMissingConfirmed: filter.authorMissingConfirmed,
        authorUserId: filter.authorUserId ?? undefined,
      },
      signal: input.signal,
    });
    return mapSuperadminPostPublishedView({ response, filter });
  }
}
