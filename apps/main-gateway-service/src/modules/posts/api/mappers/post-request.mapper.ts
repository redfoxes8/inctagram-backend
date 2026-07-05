import {
  type CreatePostRequest,
  type DeletePostRequest,
  type GetPostsByUserIdRequest,
  type GetPostsCountRequest,
} from '../../../../../../../libs/contracts/src';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { GetFeedQueryDto } from '../dto/get-feed-query.dto';
import { GetLatestPostsQueryDto } from '../dto/get-latest.dto';
import { GetLatestPostsRequest } from '@inctagram/contracts/generated/post';

type ToCreatePostParams = {
  dto: CreatePostDto;
  ownerId: string;
};

type ToGetPostsByUserIdParams = {
  query: GetFeedQueryDto;
  ownerId: string;
};

type ToDeletePostParams = {
  postId: string;
  ownerId: string;
};

type ToGetLatestPostsParams = {
  query: GetLatestPostsQueryDto;
};

type ToGetPostsCountParams = {
  userId: string;
};

export class PostRequestMapper {
  static toCreatePost(params: ToCreatePostParams): CreatePostRequest {
    return {
      ownerId: params.ownerId,
      description: params.dto.description,
      fileIds: params.dto.fileIds,
    };
  }

  static toGetPostsByUserId(params: ToGetPostsByUserIdParams): GetPostsByUserIdRequest {
    return {
      ownerId: params.ownerId,
      cursor: params.query.cursor,
      pageSize: params.query.pageSize ?? 8,
    };
  }

  static toDeletePost(params: ToDeletePostParams): DeletePostRequest {
    return {
      postId: params.postId,
      ownerId: params.ownerId,
    };
  }

  static toUpdatePost(params: { postId: string; dto: UpdatePostDto; ownerId: string }) {
    return {
      postId: params.postId,
      ownerId: params.ownerId,
      description: params.dto.description,
    };
  }

  static toGetLatestPosts(params: ToGetLatestPostsParams): GetLatestPostsRequest {
    return {
      limit: params.query.limit ?? 4,
    };
  }

  static toGetPostsCount(params: ToGetPostsCountParams): GetPostsCountRequest {
    return {
      ownerId: params.userId,
    };
  }
}
