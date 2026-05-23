import { PostViewType } from '../../domain/post.types';
import { Post } from '../../../../../../../libs/contracts/src';
import { dateToTimestamp } from '../utils/date-to-timestamp.helper';
import { GetLatestPostsResponse } from '../../../../../../../libs/contracts/src/generated/post';

export class GrpcResponseMapper {
  public static getLatestPostsResponse(posts: PostViewType[]): GetLatestPostsResponse {
    const mappedPosts: Post[] = posts.map((post) => {
      return {
        id: post.id,
        ownerId: post.ownerId,
        description: post.description,
        images: post.images,
        createdAt: dateToTimestamp(post.createdAt),
        updatedAt: dateToTimestamp(post.updatedAt),
      };
    });
    return { posts: mappedPosts };
  }
}
