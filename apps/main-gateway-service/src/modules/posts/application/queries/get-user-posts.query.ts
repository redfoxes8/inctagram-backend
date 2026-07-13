import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { GetFeedQueryDto } from '../../api/dto/get-feed-query.dto';
import { GetFeedResponseDto } from '../../api/dto/post-response.dto';
import { PostResponseMapper } from '../../api/mappers/post-response.mapper';
import { PostGrpcClient } from '../../infrastructure/post-grpc.client';

type GetUserPostsParams = {
  userId: string;
  query: GetFeedQueryDto;
};

export class GetUserPostsQuery {
  constructor(public readonly params: GetUserPostsParams) {}
}

const logger = new Logger('GetUserPostsQueryHandler');

@QueryHandler(GetUserPostsQuery)
export class GetUserPostsHandler implements IQueryHandler<GetUserPostsQuery, GetFeedResponseDto> {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(query: GetUserPostsQuery): Promise<GetFeedResponseDto> {
    const { userId, query: queryDto } = query.params;
    const { cursor, pageSize } = queryDto;
    const startTime = Date.now();

    logger.debug(
      `GetUserPostsQueryHandler started: userId=${userId}, cursor=${cursor}, pageSize=${pageSize}`,
    );

    let response;
    try {
      response = await this.postGrpcClient.getPostsByUserId({
        ownerId: userId,
        cursor,
        pageSize: pageSize ?? 8,
      });
    } catch (error: unknown) {
      const elapsed = Date.now() - startTime;
      logger.debug(
        `GetUserPostsQueryHandler completed with error: userId=${userId}, cursor=${cursor}, pageSize=${pageSize}, ` +
          `elapsedTime=${elapsed}ms`,
      );
      throw error;
    }

    const mapped = PostResponseMapper.toFeedResponse(response);
    const elapsed = Date.now() - startTime;

    logger.debug(
      `GetUserPostsQueryHandler completed: userId=${userId}, cursor=${cursor}, pageSize=${pageSize}, ` +
        `receivedItemCount=${mapped.posts.length}, nextCursorExists=${!!mapped.nextCursor}, elapsedTime=${elapsed}ms`,
    );

    return mapped;
  }
}
