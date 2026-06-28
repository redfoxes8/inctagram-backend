import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PostResponseDto } from '../../api/dto/post-response.dto';
import { PostResponseMapper } from '../../api/mappers/post-response.mapper';
import { PostGrpcClient } from '../../infrastructure/post-grpc.client';

export class GetPostByIdQuery {
  constructor(public readonly postId: string) {}
}

const logger = new Logger('GetPostByIdQueryHandler');

@QueryHandler(GetPostByIdQuery)
export class GetPostByIdHandler implements IQueryHandler<GetPostByIdQuery, PostResponseDto> {
  constructor(private readonly postGrpcClient: PostGrpcClient) {}

  async execute(query: GetPostByIdQuery): Promise<PostResponseDto> {
    const { postId } = query;
    const startTime = Date.now();

    logger.debug(`GetPostByIdQueryHandler started: postId=${postId}`);

    let response;
    try {
      response = await this.postGrpcClient.getPostById({ postId });
    } catch (error: unknown) {
      const elapsed = Date.now() - startTime;
      logger.debug(`GetPostByIdQueryHandler completed: postId=${postId}, found=false, elapsed=${elapsed}ms`);
      throw error;
    }

    if (!response || !response.post) {
      const elapsed = Date.now() - startTime;
      logger.debug(`GetPostByIdQueryHandler completed: postId=${postId}, found=false, elapsed=${elapsed}ms`);
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Post not found',
      });
    }

    const elapsed = Date.now() - startTime;
    logger.debug(`GetPostByIdQueryHandler completed: postId=${postId}, found=true, elapsed=${elapsed}ms`);

    return PostResponseMapper.toSinglePostResponse(response);
  }
}
