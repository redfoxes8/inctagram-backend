import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { FilesConfigModule } from '../../core/files-config.module';
import { AwsStorageAdapter } from '../files/infrastructure/aws-storage.adapter';
import { IStorageAdapter } from './application/interfaces/storage-adapter.interface';
import { FilesRepository } from './infrastructure/files.repository';
import { IFilesRepository } from './domain/interfaces/files.repository.interface';
import { GenerateUploadUrlUseCase } from './application/use-cases/generate-upload-url.use-case';
import { FilesController } from './api/files.controller';
import { PrismaService } from '../../core/prisma/prisma.service';

const useCases = [GenerateUploadUrlUseCase];
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
];

@Module({
  imports: [CqrsModule, FilesConfigModule],
  controllers: [FilesController],
  providers: [PrismaService, ...useCases, ...repositories, ...adapters],
  exports: [IStorageAdapter, IFilesRepository],
})
export class FilesModule {}
