import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  type CreatePostResponse,
  type GetPostsByUserIdResponse,
  type Post,
} from '../../../../../../../libs/contracts/src';
import {
  CreatePostResponseDto,
  GetFeedResponseDto,
  PostResponseDto,
} from '../dto/post-response.dto';

import { PostViewType } from '../dto/get-latest.dto';

type TimestampLike = {
  seconds: number;
  nanos: number;
};

export class PostResponseMapper {
  static toCreatePostResponse(response: CreatePostResponse): CreatePostResponseDto {
    if (!response.post) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Post service returned an empty post',
      });
    }

    return {
      post: this.toPostResponse(response.post),
    };
  }

  static toFeedResponse(response: GetPostsByUserIdResponse): GetFeedResponseDto {
    return {
      posts: response.posts.map((post) => this.toPostResponse(post)),
      nextCursor: response.nextCursor,
      hasMore: response.hasMore,
    };
  }

  private static toPostResponse(post: Post): PostResponseDto {
    return {
      id: post.id,
      ownerId: post.ownerId,
      description: post.description,
      images: post.images.map((image) => ({
        id: image.id,
        fileId: image.fileId,
        url: image.url,
        order: image.order,
      })),
      createdAt: this.timestampToIso(post.createdAt),
      updatedAt: this.timestampToIso(post.updatedAt),
    };
  }

  static toViewType(posts: Post[]): PostViewType[] {
    return posts.map((post) => {
      return {
        id: post.id,
        ownerId: post.ownerId,
        description: post.description,
        images: post.images,
        createdAt: this.timestampToDate(post.createdAt),
        updatedAt: this.timestampToDate(post.updatedAt),
      };
    });
  }

  private static timestampToDate(timestamp: TimestampLike | undefined): Date {
    if (!timestamp) {
      return new Date(0);
    }

    const milliseconds = timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1000000);

    return new Date(milliseconds);
  }

  private static timestampToIso(timestamp: TimestampLike | undefined): string {
    if (!timestamp) {
      return new Date(0).toISOString();
    }

    const milliseconds = timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1000000);

    return new Date(milliseconds).toISOString();
  }
}
