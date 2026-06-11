import { GenerateUploadUrlRequest, GetFileStatusRequest } from '@inctagram/contracts';
import { GenerateUrlForUploadDto } from '../../application/use-cases/dto/generate-url-for-upload.dto';
import { FileTypeDomain } from '../../domain/file.types';
import { GetFileStatusDto } from '../dto/get-file-status.dto';

export class GrpcRequestMapper {
  public static generateUrlForUploadRequest(
    requestData: GenerateUploadUrlRequest,
  ): GenerateUrlForUploadDto {
    const domainFileType: FileTypeDomain = this.mapGrpcFileTypeToDomain(requestData.fileType);
    return {
      ownerId: requestData.ownerId,
      fileType: domainFileType,
      fileSize: requestData.fileSize,
      fileExtension: requestData.fileExtension,
    };
  }

  public static getFileStatusRequest(requestData: GetFileStatusRequest): GetFileStatusDto {
    return {
      fileId: requestData.fileId,
    };
  }

  private static mapGrpcFileTypeToDomain(grpcType: number): FileTypeDomain {
    switch (grpcType) {
      case 1: // AVATAR
        return FileTypeDomain.AVATAR;
      case 2: // POST_IMAGE
        return FileTypeDomain.POST_IMAGE;
      case 3: // DOCUMENT
        return FileTypeDomain.DOCUMENT;
      case 4: // MEDIA
        return FileTypeDomain.MEDIA;
      default:
        return FileTypeDomain.POST_IMAGE;
    }
  }
}
