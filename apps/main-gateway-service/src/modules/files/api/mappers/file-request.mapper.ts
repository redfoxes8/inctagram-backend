import { FileType, type GenerateUploadUrlRequest } from '../../../../../../../libs/contracts/src';
import { GenerateUploadUrlDto, UploadFileType } from '../dto/generate-upload-url.dto';

type ToGenerateUploadUrlRequestParams = {
  dto: GenerateUploadUrlDto;
  ownerId: string;
};

export class FileRequestMapper {
  static toGenerateUploadUrlRequest(
    params: ToGenerateUploadUrlRequestParams,
  ): GenerateUploadUrlRequest {
    return {
      ownerId: params.ownerId,
      fileType: this.toGrpcFileType(params.dto.fileType),
      fileSize: params.dto.fileSize,
    };
  }

  private static toGrpcFileType(fileType: UploadFileType): FileType {
    switch (fileType) {
      case UploadFileType.PNG:
        return FileType.PNG;
      case UploadFileType.JPEG:
      default:
        return FileType.JPEG;
    }
  }
}
