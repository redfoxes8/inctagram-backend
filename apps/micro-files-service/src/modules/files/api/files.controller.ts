import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type { GenerateUploadUrlRequest, GenerateUploadUrlResponse } from '@inctagram/contracts';
import { CommandBus } from '@nestjs/cqrs';
import { GenerateUrlForUploadCommand } from '../application/use-cases/generate-url-for-upload.use-case';
import { FileType } from '../domain/file.types';

@Controller()
export class FilesController {
  constructor(@Inject(CommandBus) private commandBus: CommandBus) {}

  @GrpcMethod('FileService', 'GenerateUploadUrl')
  async generateUploadUrl(data: GenerateUploadUrlRequest): Promise<GenerateUploadUrlResponse> {
    return await this.commandBus.execute(
      new GenerateUrlForUploadCommand(data, FileType.POST_IMAGE),
    );
  }
}
