import { PostGrpcClient } from './post-grpc.client';
import { GetLatestPostsQueryDto } from '../api/dto/get-latest.query.dto';
import { PostRequestMapper } from '../api/mappers/post-request.mapper';
import { PostResponseMapper } from '../api/mappers/post-response.mapper';
import { PostViewType } from '../domain/post.types';
import { GetLatestPostsRequest, GetLatestPostsResponse } from '@inctagram/contracts/generated/post';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PostGrpcAdapter {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async getLatestPosts(dto: GetLatestPostsQueryDto): Promise<PostViewType[]> {
    const request: GetLatestPostsRequest = PostRequestMapper.toGetLatestPostsRequest({
      query: dto,
    });
    const response: GetLatestPostsResponse = await this.postGrpcClient.getLatestPosts(request);
    return PostResponseMapper.toViewType(response.posts);
  }
}
