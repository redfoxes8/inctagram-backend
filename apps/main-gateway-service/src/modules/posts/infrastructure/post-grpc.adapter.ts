import { PostGrpcClient } from './post-grpc.client';
import { GetLatestPostsQueryDto, PostViewType } from '../api/dto/get-latest.dto';
import { PostRequestMapper } from '../api/mappers/post-request.mapper';
import { PostResponseMapper } from '../api/mappers/post-response.mapper';
import {
  GetLatestPostsRequest,
  GetLatestPostsResponse,
  GetPostsCountByUserIdRequest,
  GetPostsCountByUserIdResponse,
} from '@inctagram/contracts/generated/post';
import { Injectable } from '@nestjs/common';

import { IPostGrpcAdapter } from './interfaces/post-grpc-adapter.interface';

@Injectable()
export class PostGrpcAdapter implements IPostGrpcAdapter {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async getLatestPosts(dto: GetLatestPostsQueryDto): Promise<PostViewType[] | null> {
    const request: GetLatestPostsRequest = PostRequestMapper.toGetLatestPosts({
      query: dto,
    });
    const response: GetLatestPostsResponse = await this.postGrpcClient.getLatestPosts(request);
    return PostResponseMapper.toViewType(response.posts);
  }

  async getPostsCount(userId: string) {
    const request: GetPostsCountByUserIdRequest = PostRequestMapper.toGetPostsCount({
      userId,
    });
    const response: GetPostsCountByUserIdResponse =
      await this.postGrpcClient.getPostsCount(request);
    return PostResponseMapper.getPostsCount(response);
  }
}
