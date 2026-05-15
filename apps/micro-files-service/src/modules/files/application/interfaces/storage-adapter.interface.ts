import { PresignedUrlResult, FileType } from '../../domain/file.types';

export abstract class IStorageAdapter {
  abstract generateUploadUrl(
    userId: string,
    fileName: string,
    fileType: FileType,
  ): Promise<PresignedUrlResult>;

  abstract deleteFile(fileKey: string, fileType: FileType): Promise<void>;
}
