import { PresignedUrlResult, FileType } from '../../domain/file.types';

export abstract class IStorageAdapter {
  abstract generateUploadUrl(
    userId: string,
    fileType: FileType,
    fileId: string,
    fileExtension: string,
  ): Promise<PresignedUrlResult>;

  abstract deleteFile(fileKey: string, fileType: FileType): Promise<void>;

  abstract deleteFiles(fileKeys: string[], fileType: FileType): Promise<void>;
}
