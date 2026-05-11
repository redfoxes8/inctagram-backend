import { Controller, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GrpcMethod } from '@nestjs/microservices';
import { 
  type CreatePostRequest, 
  type CreatePostResponse, 
  type UpdatePostRequest, 
  type UpdatePostResponse, 
  type DeletePostRequest, 
  type DeletePostResponse,
  type GetPostsByUserIdRequest,
  type GetPostsByUserIdResponse,
} from '../../../../../../libs/contracts/src';
import { CreatePostCommand } from '../application/commands/create-post.command';
import { UpdatePostCommand } from '../application/commands/update-post.command';
import { DeletePostCommand } from '../application/commands/delete-post.command';
import { GetUserPostsQuery } from '../application/queries/get-user-posts.query';

@Controller()
export class PostsController {
  private readonly logger = new Logger(PostsController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @GrpcMethod('PostService', 'CreatePost')
  async createPost(data: CreatePostRequest): Promise<CreatePostResponse> {
    this.logger.log(`[Post MS] gRPC CreatePost received for user: ${data.ownerId}`);
    
    const postId = await this.commandBus.execute(new CreatePostCommand({
      ownerId: data.ownerId,
      description: data.description,
      images: data.fileIds.map(fileId => ({ fileId })),
    }));

    const now = new Date();
    const timestamp = {
      seconds: Math.floor(now.getTime() / 1000),
      nanos: (now.getTime() % 1000) * 1000000,
    };

    return {
      post: {
        id: postId,
        ownerId: data.ownerId,
        description: data.description,
        images: data.fileIds.map((id, index) => ({ id: '', fileId: id, url: '', order: index })),
        createdAt: timestamp as any,
        updatedAt: timestamp as any,
      }
    };
  }

  @GrpcMethod('PostService', 'UpdatePost')
  async updatePost(data: UpdatePostRequest): Promise<UpdatePostResponse> {
    this.logger.log(`[Post MS] gRPC UpdatePost received for post: ${data.postId}`);

    await this.commandBus.execute(new UpdatePostCommand(
      data.postId,
      data.ownerId,
      data.description,
    ));

    const now = new Date();
    const timestamp = {
      seconds: Math.floor(now.getTime() / 1000),
      nanos: (now.getTime() % 1000) * 1000000,
    };

    return {
      post: {
        id: data.postId,
        ownerId: data.ownerId,
        description: data.description,
        images: [], // В реальности нужно получить актуальные картинки из БД
        createdAt: timestamp as any,
        updatedAt: timestamp as any,
      }
    };
  }

  @GrpcMethod('PostService', 'GetPostsByUserId')
  async getPostsByUserId(data: GetPostsByUserIdRequest): Promise<GetPostsByUserIdResponse> {
    this.logger.log(`[Post MS] gRPC GetPostsByUserId received for user: ${data.ownerId}`);

    const result = await this.queryBus.execute(new GetUserPostsQuery(
      data.ownerId,
      data.pageSize || 8,
      data.cursor,
    ));

    return {
      posts: result.posts.map(post => ({
        id: post.id,
        ownerId: post.ownerId,
        description: post.description,
        images: post.images,
        createdAt: {
          seconds: Math.floor(post.createdAt.getTime() / 1000),
          nanos: (post.createdAt.getTime() % 1000) * 1000000,
        } as any,
        updatedAt: {
          seconds: Math.floor(post.updatedAt.getTime() / 1000),
          nanos: (post.updatedAt.getTime() % 1000) * 1000000,
        } as any,
      })),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  @GrpcMethod('PostService', 'DeletePost')
  async deletePost(data: DeletePostRequest): Promise<DeletePostResponse> {
    this.logger.log(`[Post MS] gRPC DeletePost received for post: ${data.postId}`);

    await this.commandBus.execute(new DeletePostCommand(
      data.postId,
      data.ownerId,
    ));

    return { success: true };
  }

  @GrpcMethod('PostService', 'Ping')
  ping(data: any): any {
    this.logger.log(`[Post MS] gRPC Ping received: ${data.message}`);

    return {
      reply: `Pong from Post-MS! Received: [${data.message}]`,
    };
  }
}
