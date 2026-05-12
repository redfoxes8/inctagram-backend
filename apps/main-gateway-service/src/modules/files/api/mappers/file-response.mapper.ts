import { type GenerateUploadUrlResponse } from '../../../../../../../libs/contracts/src';
import { GenerateUploadUrlResponseDto } from '../dto/generate-upload-url-response.dto';

export class FileResponseMapper {
  static toGenerateUploadUrlResponse(
    response: GenerateUploadUrlResponse,
  ): GenerateUploadUrlResponseDto {
    return {
      uploadUrl: response.uploadUrl,
      fileId: response.fileId,
    };
  }
}
