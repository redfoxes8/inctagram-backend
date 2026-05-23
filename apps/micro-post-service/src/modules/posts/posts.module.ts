import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { INCTAGRAM_FILE_V1_PACKAGE_NAME } from '../../../../../libs/contracts/src';
import { PostsController } from './api/posts.controller';
import { PostCommandRepository } from './infrastructure/repositories/post.command-repository';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PostConfig } from '../../core/post.config';
import { PostConfigModule } from '../../core/post-config.module';
import { CreatePostHandler } from './application/commands/create-post.handler';
import { UpdatePostHandler } from './application/commands/update-post.handler';
import { DeletePostHandler } from './application/commands/delete-post.handler';
import { GetUserPostsHandler } from './application/queries/get-user-posts.handler';
import { GetLatestPostsHandler } from './application/queries/get-latest-posts.query';
import { PostQueryRepository } from './infrastructure/repositories/post.query-repository';
import { IPostQueryRepository } from './domain/interfaces/post-query-repository.interface';
import { OutboxRelayCron } from './infrastructure/outbox-relay.cron';

const Handlers = [
  CreatePostHandler,
  UpdatePostHandler,
  DeletePostHandler,
  GetUserPostsHandler,
  GetLatestPostsHandler,
];
const Repositories = [
  PostCommandRepository,
  { provide: IPostQueryRepository, useClass: PostQueryRepository },
];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PostConfigModule,
    CqrsModule,
    ClientsModule.registerAsync([
      {
        name: 'FILE_SERVICE_PACKAGE',
        imports: [PostConfigModule],
        inject: [PostConfig],
        useFactory: (config: PostConfig) => ({
          transport: Transport.GRPC,
          options: {
            package: INCTAGRAM_FILE_V1_PACKAGE_NAME,
            protoPath: join(process.cwd(), 'libs/contracts/src/proto/file.proto'),
            url: config.fileServiceGrpcUrl,
          },
        }),
      },
    ]),
  ],
  controllers: [PostsController],
  providers: [
    PrismaService,
    ...Repositories,
    ...Handlers,
    // Outbox relay
    OutboxRelayCron,
  ],
  exports: [...Repositories],
})
export class PostsModule {}
