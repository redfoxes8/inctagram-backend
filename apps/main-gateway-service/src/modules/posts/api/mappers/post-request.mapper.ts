import {
  type CreatePostRequest,
  type DeletePostRequest,
  type GetPostsByUserIdRequest,
} from '../../../../../../../libs/contracts/src';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { GetFeedQueryDto } from '../dto/get-feed-query.dto';
import { GetLatestPostsQueryDto } from '../dto/get-latest.dto';
import { GetLatestPostsRequest } from '@inctagram/contracts/generated/post';

type ToCreatePostRequestParams = {
  dto: CreatePostDto;
  ownerId: string;
};

type ToGetPostsByUserIdRequestParams = {
  query: GetFeedQueryDto;
  ownerId: string;
};

type ToDeletePostRequestParams = {
  postId: string;
  ownerId: string;
};

type ToGetLatestPostsRequestParams = {
  query: GetLatestPostsQueryDto;
};

export class PostRequestMapper {
  static toCreatePostRequest(params: ToCreatePostRequestParams): CreatePostRequest {
    return {
      ownerId: params.ownerId,
      description: params.dto.description,
      fileIds: params.dto.fileIds,
    };
  }

  static toGetPostsByUserIdRequest(
    params: ToGetPostsByUserIdRequestParams,
  ): GetPostsByUserIdRequest {
    return {
      ownerId: params.ownerId,
      cursor: params.query.cursor,
      pageSize: params.query.pageSize ?? 8,
    };
  }

  static toDeletePostRequest(params: ToDeletePostRequestParams): DeletePostRequest {
    return {
      postId: params.postId,
      ownerId: params.ownerId,
    };
  }

  static toUpdatePostRequest(params: { postId: string; dto: UpdatePostDto; ownerId: string }) {
    return {
      postId: params.postId,
      ownerId: params.ownerId,
      description: params.dto.description,
    };
  }

  static toGetLatestPostsRequest(params: ToGetLatestPostsRequestParams): GetLatestPostsRequest {
    return {
      limit: params.query.limit ?? 4,
    };
  }
}
