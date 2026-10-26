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
import { GetPostsCountByUserIdHandler } from './application/queries/get-posts-count-by-user-id.handler';
import { GetPostByIdHandler } from './application/queries/get-post-by-id.handler';
import { PostQueryRepository } from './infrastructure/repositories/post.query-repository';
import { IPostQueryRepository } from './domain/interfaces/post-query-repository.interface';
import { OutboxRelayCron } from './infrastructure/outbox-relay.cron';
import { FileGrpcClient } from './infrastructure/grpc/file-grpc.client';
import { GrpcAdapter } from './infrastructure/grpc/grpc.adapter';
import { PostUserProfileConsumer } from './infrastructure/messaging/post-user-profile.consumer';
import { PostProfileBootstrapService } from './application/services/post-profile-bootstrap.service';
import {
  PostProfileConsumerState,
  PostProfileExport,
  PostProjectionProgress,
} from './application/ports/post-profile-bootstrap.port';
import { PostProfileExportClient } from './infrastructure/grpc/post-profile-export.client';
import { PostProjectionBootstrapRepository } from './infrastructure/repositories/post-projection-bootstrap.repository';
import { PostProfileBootstrapWorker } from './infrastructure/schedulers/post-profile-bootstrap.worker';
import { GetSuperadminPostsPageHandler } from './application/queries/get-superadmin-posts-page.query';
import { GetSuperadminPostPublishedViewHandler } from './application/queries/get-superadmin-post-published-view.query';
import {
  SuperadminPostsRead,
  SuperadminPostFiles,
} from './application/ports/superadmin-posts-read.port';
import { SuperadminPostImagesMapper } from './application/mappers/superadmin-post-images.mapper';
import { SuperadminPostsQueryRepository } from './infrastructure/repositories/superadmin-posts.query-repository';
import { SuperadminPostFilesAdapter } from './infrastructure/grpc/superadmin-post-files.adapter';
import { PostPublishedRelay } from './infrastructure/post-published.relay';

const Handlers = [
  CreatePostHandler,
  UpdatePostHandler,
  DeletePostHandler,
  GetUserPostsHandler,
  GetLatestPostsHandler,
  GetPostsCountByUserIdHandler,
  GetPostByIdHandler,
  GetSuperadminPostsPageHandler,
  GetSuperadminPostPublishedViewHandler,
];
const Repositories = [
  PostCommandRepository,
  PostQueryRepository,
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
    FileGrpcClient,
    GrpcAdapter,
    PostUserProfileConsumer,
    { provide: PostProfileConsumerState, useExisting: PostUserProfileConsumer },
    { provide: PostProfileExport, useClass: PostProfileExportClient },
    { provide: PostProjectionProgress, useClass: PostProjectionBootstrapRepository },
    PostProfileBootstrapService,
    PostProfileBootstrapWorker,
    { provide: SuperadminPostsRead, useClass: SuperadminPostsQueryRepository },
    { provide: SuperadminPostFiles, useClass: SuperadminPostFilesAdapter },
    SuperadminPostImagesMapper,
    PostPublishedRelay,
    // Outbox relay
    OutboxRelayCron,
  ],
  exports: [...Repositories, PostUserProfileConsumer],
})
export class PostsModule {}
