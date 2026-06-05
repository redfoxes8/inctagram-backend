import { PresignedUrlRequest, FileTypeDomain, PresignedUrlResponse } from '../../domain/file.types';

export abstract class IStorageAdapter {
  abstract generateUploadUrl(dto: PresignedUrlRequest): Promise<PresignedUrlResponse>;

  abstract deleteFile(fileKey: string, fileType: FileTypeDomain): Promise<void>;

  abstract deleteFiles(bucket: string, fileKeys: string[]): Promise<void>;
}
