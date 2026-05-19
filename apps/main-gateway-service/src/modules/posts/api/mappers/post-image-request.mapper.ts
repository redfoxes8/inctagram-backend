import { FileType, type GenerateUploadUrlRequest } from '../../../../../../../libs/contracts/src';
import { GeneratePostImageUploadUrlDto } from '../dto/generate-post-image-upload-url.dto';

type ToGeneratePostImageUploadUrlRequestParams = {
  dto: GeneratePostImageUploadUrlDto;
  ownerId: string;
};

export class PostImageRequestMapper {
  static toGenerateUploadUrlRequest(
    params: ToGeneratePostImageUploadUrlRequestParams,
  ): GenerateUploadUrlRequest {
    return {
      ownerId: params.ownerId,
      fileExtension: params.dto.fileExtension,
      fileSize: params.dto.fileSize,
      fileType: FileType.POST_IMAGE, // Explicit domain mapping
    };
  }
}
