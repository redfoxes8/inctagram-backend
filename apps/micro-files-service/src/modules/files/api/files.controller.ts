import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { GrpcMethod } from '@nestjs/microservices';
import { 
  FileType as GrpcFileType
} from '../../../../../../libs/contracts/src';
import type { 
  GenerateUploadUrlRequest, 
  GenerateUploadUrlResponse
} from '../../../../../../libs/contracts/src';
import { GenerateUploadUrlCommand } from '../application/use-cases/generate-upload-url.use-case';
import { FileType } from '../domain/file.types';

@Controller()
export class FilesController {
  constructor(private readonly commandBus: CommandBus) {}

  @GrpcMethod('FileService', 'GenerateUploadUrl')
  async generateUploadUrl(data: GenerateUploadUrlRequest): Promise<GenerateUploadUrlResponse> {
    // Маппинг gRPC типа в доменный тип. 
    // На данном этапе хардкодим POST_IMAGE, так как gRPC контракт (JPEG/PNG) 
    // пока не передает категорию (avatar/post/etc).
    const domainFileType = FileType.POST_IMAGE;
    
    // В будущем fileName можно получать из метаданных или доп. полей
    const fileName = `upload_${Date.now()}.${this.getExtensionFromGrpcType(data.fileType)}`;

    const result = await this.commandBus.execute(
      new GenerateUploadUrlCommand(data.ownerId, fileName, domainFileType)
    );

    return {
      uploadUrl: result.uploadUrl,
      fileId: result.fileId,
      uploadFields: Object.entries(result.uploadFields).map(([name, value]) => ({ 
        name, 
        value: String(value) 
      })),
    };
  }

  private getExtensionFromGrpcType(type: GrpcFileType): string {
    switch (type) {
      case GrpcFileType.PNG: return 'png';
      case GrpcFileType.JPEG: 
      default: return 'jpg';
    }
  }
}
