import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { 
  INCTAGRAM_FILE_V1_PACKAGE_NAME 
} from '../../../../../libs/contracts/src';
import { PostsController } from './api/posts.controller';
import { PostCommandRepository } from './infrastructure/repositories/post.command-repository';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PostConfig } from '../../core/post.config';
import { PostConfigModule } from '../../core/post-config.module';
import { CreatePostHandler } from './application/commands/create-post.handler';
import { UpdatePostHandler } from './application/commands/update-post.handler';
import { DeletePostHandler } from './application/commands/delete-post.handler';

const Handlers = [CreatePostHandler, UpdatePostHandler, DeletePostHandler];
const Repositories = [PostCommandRepository];

@Module({
  imports: [
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
  ],
  exports: [...Repositories],
})
export class PostsModule {}
