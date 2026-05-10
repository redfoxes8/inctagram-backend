import { Controller, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { GrpcMethod } from '@nestjs/microservices';
import { 
  type CreatePostRequest, 
  type CreatePostResponse, 
  type UpdatePostRequest, 
  type UpdatePostResponse, 
  type DeletePostRequest, 
  type DeletePostResponse,
} from '../../../../../../libs/contracts/src';
import { CreatePostCommand } from '../application/commands/create-post.command';
import { UpdatePostCommand } from '../application/commands/update-post.command';
import { DeletePostCommand } from '../application/commands/delete-post.command';

@Controller()
export class PostsController {
  private readonly logger = new Logger(PostsController.name);

  constructor(private readonly commandBus: CommandBus) {}

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
        fileIds: data.fileIds,
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
        fileIds: [], // В реальности нужно получить актуальные fileIds из БД
        createdAt: timestamp as any,
        updatedAt: timestamp as any,
      }
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
