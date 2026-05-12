import {
  type CreatePostRequest,
  type DeletePostRequest,
  type GetPostsByUserIdRequest,
} from '../../../../../../../libs/contracts/src';
import { CreatePostDto } from '../dto/create-post.dto';
import { GetFeedQueryDto } from '../dto/get-feed-query.dto';

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
}
