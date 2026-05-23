import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PostsController } from './api/posts.controller';
import { CreatePostHandler } from './application/commands/create-post.command';
import { DeletePostHandler } from './application/commands/delete-post.command';
import { GetFeedHandler } from './application/queries/get-feed.query';
import { GeneratePostImageUploadUrlHandler } from './application/commands/generate-post-image-upload-url.command';
import { PostGrpcClientModule } from './infrastructure/post-grpc-client.module';
import { FileGrpcClientModule } from '../files/infrastructure/file-grpc-client.module';
import { GetLatestPostsHandler } from './application/queries/get-latest-posts.query';
import { PostGrpcAdapter } from './infrastructure/post-grpc.adapter';
import { IPostGrpcAdapter } from './infrastructure/interfaces/post-grpc-adapter.interface';

const commandHandlers = [CreatePostHandler, DeletePostHandler, GeneratePostImageUploadUrlHandler];
const queryHandlers = [GetFeedHandler, GetLatestPostsHandler];
const adapters = [
  {
    provide: IPostGrpcAdapter,
    useClass: PostGrpcAdapter,
  },
];
@Module({
  imports: [CqrsModule, PostGrpcClientModule, FileGrpcClientModule],
  controllers: [PostsController],
  providers: [...commandHandlers, ...queryHandlers, ...adapters],
})
export class PostsModule {}
