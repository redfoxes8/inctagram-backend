import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { GetFeedQueryDto } from './dto/get-feed-query.dto';
import { CreatePostResponseDto, GetFeedResponseDto } from './dto/post-response.dto';
import { CreatePostCommand } from '../application/commands/create-post.command';
import { DeletePostCommand } from '../application/commands/delete-post.command';
import { GetFeedQuery } from '../application/queries/get-feed.query';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create post',
    description: 'Creates a post through Post-MS. The ownerId is taken from JWT only.',
  })
  @ApiBody({ type: CreatePostDto })
  @ApiCreatedResponse({ description: 'Post created successfully', type: CreatePostResponseDto })
  @ApiDomainError(400, 'Validation error', 'Validation failed')
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(503, 'Post service unavailable', 'Service unavailable')
  async createPost(
    @Body() dto: CreatePostDto,
    @CurrentUserId() ownerId: string,
  ): Promise<CreatePostResponseDto> {
    return this.commandBus.execute(new CreatePostCommand({ dto, ownerId }));
  }

  @Get('feed')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user feed',
    description:
      'Returns current user posts through Post-MS. Cursor is opaque and passed to Post-MS without parsing.',
  })
  @ApiOkResponse({ description: 'Posts returned successfully', type: GetFeedResponseDto })
  @ApiDomainError(400, 'Validation error', 'Validation failed')
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(503, 'Post service unavailable', 'Service unavailable')
  async getFeed(
    @Query() query: GetFeedQueryDto,
    @CurrentUserId() ownerId: string,
  ): Promise<GetFeedResponseDto> {
    return this.queryBus.execute(new GetFeedQuery({ query, ownerId }));
  }

  @Delete(':postId')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete post',
    description:
      'Deletes a post through Post-MS. Post-MS makes the final ownership decision using ownerId from JWT.',
  })
  @ApiParam({
    name: 'postId',
    description: 'Post identifier',
    example: 'post-id',
  })
  @ApiNoContentResponse({ description: 'Post deleted successfully' })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(403, 'Forbidden to delete another user post', 'Forbidden')
  @ApiDomainError(404, 'Post not found', 'Not Found')
  @ApiDomainError(503, 'Post service unavailable', 'Service unavailable')
  async deletePost(
    @Param('postId') postId: string,
    @CurrentUserId() ownerId: string,
  ): Promise<void> {
    await this.commandBus.execute(new DeletePostCommand({ postId, ownerId }));
  }
}
