import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { GetFeedQueryDto } from '../../api/dto/get-feed-query.dto';
import { GetFeedResponseDto } from '../../api/dto/post-response.dto';
import { PostRequestMapper } from '../../api/mappers/post-request.mapper';
import { PostResponseMapper } from '../../api/mappers/post-response.mapper';
import { PostGrpcClient } from '../../infrastructure/post-grpc.client';

type GetFeedQueryParams = {
  query: GetFeedQueryDto;
  ownerId: string;
};

export class GetFeedQuery {
  constructor(public readonly params: GetFeedQueryParams) {}
}

@QueryHandler(GetFeedQuery)
export class GetFeedHandler implements IQueryHandler<GetFeedQuery, GetFeedResponseDto> {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(query: GetFeedQuery): Promise<GetFeedResponseDto> {
    const request = PostRequestMapper.toGetPostsByUserIdRequest(query.params);
    const response = await this.postGrpcClient.getPostsByUserId(request);

    return PostResponseMapper.toFeedResponse(response);
  }
}
