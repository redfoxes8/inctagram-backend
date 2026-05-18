import { type GenerateUploadUrlRequest } from '../../../../../../../libs/contracts/src';
import { GenerateUploadUrlDto } from '../dto/generate-upload-url.dto';

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
      fileExtension: params.dto.fileExtension,
      fileSize: params.dto.fileSize,
    };
  }
}
