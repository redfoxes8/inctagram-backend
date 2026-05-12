import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { FilesController } from './api/files.controller';
import { GenerateUploadUrlHandler } from './application/commands/generate-upload-url.command';
import { FileGrpcClientModule } from './infrastructure/file-grpc-client.module';

const commandHandlers = [GenerateUploadUrlHandler];

@Module({
  imports: [CqrsModule, FileGrpcClientModule],
  controllers: [FilesController],
  providers: [...commandHandlers],
})
export class FilesModule {}
