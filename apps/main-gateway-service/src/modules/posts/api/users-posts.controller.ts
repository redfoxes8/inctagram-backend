import { Controller, Get, Inject, Logger, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { GetFeedQueryDto } from './dto/get-feed-query.dto';
import { GetFeedResponseDto } from './dto/post-response.dto';
import { GetUserPostsQuery } from '../application/queries/get-user-posts.query';

const logger = new Logger('UsersPostsController');

@ApiTags('Posts')
@Controller('users')
export class UsersPostsController {
  constructor(@Inject(QueryBus) private readonly queryBus: QueryBus) {}

  @Get(':userId/posts')
  @ApiOperation({
    summary: 'Get user posts',
    description: 'Returns posts of a specific user with cursor-based pagination.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User identifier',
    example: 'user-id',
  })
  @ApiOkResponse({
    description: 'User posts retrieved successfully',
    type: GetFeedResponseDto,
  })
  @ApiDomainError(404, 'User not found', 'User was not found')
  @ApiDomainError(503, 'Post service unavailable', 'Service unavailable')
  public async getUserPosts(
    @Param('userId') userId: string,
    @Query() query: GetFeedQueryDto,
  ): Promise<GetFeedResponseDto> {
    logger.debug(`Incoming request: userId=${userId}, cursor=${query.cursor}, pageSize=${query.pageSize}`);
    return this.queryBus.execute(new GetUserPostsQuery({ userId, query }));
  }
}
