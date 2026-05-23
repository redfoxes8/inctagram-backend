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
import { GeneratePostImageUploadUrlDto } from './dto/generate-post-image-upload-url.dto';
import { GeneratePostImageUploadUrlResponseDto } from './dto/generate-post-image-upload-url-response.dto';
import { CreatePostCommand } from '../application/commands/create-post.command';
import { DeletePostCommand } from '../application/commands/delete-post.command';
import { GeneratePostImageUploadUrlCommand } from '../application/commands/generate-post-image-upload-url.command';
import { GetFeedQuery } from '../application/queries/get-feed.query';
import { GetLatestPostsQueryDto } from './dto/get-latest.query.dto';
import { GetLatestPostsQuery } from '../application/queries/get-latest-posts.query';
import { PostViewType } from '../domain/post.types';

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

  @Post('images/upload-url')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate signed upload URL for Post Image',
    description: `
      Requests a signed upload URL from File-MS explicitly for the \`POST_IMAGE\` domain type.
      The \`ownerId\` is securely extracted from the JWT token.
    `,
  })
  @ApiBody({ type: GeneratePostImageUploadUrlDto })
  @ApiOkResponse({
    description: 'Signed upload URL generated successfully',
    type: GeneratePostImageUploadUrlResponseDto,
  })
  @ApiDomainError(
    400,
    'Validation error',
    'Validation failed: Invalid file extension (must be one of the supported image formats like .jpeg, .png, .webp) OR file size exceeds the allowed limits.',
  )
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(503, 'File service unavailable', 'Service unavailable')
  async generateUploadUrl(
    @Body() dto: GeneratePostImageUploadUrlDto,
    @CurrentUserId() ownerId: string,
  ): Promise<GeneratePostImageUploadUrlResponseDto> {
    return this.commandBus.execute(new GeneratePostImageUploadUrlCommand({ dto, ownerId }));
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

  @Get('latest')
  @ApiOperation({
    summary: 'Get latest posts',
    description: 'Returns latest posts through Post-MS.',
  })
  @ApiOkResponse({
    description: 'Return posts with images urls succsessfully',
  })
  @ApiDomainError(503, 'Post service unavailable', 'Service unavailable')
  async getLatestPosts(@Query() query: GetLatestPostsQueryDto): Promise<PostViewType[]> {
    return this.queryBus.execute(new GetLatestPostsQuery(query));
  }
}
