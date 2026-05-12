import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PostsController } from './api/posts.controller';
import { CreatePostHandler } from './application/commands/create-post.command';
import { DeletePostHandler } from './application/commands/delete-post.command';
import { GetFeedHandler } from './application/queries/get-feed.query';
import { PostGrpcClientModule } from './infrastructure/post-grpc-client.module';

const commandHandlers = [CreatePostHandler, DeletePostHandler];
const queryHandlers = [GetFeedHandler];

@Module({
  imports: [CqrsModule, PostGrpcClientModule],
  controllers: [PostsController],
  providers: [...commandHandlers, ...queryHandlers],
})
export class PostsModule {}
