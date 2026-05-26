import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { FilesConfigModule } from '../../core/files-config.module';
import { RabbitFileEventAdapter } from './infrastructure/event-publishers/rabbit-file-event.adapter';
import { GenerateUrlForUploadUseCase } from './application/use-cases/generate-url-for-upload.use-case';
import { FileUploadedUseCase } from './application/use-cases/file-uploaded.use-case';
import { DeleteFilesUseCase } from './application/use-cases/delete-files.use-case';
import { AwsSqsAdapter } from './infrastructure/aws/aws-sqs.adapter';
import { IStorageAdapter } from './infrastructure/interfaces/storage-adapter.interface';
import { FilesRepository } from './infrastructure/repositories/files.repository';
import { IFilesRepository } from './domain/interfaces/files.repository.interface';
import { FilesController } from './api/files.controller';
import { FilesMessageController } from './api/files.message.controller';
import { PrismaService } from '../../core/prisma/prisma.service';
import { IAsyncEventPublisher } from './infrastructure/interfaces/event-publisher.interface';
import { AwsStorageAdapter } from './infrastructure/aws/aws-storage.adapter';
import { IFilesQueryRepository } from './domain/interfaces/files.query-repository.interface';
import { FilesQueryRepository } from './infrastructure/repositories/files.query-repository';
import { GetFilesDataHandler } from './application/queries/get-files-data.query';
import { GolevelupFileEventAdapter } from './infrastructure/event-publishers/golevelup-file-event.adapter';

const repositories = [
  {
    provide: IFilesRepository,
    useClass: FilesRepository,
  },
  {
    provide: IFilesQueryRepository,
    useClass: FilesQueryRepository,
  },
];
const adapters = [
  {
    provide: IStorageAdapter,
    useClass: AwsStorageAdapter,
  },
  {
    provide: IAsyncEventPublisher,
    useClass: GolevelupFileEventAdapter,
  },
];

const queryHandlers = [GetFilesDataHandler];

const useCases = [GenerateUrlForUploadUseCase, FileUploadedUseCase, DeleteFilesUseCase];
@Module({
  imports: [CqrsModule, FilesConfigModule],
  controllers: [FilesController, FilesMessageController],
  providers: [
    PrismaService,
    ...useCases,
    ...repositories,
    ...adapters,
    ...queryHandlers,
    RabbitFileEventAdapter,
    AwsSqsAdapter,
  ],
  exports: [IStorageAdapter, IFilesRepository, RabbitFileEventAdapter],
})
export class FilesModule {}
