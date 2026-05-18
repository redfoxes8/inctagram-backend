import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { FilesConfigModule } from '../../core/files-config.module';
import { RabbitFileEventAdapter } from './infrastructure/rabbit-file-event.adapter';
import { GenerateUrlForUploadUseCase } from './application/use-cases/generate-url-for-upload.use-case';
import { FileUploadedUseCase } from './application/use-cases/file-uploaded.use-case';
import { AwsSqsAdapter } from './infrastructure/aws/aws-sqs.adapter';
import { IStorageAdapter } from './application/interfaces/storage-adapter.interface';
import { FilesRepository } from './infrastructure/files.repository';
import { IFilesRepository } from './domain/interfaces/files.repository.interface';
import { FilesController } from './api/files.controller';
import { PrismaService } from '../../core/prisma/prisma.service';
import { IAsyncEventPublisher } from './application/interfaces/event-publisher.interface';
import { AwsStorageAdapter } from './infrastructure/aws/aws-storage.adapter';

const repositories = [
  {
    provide: IFilesRepository,
    useClass: FilesRepository,
  },
];
const adapters = [
  {
    provide: IStorageAdapter,
    useClass: AwsStorageAdapter,
  },
  {
    provide: IAsyncEventPublisher,
    useClass: RabbitFileEventAdapter,
  },
];

const useCases = [GenerateUrlForUploadUseCase, FileUploadedUseCase];
@Module({
  imports: [CqrsModule, FilesConfigModule],
  controllers: [FilesController],
  providers: [
    PrismaService,
    ...useCases,
    ...repositories,
    ...adapters,
    RabbitFileEventAdapter,
    AwsSqsAdapter,
  ],
  exports: [IStorageAdapter, IFilesRepository, RabbitFileEventAdapter],
})
export class FilesModule {}
