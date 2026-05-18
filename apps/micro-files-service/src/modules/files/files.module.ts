import { Module } from '@nestjs/common';
import { FilesConfigModule } from '../../core/files-config.module';
import { AwsStorageAdapter } from './infrastructure/aws/aws-storage.adapter';
import { RabbitFileEventAdapter } from './infrastructure/rabbit-file-event.adapter';
import { GenerateUrlForUploadUseCase } from './application/use-cases/generate-url-for-upload.use-case';
import { FileUploadedUseCase } from './application/use-cases/file-uploaded.use-case';
import { AwsSqsAdapter } from './infrastructure/aws/aws-sqs.adapter';

const useCases = [GenerateUrlForUploadUseCase, FileUploadedUseCase];
@Module({
  imports: [FilesConfigModule],
  providers: [...useCases, AwsStorageAdapter, RabbitFileEventAdapter, AwsSqsAdapter],
  exports: [AwsStorageAdapter, RabbitFileEventAdapter],
})
export class FilesModule {}
