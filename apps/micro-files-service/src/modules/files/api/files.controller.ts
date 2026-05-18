import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type { GenerateUploadUrlRequest, GenerateUploadUrlResponse } from '@inctagram/contracts';
import { CommandBus } from '@nestjs/cqrs';
import { GenerateUrlForUploadCommand } from '../application/use-cases/generate-url-for-upload.use-case';
import { FileType } from '../domain/file.types';

@Controller()
export class FilesController {
  constructor(private readonly commandBus: CommandBus) {}

  @GrpcMethod('FileService', 'GenerateUploadUrl')
  async generateUploadUrl(data: GenerateUploadUrlRequest): Promise<GenerateUploadUrlResponse> {
    const domainFileType = this.mapGrpcFileTypeToDomain(data.fileType);
    return await this.commandBus.execute(
      new GenerateUrlForUploadCommand(data, domainFileType),
    );
  }

  private mapGrpcFileTypeToDomain(grpcType: number): FileType {
    switch (grpcType) {
      case 1: // AVATAR
        return FileType.AVATAR;
      case 2: // POST_IMAGE
        return FileType.POST_IMAGE;
      case 3: // DOCUMENT
        return FileType.DOCUMENT;
      case 4: // MEDIA
        return FileType.MEDIA;
      default:
        return FileType.POST_IMAGE;
    }
  }
}

